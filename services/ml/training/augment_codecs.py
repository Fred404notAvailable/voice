"""
augment_codecs.py — Phase 2/7: Generate codec-degraded audio copies.

Applies realistic telephony and internet streaming codec degradation:
  - g711_mulaw : US PSTN / VoIP telephony (8 kHz G.711 mu-law companded)
  - g711_alaw  : European PSTN / ISDN telephony (8 kHz G.711 A-law companded)
  - opus_16k   : Discord / WhatsApp / WebRTC audio stream (16 kbps Opus)
  - mp3_32k    : Low-bitrate compressed audio (32 kbps MP3)
  - noise_20db : Real-world acoustic background noise (+20 dB SNR)

Outputs updated manifest with new condition rows.
"""
import argparse
import csv
import os
import random
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

CODEC_CONFIGS = {
    "g711_mulaw": ["-ar", "8000", "-ac", "1", "-acodec", "pcm_mulaw", "-f", "wav"],
    "g711_alaw":  ["-ar", "8000", "-ac", "1", "-acodec", "pcm_alaw", "-f", "wav"],
    "opus_16k":   ["-ar", "16000", "-ac", "1", "-acodec", "libopus", "-b:a", "16k"],
    "mp3_32k":    ["-ar", "16000", "-ac", "1", "-acodec", "libmp3lame", "-b:a", "32k"],
}

CODEC_EXTS = {
    "g711_mulaw": ".wav",
    "g711_alaw":  ".wav",
    "opus_16k":   ".ogg",
    "mp3_32k":    ".mp3",
}

_FFMPEG_BIN = None

def get_ffmpeg_bin() -> str | None:
    global _FFMPEG_BIN
    if _FFMPEG_BIN:
        return _FFMPEG_BIN
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        _FFMPEG_BIN = bin_path
        return _FFMPEG_BIN
    try:
        import imageio_ffmpeg
        _FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
        return _FFMPEG_BIN
    except Exception:
        return None

def ffmpeg_available() -> bool:
    return get_ffmpeg_bin() is not None

def apply_codec(src_path: str, dst_path: str, codec: str) -> bool:
    """Apply codec degradation using ffmpeg. Returns True on success."""
    if codec == "noise_20db":
        return apply_noise(src_path, dst_path, snr_db=20.0)

    ffmpeg_bin = get_ffmpeg_bin()
    if not ffmpeg_bin:
        return False

    ffmpeg_args = CODEC_CONFIGS.get(codec)
    if ffmpeg_args is None:
        return False

    tmp_path = None
    try:
        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        # Encode to codec format, then decode back to 16kHz mono wav
        with tempfile.NamedTemporaryFile(suffix=CODEC_EXTS[codec], delete=False) as tmp:
            tmp_path = tmp.name

        # Step 1: encode with specified codec bitrate/sampling
        cmd_encode = [ffmpeg_bin, "-y", "-i", src_path] + ffmpeg_args + [tmp_path]
        result = subprocess.run(cmd_encode, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        if result.returncode != 0:
            return False

        # Step 2: decode back to standard 16kHz mono wav (as expected by model input)
        cmd_decode = [ffmpeg_bin, "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", dst_path]
        result = subprocess.run(cmd_decode, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        return result.returncode == 0
    except Exception:
        return False
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

def apply_noise(src_path: str, dst_path: str, snr_db: float = 20.0) -> bool:
    """Add AWGN noise using numpy + soundfile."""
    try:
        import soundfile as sf
        import librosa
        Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
        data, sr = sf.read(src_path, always_2d=False)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        data = data.astype(np.float32)
        if sr != 16000:
            data = librosa.resample(data, orig_sr=sr, target_sr=16000)

        signal_power = np.mean(data ** 2) + 1e-9
        noise_power = signal_power / (10 ** (snr_db / 10.0))
        noise = np.random.randn(len(data)).astype(np.float32) * np.sqrt(noise_power)
        noisy = np.clip(data + noise, -1.0, 1.0)
        sf.write(dst_path, noisy, 16000, subtype="PCM_16")
        return True
    except Exception:
        return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--out", type=str, default="data/processed/manifest_augmented.csv")
    parser.add_argument("--codecs_dir", type=str, default="data/processed/codecs")
    parser.add_argument("--codecs", nargs="+",
                        default=["g711_mulaw", "g711_alaw", "opus_16k", "mp3_32k", "noise_20db"])
    parser.add_argument("--max_per_condition", type=int, default=250)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    ffmpeg_bin = get_ffmpeg_bin()
    if not ffmpeg_bin:
        print("WARNING: ffmpeg not found — only 'noise_20db' codec will work")
    else:
        print(f"Using FFmpeg binary: {ffmpeg_bin}")

    # Load existing manifest
    with open(args.manifest, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        original_rows = list(reader)
        fieldnames = reader.fieldnames

    rng = random.Random(args.seed)
    codecs_base = Path(args.codecs_dir)
    codecs_base.mkdir(parents=True, exist_ok=True)

    new_rows = list(original_rows)
    for codec in args.codecs:
        # Augment dev and eval splits for robustness evaluation
        candidates = [r for r in original_rows if r["condition"] == "clean" and r["split"] in ("dev", "eval")]
        rng.shuffle(candidates)
        selected = candidates[: args.max_per_condition]

        print(f"Applying {codec:12s} to {len(selected)} utterances...")
        success = 0

        for row in selected:
            src = Path(row["path"])
            if not src.exists():
                continue

            dst_wav = codecs_base / codec / f"{src.stem}_{codec}.wav"
            if dst_wav.exists() or apply_codec(str(src), str(dst_wav), codec):
                new_row = dict(row)
                new_row["path"] = str(dst_wav.resolve())
                new_row["condition"] = codec
                new_rows.append(new_row)
                success += 1

        print(f"  -> {codec}: {success}/{len(selected)} successfully degraded")

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_rows)

    print(f"\nAugmented manifest saved to {args.out} ({len(new_rows)} rows total)")

if __name__ == "__main__":
    main()
