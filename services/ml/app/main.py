import io
import json
import struct
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .config import MOCK_ML, MODEL_PATH, CALIBRATION_PATH, BASELINES_PATH
from .schemas import WindowResult, ReadyMessage, ErrorMessage, FileAnalysisResponse
from .session_engine import SessionEngine
from .features import SR, HOP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicesentry-ml")

# Global loaded artifacts
APP_STATE: Dict[str, Any] = {
    "model": None,
    "temperature": 1.0,
    "baselines": {},
    "model_loaded": False,
    "calibrated": False,
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing VoiceSentry ML Service...")
    if MOCK_ML:
        logger.warning("Running with MOCK_ML=1! Dummy inference active.")

    # Try loading model if artifact exists
    if MODEL_PATH.exists():
        try:
            import torch
            from .model import SpoofCNN
            model = SpoofCNN()
            state_dict = torch.load(MODEL_PATH, map_location="cpu")
            model.load_state_dict(state_dict)
            model.eval()
            APP_STATE["model"] = model
            APP_STATE["model_loaded"] = True
            logger.info("Successfully loaded SpoofCNN weights from %s", MODEL_PATH)
        except Exception as e:
            logger.error("Failed to load model weights: %s", e)
    else:
        logger.info("No model.pt found at %s (Phase 1 vertical slice / training pending)", MODEL_PATH)

    # Try loading calibration
    if CALIBRATION_PATH.exists():
        try:
            with open(CALIBRATION_PATH, "r") as f:
                cal_data = json.load(f)
                APP_STATE["temperature"] = float(cal_data.get("temperature", 1.0))
                APP_STATE["calibrated"] = True
                logger.info("Loaded calibration temperature: %s", APP_STATE["temperature"])
        except Exception as e:
            logger.error("Failed to load calibration.json: %s", e)

    # Try loading baselines
    if BASELINES_PATH.exists():
        try:
            with open(BASELINES_PATH, "r") as f:
                APP_STATE["baselines"] = json.load(f)
                logger.info("Loaded acoustic baselines from %s", BASELINES_PATH)
        except Exception as e:
            logger.error("Failed to load baselines.json: %s", e)

    # Pre-warm dummy run
    try:
        dummy_engine = SessionEngine(
            session_id="warmup",
            model=APP_STATE["model"],
            temperature=APP_STATE["temperature"],
            baselines=APP_STATE["baselines"],
        )
        dummy_pcm = (np.zeros(8000, dtype=np.int16)).tobytes()
        dummy_engine.push_pcm_frame(0, dummy_pcm)
        dummy_engine.push_pcm_frame(1, dummy_pcm)
        logger.info("Pre-warming run completed successfully.")
    except Exception as e:
        logger.warning("Pre-warm failed: %s", e)

    yield
    logger.info("Shutting down VoiceSentry ML Service.")

app = FastAPI(title="VoiceSentry ML Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": APP_STATE["model_loaded"],
        "calibrated": APP_STATE["calibrated"],
        "mock_ml": MOCK_ML,
        "version": "0.1.0",
    }

@app.get("/metrics")
def metrics():
    return {
        "status": "ok",
        "service": "voicesentry-ml",
    }

@app.websocket("/ws/session")
async def websocket_session(websocket: WebSocket):
    await websocket.accept()
    session_id = "default"
    engine = SessionEngine(
        session_id=session_id,
        model=APP_STATE["model"],
        temperature=APP_STATE["temperature"],
        baselines=APP_STATE["baselines"],
    )

    # Send ready message
    ready_msg = ReadyMessage(
        model="spoofcnn-v1" if APP_STATE["model_loaded"] else "echo-slice-dummy",
        calibrated=APP_STATE["calibrated"],
        window_s=1.0,
        hop_s=0.5,
    )
    await websocket.send_text(ready_msg.model_dump_json())

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                logger.info("WebSocket session %s disconnected cleanly", session_id)
                break

            if "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")
                    if msg_type == "start":
                        session_id = data.get("session_id", session_id)
                        engine.session_id = session_id
                        engine.reset()
                    elif msg_type == "reset":
                        engine.reset()
                    elif msg_type == "stop":
                        # Send final message if desired
                        pass
                except Exception as e:
                    logger.warning("Invalid JSON control message: %s", e)

            elif "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                # Must be at least 4 bytes (seq) + PCM bytes
                if len(raw_bytes) < 4 or (len(raw_bytes) - 4) % 2 != 0:
                    err = ErrorMessage(code="BAD_FRAME", message="Frame byte length invalid")
                    await websocket.send_text(err.model_dump_json())
                    continue

                seq = struct.unpack("<I", raw_bytes[:4])[0]
                pcm_data = raw_bytes[4:]

                # Execute audio processing in threadpool to prevent blocking the event loop
                res: WindowResult = await run_in_threadpool(engine.push_pcm_frame, seq, pcm_data)
                await websocket.send_text(res.model_dump_json())

    except WebSocketDisconnect:
        logger.info("WebSocket session %s disconnected", session_id)
    except Exception as e:
        logger.error("Error in websocket session %s: %s", session_id, e)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass

@app.post("/analyze_file", response_model=FileAnalysisResponse)
async def analyze_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        # Decode audio with soundfile
        audio_buf = io.BytesIO(content)
        data, samplerate = sf.read(audio_buf)

        # Convert to mono if stereo
        if len(data.shape) > 1:
            data = data.mean(axis=1)

        # Resample to 16 kHz if necessary
        if samplerate != SR:
            import librosa
            data = librosa.resample(data.astype(np.float32), orig_sr=samplerate, target_sr=SR)

        total_samples = len(data)
        duration_s = total_samples / float(SR)

        # Convert to int16 PCM
        pcm_int16 = (np.clip(data, -1.0, 1.0) * 32767.0).astype(np.int16)

        # Fresh SessionEngine
        engine = SessionEngine(
            session_id=f"file-{file.filename}",
            model=APP_STATE["model"],
            temperature=APP_STATE["temperature"],
            baselines=APP_STATE["baselines"],
        )

        windows = []
        hop_samples = HOP
        seq = 0

        # Step through in 0.5 s (8000 sample) hops
        for offset in range(0, total_samples, hop_samples):
            chunk = pcm_int16[offset : offset + hop_samples]
            if len(chunk) < hop_samples:
                # Pad last chunk
                padded = np.zeros(hop_samples, dtype=np.int16)
                padded[:len(chunk)] = chunk
                chunk = padded

            res = engine.push_pcm_frame(seq, chunk.tobytes())
            windows.append(res)
            seq += 1

        last_win = windows[-1] if windows else None
        verdict = last_win.state if last_win else "ANALYZING"
        final_risk = last_win.risk_pct if last_win else 0.0
        decision_time = last_win.decision_time_s if last_win else None

        return FileAnalysisResponse(
            duration_s=round(duration_s, 2),
            verdict=verdict,
            decision_time_s=decision_time,
            final_risk_pct=round(final_risk, 1),
            windows=windows,
        )

    except Exception as e:
        logger.error("Analyze file failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
