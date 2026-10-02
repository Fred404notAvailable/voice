import base64
import numpy as np
import librosa
from typing import Tuple, List, Dict, Any
from .schemas import Biomarker, PackedMatrix

SR = 16000
WIN = 16000          # 1 s
HOP = 8000           # 0.5 s
N_FFT = 512
HOP_LEN = 160        # 10 ms -> 101 frames for 1 s with center=True
N_MELS = 64

def pack_matrix_u8_b64(mat: np.ndarray) -> PackedMatrix:
    """Clips mat to [0, 1], scales to 0..255 uint8, and base64 encodes."""
    mat_clipped = np.clip(mat, 0.0, 1.0)
    u8 = (mat_clipped * 255.0).round().astype(np.uint8)
    b64_str = base64.b64encode(u8.tobytes()).decode("ascii")
    return PackedMatrix(
        shape=(int(mat.shape[0]), int(mat.shape[1])),
        encoding="u8_b64",
        data=b64_str,
    )

def log_mel(y: np.ndarray) -> np.ndarray:
    """y: float32 mono 16 kHz, len 16000 -> (64, 101) float32, per-sample normalized."""
    S = librosa.feature.melspectrogram(
        y=y, sr=SR, n_fft=N_FFT, hop_length=HOP_LEN, n_mels=N_MELS, fmin=20, fmax=8000, power=2.0
    )
    S = librosa.power_to_db(S, ref=1.0, top_db=80.0).astype(np.float32)
    return (S - S.mean()) / (S.std() + 1e-6)

def log_mel_display(y_half: np.ndarray) -> np.ndarray:
    """For the scrolling display: newest 0.5 s (8000 samples) -> (64, ~50), scaled 0..1 using fixed dB limits."""
    S = librosa.feature.melspectrogram(
        y=y_half, sr=SR, n_fft=N_FFT, hop_length=HOP_LEN, n_mels=N_MELS, fmin=20, fmax=8000
    )
    db = librosa.power_to_db(S, ref=1.0, top_db=80.0)
    return np.clip((db + 80.0) / 80.0, 0.0, 1.0).astype(np.float32)

def phase_coherence(y: np.ndarray, n_fft=512, hop=128) -> float:
    """Magnitude-weighted circular concentration of phase deviation."""
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop)
    ph = np.angle(D)
    expected = 2 * np.pi * hop * np.arange(D.shape[0])[:, None] / n_fft
    d = np.diff(ph, axis=1) - expected
    d = (d + np.pi) % (2 * np.pi) - np.pi  # wrap to [-pi, pi]
    mag = np.abs(D[:, 1:])
    w = mag / (mag.sum(axis=0, keepdims=True) + 1e-9)
    r = np.abs((w * np.exp(1j * d)).sum(axis=0))
    return float(np.nan_to_num(r.mean(), nan=0.0))

def extract_biomarkers(y: np.ndarray, baselines: Dict[str, Dict[str, float]]) -> List[Biomarker]:
    """Extracts the 5 required acoustic biomarkers on a 1-second audio frame."""
    # STFT cached for spectral features
    D = librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LEN)
    mag = np.abs(D)
    power = mag ** 2

    # 1. Pitch perturbation using librosa.yin
    try:
        f0 = librosa.yin(y, fmin=70, fmax=400, sr=SR, frame_length=1024, hop_length=256)
        valid = f0[f0 > 0]
        if len(valid) > 2:
            T = 1.0 / valid
            pitch_pert = float(np.mean(np.abs(np.diff(T))) / (np.mean(T) + 1e-9))
        else:
            pitch_pert = 0.02
    except Exception:
        pitch_pert = 0.02

    # 2. Spectral roll-off 95%
    rolloff = librosa.feature.spectral_rolloff(S=power, sr=SR, roll_percent=0.95)
    rolloff_95 = float(np.median(rolloff))

    # 3. High-frequency energy ratio (4-8 kHz vs total)
    # At 16 kHz SR and 512 n_fft, bin spacing is 16000 / 512 = 31.25 Hz.
    # 4000 Hz is bin 128, 8000 Hz is bin 256.
    hf_energy = power[128:, :].sum()
    total_energy = power.sum() + 1e-9
    hf_ratio = float(hf_energy / total_energy)

    # 4. Spectral flatness
    flatness = float(np.mean(librosa.feature.spectral_flatness(S=power)))

    # 5. Phase coherence
    phase_coh = phase_coherence(y)

    results = []
    defs = [
        ("pitch_perturbation", "Pitch Perturbation", pitch_pert, "%", 0.015, 0.08),
        ("rolloff_95_hz", "95% Spectral Roll-off", rolloff_95, "Hz", 3200.0, 7600.0),
        ("hf_ratio_4_8k", "High-Band (4-8k) Energy Ratio", hf_ratio, "ratio", 0.05, 0.35),
        ("spectral_flatness", "Spectral Flatness", flatness, "ratio", 0.001, 0.05),
        ("phase_coherence", "Phase Coherence", phase_coh, "index", 0.40, 0.85),
    ]

    for key, label, val, unit, def_low, def_high in defs:
        base = baselines.get(key, {})
        low = base.get("p10", def_low)
        high = base.get("p90", def_high)
        flagged = bool(val < low or val > high)
        results.append(
            Biomarker(
                key=key,
                label=label,
                value=round(float(val), 4),
                unit=unit,
                baseline_low=round(float(low), 4),
                baseline_high=round(float(high), 4),
                flagged=flagged,
            )
        )

    return results


