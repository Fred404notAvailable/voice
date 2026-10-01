import time
import numpy as np
import torch
from typing import Optional, Dict, Any
from .schemas import WindowResult, TimingsMs
from .features import SR, WIN, HOP, log_mel, log_mel_display, pack_matrix_u8_b64, extract_biomarkers
from .risk_engine import RiskEngine, RiskConfig

class SessionEngine:
    def __init__(self, session_id: str, model: Optional[torch.nn.Module] = None, temperature: float = 1.0, baselines: Optional[Dict[str, Any]] = None):
        self.session_id = session_id
        self.model = model
        self.temperature = temperature
        self.baselines = baselines or {}

        # 16,000 samples = 1.0s float32 ring buffer
        self.ring_buffer = np.zeros(WIN, dtype=np.float32)
        self.total_samples_received = 0
        self.risk_engine = RiskEngine()
        self.last_heatmap = None
        self.last_biomarkers = []

    def reset(self):
        self.ring_buffer.fill(0)
        self.total_samples_received = 0
        self.risk_engine.reset()
        self.last_heatmap = None
        self.last_biomarkers = []

    def push_pcm_frame(self, seq: int, pcm_bytes: bytes) -> WindowResult:
        t0 = time.perf_counter()

        # Convert int16 bytes to float32 [-1.0, 1.0]
        pcm_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
        samples_in = pcm_int16.astype(np.float32) / 32768.0
        n_samples = len(samples_in)

        # Shift ring buffer and insert new samples
        if n_samples >= WIN:
            self.ring_buffer[:] = samples_in[-WIN:]
        else:
            self.ring_buffer[:-n_samples] = self.ring_buffer[n_samples:]
            self.ring_buffer[-n_samples:] = samples_in

        self.total_samples_received += n_samples
        t_end_s = self.total_samples_received / float(SR)
        t_start_s = max(0.0, t_end_s - 1.0)

        # Compute display spectrogram from the newest 0.5 s (8000 samples)
        t_feat_0 = time.perf_counter()
        spec_display = log_mel_display(self.ring_buffer[-HOP:])
        spec_new_packed = pack_matrix_u8_b64(spec_display)
        t_feat_ms = (time.perf_counter() - t_feat_0) * 1000.0

        # Check if we have accumulated a full 1.0 s window
        if self.total_samples_received < WIN:
            t_total_ms = (time.perf_counter() - t0) * 1000.0
            return WindowResult(
                session_id=self.session_id,
                seq=seq,
                t_start_s=round(t_start_s, 3),
                t_end_s=round(t_end_s, 3),
                p_spoof=None,
                llr=None,
                score=None,
                risk_pct=0.0,
                state="ANALYZING",
                committed=False,
                decision_time_s=None,
                eta_to_decision_s=None,
                biomarkers=[],
                spec_new=spec_new_packed,
                heatmap=None,
                timings_ms=TimingsMs(
                    features=round(t_feat_ms, 2),
                    model=0.0,
                    gradcam=0.0,
                    biomarkers=0.0,
                    total=round(t_total_ms, 2),
                ),
                client_seq_echo=seq,
            )

        # Phase 1 slice / model inference
        t_model_0 = time.perf_counter()
        p_spoof = 0.5  # default baseline for slice

        if self.model is not None:
            # Full model inference path
            mel_feat = log_mel(self.ring_buffer)  # (64, 101)
            x_tensor = torch.from_numpy(mel_feat).unsqueeze(0).unsqueeze(0)  # (1, 1, 64, 101)
            with torch.inference_mode():
                logits = self.model(x_tensor)
                if isinstance(logits, tuple):
                    logits = logits[0]
                # Logit difference (spoof - bonafide)
                z = (logits[0, 1] - logits[0, 0]).item()
                p_spoof = 1.0 / (1.0 + np.exp(-z / max(1e-4, self.temperature)))

        t_model_ms = (time.perf_counter() - t_model_0) * 1000.0

        # Update Risk Engine
        risk_update = self.risk_engine.update(p_spoof, t_end_s)

        # Extract biomarkers
        t_bio_0 = time.perf_counter()
        biomarkers = extract_biomarkers(self.ring_buffer, self.baselines)
        t_bio_ms = (time.perf_counter() - t_bio_0) * 1000.0

        t_total_ms = (time.perf_counter() - t0) * 1000.0

        return WindowResult(
            session_id=self.session_id,
            seq=seq,
            t_start_s=round(t_start_s, 3),
            t_end_s=round(t_end_s, 3),
            p_spoof=round(p_spoof, 4),
            llr=round(risk_update["llr"], 4),
            score=round(risk_update["score"], 4),
            risk_pct=round(risk_update["risk_pct"], 1),
            state=risk_update["state"],
            committed=risk_update["committed"],
            decision_time_s=round(risk_update["decision_time_s"], 2) if risk_update["decision_time_s"] is not None else None,
            eta_to_decision_s=round(risk_update["eta_to_decision_s"], 2) if risk_update["eta_to_decision_s"] is not None else None,
            biomarkers=biomarkers,
            spec_new=spec_new_packed,
            heatmap=None,
            timings_ms=TimingsMs(
                features=round(t_feat_ms, 2),
                model=round(t_model_ms, 2),
                gradcam=0.0,
                biomarkers=round(t_bio_ms, 2),
                total=round(t_total_ms, 2),
            ),
            client_seq_echo=seq,
        )
