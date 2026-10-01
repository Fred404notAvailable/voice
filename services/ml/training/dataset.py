"""
dataset.py — PyTorch Dataset for SpoofCNN training.

Reads from a manifest CSV. Each item returns (log_mel_tensor, label).
Supports optional data augmentation (noise, time stretch — not codec, that's
pre-processed by augment_codecs.py).
"""
import csv
import random
from pathlib import Path
from typing import Optional, Callable

import numpy as np
import torch
from torch.utils.data import Dataset
import librosa
import soundfile as sf

SR = 16000
WIN = 16000   # 1.0 s
N_FFT = 512
HOP_LEN = 160
N_MELS = 64


def load_audio_1s(path: str, start_s: float = 0.0) -> Optional[np.ndarray]:
    """
    Load exactly 1 second (16000 samples) of mono 16 kHz audio.
    If the file is shorter, pad with zeros. If longer, crop from start_s.
    Returns float32 array or None on error.
    """
    try:
        data, sr = sf.read(path, always_2d=False)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        data = data.astype(np.float32)

        if sr != SR:
            data = librosa.resample(data, orig_sr=sr, target_sr=SR)

        start_sample = int(start_s * SR)
        if start_sample >= len(data):
            start_sample = 0

        data = data[start_sample:]

        if len(data) >= WIN:
            # Random crop from the valid region during training
            max_start = len(data) - WIN
            offset = random.randint(0, max_start) if max_start > 0 else 0
            data = data[offset: offset + WIN]
        else:
            # Pad with zeros
            padded = np.zeros(WIN, dtype=np.float32)
            padded[:len(data)] = data
            data = padded

        return data
    except Exception:
        return None


def log_mel(y: np.ndarray) -> np.ndarray:
    """Compute normalized log-mel spectrogram (64, 101)."""
    S = librosa.feature.melspectrogram(
        y=y, sr=SR, n_fft=N_FFT, hop_length=HOP_LEN,
        n_mels=N_MELS, fmin=20, fmax=8000, power=2.0
    )
    db = librosa.power_to_db(S, ref=1.0, top_db=80.0).astype(np.float32)
    return (db - db.mean()) / (db.std() + 1e-6)


def add_noise(y: np.ndarray, snr_db: float = 20.0) -> np.ndarray:
    """Add white Gaussian noise at a given SNR."""
    signal_power = np.mean(y ** 2) + 1e-9
    noise_power = signal_power / (10 ** (snr_db / 10.0))
    noise = np.random.randn(len(y)).astype(np.float32) * np.sqrt(noise_power)
    return np.clip(y + noise, -1.0, 1.0)


class SpoofDataset(Dataset):
    """
    Dataset that loads (log_mel_tensor, label) pairs from a manifest CSV.

    CSV columns: path, label, attack_id, split, condition, duration_s
    """

    def __init__(
        self,
        manifest_path: str | Path,
        split: str = "train",
        augment: bool = False,
        noise_prob: float = 0.3,
        noise_snr_range: tuple[float, float] = (15.0, 35.0),
        condition_filter: Optional[list[str]] = None,
    ):
        self.augment = augment
        self.noise_prob = noise_prob
        self.noise_snr_range = noise_snr_range

        rows = []
        with open(manifest_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row["split"] != split:
                    continue
                if condition_filter and row["condition"] not in condition_filter:
                    continue
                rows.append(row)

        if not rows:
            raise ValueError(f"No rows found for split='{split}' in {manifest_path}")

        self.rows = rows
        print(f"SpoofDataset [{split}]: {len(rows)} samples loaded")

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        row = self.rows[idx]
        label = int(row["label"])

        y = load_audio_1s(row["path"])
        if y is None:
            # Return zeros on load failure (avoids crashing DataLoader)
            y = np.zeros(WIN, dtype=np.float32)

        if self.augment:
            if random.random() < self.noise_prob:
                snr = random.uniform(*self.noise_snr_range)
                y = add_noise(y, snr_db=snr)

        mel = log_mel(y)  # (64, 101)
        tensor = torch.from_numpy(mel).unsqueeze(0)  # (1, 64, 101)
        return tensor, label
