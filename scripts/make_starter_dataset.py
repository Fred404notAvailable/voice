"""
make_starter_dataset.py — Generates a lightweight synthetic starter dataset
with diverse bonafide-like and spoof-like acoustic waveforms for initial
end-to-end model training, calibration, and baseline computation.
"""
import os
import csv
import numpy as np
import soundfile as sf
from pathlib import Path

OUT_DIR = Path("data/processed/starter_dataset")
MANIFEST_PATH = Path("data/processed/starter_manifest.csv")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

SR = 16000
DURATION = 2.5  # 2.5 seconds per clip
N_SAMPLES = int(SR * DURATION)
t = np.linspace(0, DURATION, N_SAMPLES, endpoint=False)

def generate_bonafide(idx: int) -> np.ndarray:
    """Simulate human speech: modulated F0, formant resonances, natural breath/air turbulence."""
    base_f0 = 100.0 + (idx % 12) * 15.0  # 100 to 265 Hz (male and female speech range)
    # Natural intonation contour + micro-tremor
    f0_contour = base_f0 + 12.0 * np.sin(2 * np.pi * (1.5 + (idx % 3)) * t) + np.random.normal(0, 1.2, len(t))
    phase = 2 * np.pi * np.cumsum(f0_contour) / SR

    # Harmonic series with natural human roll-off
    wave = (
        0.50 * np.sin(phase)
        + 0.28 * np.sin(2 * phase)
        + 0.16 * np.sin(3 * phase)
        + 0.09 * np.sin(4 * phase)
        + 0.05 * np.sin(5 * phase)
    )
    # Syllabic envelope
    syllable_rate = 3.0 + (idx % 3)
    env = 0.5 * (1.0 + np.sin(2 * np.pi * syllable_rate * t)) * (0.8 + 0.2 * np.random.rand(len(t)))
    # Natural turbulence
    noise = np.random.normal(0, 0.015, len(t))
    out = (wave * env + noise).astype(np.float32)
    return out / (np.max(np.abs(out)) + 1e-6) * 0.75

def generate_spoof(idx: int) -> np.ndarray:
    """Simulate synthetic spoof: rigid F0, vocoder buzz, phase lock, or high-band cutoff."""
    attack = idx % 3
    base_f0 = 120.0 + (idx % 8) * 18.0

    if attack == 0:
        # Rigidly flat F0 (zero pitch perturbation)
        phase = 2 * np.pi * base_f0 * t
        wave = np.zeros(len(t))
        for h in range(1, 12):
            wave += (1.0 / h) * np.sin(h * phase)
        env = 0.7 + 0.3 * np.sin(2 * np.pi * 2.0 * t)
        out = (wave * env).astype(np.float32)
    elif attack == 1:
        # Band-limited with harsh vocoder buzz
        phase = 2 * np.pi * base_f0 * t
        wave = np.sin(phase) + 0.8 * np.sin(2 * phase) + 0.6 * np.sin(3 * phase)
        # Low-pass filter artifact: abruptly zero above 3.8 kHz
        # In time domain, high harmonic absence
        out = (wave * 0.8).astype(np.float32)
    else:
        # Phase dispersion anomaly (robotic metallic resonance)
        phase = 2 * np.pi * base_f0 * t
        wave = np.sin(phase) + np.sin(2.05 * phase) + np.sin(3.08 * phase) + np.random.normal(0, 0.04, len(t))
        out = wave.astype(np.float32)

    return out / (np.max(np.abs(out)) + 1e-6) * 0.75

splits = [
    ("train", 30, 30),
    ("dev", 12, 12),
    ("eval", 12, 12),
]

manifest_rows = []

for split_name, n_bonafide, n_spoof in splits:
    # Bonafide
    for i in range(n_bonafide):
        filename = f"{split_name}_bona_{i:03d}.wav"
        filepath = OUT_DIR / filename
        audio = generate_bonafide(i)
        sf.write(str(filepath), audio, SR)
        manifest_rows.append({
            "path": str(filepath.resolve()),
            "label": "0",
            "attack_id": "bonafide",
            "split": split_name,
            "condition": "clean",
            "duration_s": f"{DURATION:.1f}",
        })

    # Spoof
    for i in range(n_spoof):
        filename = f"{split_name}_spoof_{i:03d}.wav"
        filepath = OUT_DIR / filename
        audio = generate_spoof(i)
        sf.write(str(filepath), audio, SR)
        attack_type = f"A0{(i % 3) + 1}"
        manifest_rows.append({
            "path": str(filepath.resolve()),
            "label": "1",
            "attack_id": attack_type,
            "split": split_name,
            "condition": "clean",
            "duration_s": f"{DURATION:.1f}",
        })

with open(MANIFEST_PATH, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["path", "label", "attack_id", "split", "condition", "duration_s"])
    writer.writeheader()
    writer.writerows(manifest_rows)

print(f"Generated starter dataset at {OUT_DIR} with {len(manifest_rows)} clips.")
print(f"Manifest written to {MANIFEST_PATH}")