def compute_biomarker_prior(biomarkers: List[Biomarker]) -> float:
    """
    Computes an acoustic biomarker-driven prior probability of synthetic speech.
    Uses multi-feature anomaly voting and phase coherence dispersion to protect
    against neural vocoders that fool simple spectrogram CNNs.
    """
    flagged = [b for b in biomarkers if b.flagged]
    n_flag = len(flagged)

    # Base prior based on the number of anomalous biomarkers:
    # 0 flags -> 0.15 (strong natural evidence)
    # 1 flag  -> 0.30 (natural tendency)
    # 2 flags -> 0.50 (neutral)
    # 3 flags -> 0.70 (suspicious acoustic pattern)
    # 4 flags -> 0.85 (highly anomalous)
    # 5 flags -> 0.95 (extreme anomaly across all dimensions)
    p_map = [0.15, 0.30, 0.50, 0.70, 0.85, 0.95]
    p_bio = p_map[min(n_flag, 5)]

    for b in biomarkers:
        # Phase coherence deficit: neural vocoders (like HiFi-GAN/BigVGAN) lack human glottal pulse coupling
        if b.key == "phase_coherence" and b.value < b.baseline_low:
            deficit = (b.baseline_low - b.value) / (b.baseline_low + 1e-6)
            if deficit > 0.05:
                p_bio = max(p_bio, min(0.92, 0.55 + 2.0 * deficit))

        # Severe high-frequency band limitation (vocoder brickwall cutoff)
        if b.key == "hf_ratio_4_8k" and b.value < b.baseline_low * 0.5:
            p_bio = max(p_bio, 0.75)

    return float(p_bio)


def check_wideband_cutoff(y_native: np.ndarray, native_sr: int) -> Dict[str, Any]:
    """
    Inspects un-downsampled native audio (e.g. 44.1 kHz or 48 kHz) for artificial
    brickwall cutoffs at 12 kHz, 16 kHz, or 20 kHz (characteristic of 24 kHz or 32 kHz
    neural vocoders upsampled to 48 kHz).
    """
    if native_sr <= 16000 or len(y_native) < native_sr:
        return {"has_cutoff": False, "native_sr": native_sr, "ratio_15k": None}

    try:
        D = np.abs(librosa.stft(y_native, n_fft=2048, hop_length=512))
        freqs = librosa.fft_frequencies(sr=native_sr, n_fft=2048)

        total_energy = float(D.sum() + 1e-9)
        energy_above_15k = float(D[freqs >= 15000, :].sum())
        ratio_15k = float(energy_above_15k / total_energy)

        # In natural 48 kHz voice recordings, energy >15 kHz is typically 0.01 - 0.08.
        # In upsampled 32 kHz neural models, energy >15 kHz drops to < 0.0008.
        has_cutoff = bool(ratio_15k < 0.001)
        cutoff_est = 16000 if has_cutoff else None

        return {
            "has_cutoff": has_cutoff,
            "cutoff_hz": cutoff_est,
            "ratio_15k": round(ratio_15k, 6),
            "native_sr": int(native_sr),
        }
    except Exception:
        return {"has_cutoff": False, "native_sr": native_sr, "ratio_15k": None}
