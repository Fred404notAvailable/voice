import argparse
import asyncio
import json
import struct
import sys
import time
import numpy as np
import websockets

def generate_synthetic_audio(duration_s=3.0, sr=16000) -> bytes:
    """Generates a simple 440 Hz sinusoidal waveform for smoke testing."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    # 440 Hz tone + harmonics
    audio = 0.5 * np.sin(2 * np.pi * 440 * t) + 0.2 * np.sin(2 * np.pi * 880 * t)
    pcm = (audio * 32767.0).astype(np.int16)
    return pcm.tobytes()

async def run_smoke(wav_path: str | None, ws_url: str, expect: str | None, fast: bool):
    print(f"Connecting to WebSocket: {ws_url} ...")

    if wav_path:
        import soundfile as sf
        import librosa
        data, sr = sf.read(wav_path)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        if sr != 16000:
            data = librosa.resample(data.astype(np.float32), orig_sr=sr, target_sr=16000)
        pcm_bytes = (np.clip(data, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
        print(f"Loaded {wav_path}: {len(pcm_bytes)} bytes ({len(pcm_bytes) / 32000.0:.2f} s)")
    else:
        print("No --wav provided; generating 3.0 s synthetic test tone...")
        pcm_bytes = generate_synthetic_audio(duration_s=3.0)

    chunk_size = 8000 * 2  # 8000 int16 samples = 16,000 bytes = 0.5 s
    total_frames = len(pcm_bytes) // chunk_size

    results = []
    received_event = asyncio.Event()

    async with websockets.connect(ws_url) as ws:
        # Start message
        await ws.send(json.dumps({
            "type": "start",
            "session_id": f"smoke-{int(time.time())}",
            "sample_rate": 16000,
            "mode": "live"
        }))

        async def receiver():
            last_seq = -1
            try:
                async for message in ws:
                    if isinstance(message, str):
                        data = json.loads(message)
                        if data.get("type") == "window_result":
                            seq = data["seq"]
                            if seq <= last_seq:
                                print(f"ERROR: Sequence number not strictly increasing: {seq} <= {last_seq}")
                                sys.exit(1)
                            last_seq = seq
                            results.append(data)
                            t_ms = data.get("timings_ms", {}).get("total", 0.0)
                            p = data.get("p_spoof")
                            p_str = f"{p:.4f}" if p is not None else "None"
                            state = data.get("state")
                            risk = data.get("risk_pct", 0.0)
                            print(f"[SEQ {seq:03d}] t={data.get('t_end_s', 0.0):.1f}s | p_spoof={p_str} | state={state:<10} | risk={risk:5.1f}% | latency={t_ms:5.1f}ms")
                            if len(results) >= total_frames:
                                received_event.set()
                        elif data.get("type") == "ready":
                            print(f"Server ready: {data}")
                        elif data.get("type") == "error":
                            print(f"Server error: {data}")
            except asyncio.CancelledError:
                pass

        recv_task = asyncio.create_task(receiver())

        # Send audio frames
        for seq in range(total_frames):
            frame_pcm = pcm_bytes[seq * chunk_size : (seq + 1) * chunk_size]
            # Pack [uint32 seq LE][pcm]
            header = struct.pack("<I", seq)
            frame_packet = header + frame_pcm
            await ws.send(frame_packet)

            if not fast:
                await asyncio.sleep(0.5)

        # Wait up to 5 seconds for all responses
        try:
            await asyncio.wait_for(received_event.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            print(f"Timeout waiting for all responses (received {len(results)}/{total_frames})")

        recv_task.cancel()

    print("\n--- Smoke Test Summary ---")
    print(f"Total frames sent: {total_frames}, received: {len(results)}")
    if not results:
        print("FAIL: No results received")
        sys.exit(1)

    final_result = results[-1]
    final_state = final_result.get("state")
    dec_time = final_result.get("decision_time_s")
    print(f"Final State: {final_state} (Decision Time: {dec_time}s)")

    if expect and final_state != expect:
        print(f"FAIL: Expected state '{expect}' but got '{final_state}'")
        sys.exit(1)

    print("SUCCESS: End-to-end smoke test passed!")

def main():
    parser = argparse.ArgumentParser(description="VoiceSentry E2E Smoke Test")
    parser.add_argument("--wav", type=str, default=None, help="Path to input WAV file")
    parser.add_argument("--ws", type=str, default="ws://localhost:8080/ws/live", help="WebSocket URL")
    parser.add_argument("--expect", type=str, default=None, choices=["AUTHENTIC", "CLONED", "SUSPICIOUS", "ANALYZING"])
    parser.add_argument("--fast", action="store_true", help="Send frames immediately without pacing")
    args = parser.parse_args()

    asyncio.run(run_smoke(args.wav, args.ws, args.expect, args.fast))

if __name__ == "__main__":
    main()
