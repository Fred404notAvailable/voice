"""
make_demo_clips.py — Generates synthetic reference demo audio clips.
Generates:
  - apps/web/public/demo/human_sample.wav (natural pitch modulation, formants, subtle jitter)
  - apps/web/public/demo/clone_sample.wav (robotic/frozen pitch, high-frequency cutoff, phase harmonics)
"""
import os
import numpy as np
import soundfile as sf

OUTPUT_DIR = "apps/web/public/demo"
os.makedirs(OUTPUT_DIR, exist_ok=True)
sr = 16000
duration = 4.0  # 4 seconds
t = np.linspace(0, duration, int(sr * duration), endpoint=False)

# 1. Human-like simulation: fluctuating fundamental frequency (F0 ~ 130 Hz with vibrato/jitter), formants
f0_human = 130 + 15 * np.sin(2 * np.pi * 3.5 * t) + np.random.normal(0, 1.5, size=len(t))
phase_human = 2 * np.pi * np.cumsum(f0_human) / sr
human_wave = (
    0.5 * np.sin(phase_human)
    + 0.3 * np.sin(2 * phase_human)
    + 0.15 * np.sin(3 * phase_human)
    + 0.08 * np.sin(4 * phase_human)
)
# Add realistic envelope and breath noise
envelope = 0.5 * (1 - np.cos(2 * np.pi * t / duration))
noise = np.random.normal(0, 0.015, size=len(t))
human_audio = (human_wave + noise) * envelope
human_audio = human_audio / np.max(np.abs(human_audio) + 1e-6) * 0.8
sf.write(os.path.join(OUTPUT_DIR, "human_sample.wav"), human_audio.astype(np.float32), sr)
print(f"Generated {OUTPUT_DIR}/human_sample.wav")

# 2. Clone-like simulation: perfectly flat F0 (unnatural zero pitch perturbation), synthetic buzz harmonics
f0_clone = 160.0  # rigidly flat
phase_clone = 2 * np.pi * f0_clone * t
clone_wave = np.zeros_like(t)
for harmonic in range(1, 15):
    clone_wave += (1.0 / harmonic) * np.sin(harmonic * phase_clone)
# Sharp cutoff at 4 kHz (typical of some vocoders)
clone_audio = clone_wave * envelope
clone_audio = clone_audio / np.max(np.abs(clone_audio) + 1e-6) * 0.8
sf.write(os.path.join(OUTPUT_DIR, "clone_sample.wav"), clone_audio.astype(np.float32), sr)
print(f"Generated {OUTPUT_DIR}/clone_sample.wav")
