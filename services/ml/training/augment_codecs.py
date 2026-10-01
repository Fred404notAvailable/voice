"""
augment_codecs.py — Phase 2/7: Generate codec-degraded audio copies.

For each row in the manifest, applies codec degradation via ffmpeg (or pydub
as fallback) and appends new rows with updated condition and path.

Usage:
    python -m training.augment_codecs \
        --manifest data/processed/manifest.csv \
        --out data/processed/manifest_augmented.csv \
        --codecs g711_mulaw g711_alaw opus_16k opus_8k mp3_32k noise_20db \
        --max_per_condition 2000

Requires: ffmpeg on PATH (check with `ffmpeg -version`)
"""
import argparse
import csv
import os
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

CODEC_CONFIGS = {
    "g711_mulaw": ["-ar", "8000", "-ac", "1", "-acodec", "pcm_mulaw", "-f", "wav"],
    "g711_alaw":  ["-ar", "8000", "-ac", "1", "-acodec", "pcm_alaw", "-f", "wav"],
    "opus_16k":   ["-ar", "16000", "-ac", "1", "-acodec", "libopus", "-b:a", "16k"],
    "opus_8k":    ["-ar", "16000", "-ac", "1", "-acodec", "libopus", "-b:a", "8k"],
    "mp3_32k":    ["-ar", "16000", "-ac", "1", "-acodec", "libmp3lame", "-b:a", "32k"],
}

CODEC_EXTS = {
    "g711_mulaw": ".wav",
    "g711_alaw":  ".wav",
    "opus_16k":   ".ogg",
    "opus_8k":    ".ogg",
    "mp3_32k":    ".mp3",
}


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def apply_codec(src_path: str, dst_path: str, codec: str) -> bool:
    """Apply codec degradation using ffmpeg. Returns True on success."""
    if codec == "noise_20db":
        return apply_noise(src_path, dst_path, snr_db=20.0)

    if not ffmpeg_available():
        return False

    ffmpeg_args = CODEC_CONFIGS.get(codec)
    if ffmpeg_args is None:
        return False

    try:
        # Encode to codec format, then decode back to 16kHz wav
        with tempfile.NamedTemporaryFile(suffix=CODEC_EXTS[codec], delete=False) as tmp:
            tmp_path = tmp.name

        # Step 1: encode
        cmd_encode = ["ffmpeg", "-y", "-i", src_path] + ffmpeg_args + [tmp_path]
        result = subprocess.run(cmd_encode, capture_output=True, timeout=30)
        if result.returncode != 0:
            return False

        # Step 2: decode back to 16kHz mono wav
        cmd_decode = ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", dst_path]
        result = subprocess.run(cmd_decode, capture_output=True, timeout=30)
        os.unlink(tmp_path)
        return result.returncode == 0
    except Exception:
        return False


def apply_noise(src_path: str, dst_path: str, snr_db: float = 20.0) -> bool:
    """Add AWGN noise using numpy + soundfile."""
    try:
        import soundfile as sf
        import librosa
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
    parser.add_argument("--codecs", nargs="+",
                        default=["g711_mulaw", "opus_16k", "noise_20db"])
    parser.add_argument("--max_per_condition", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not ffmpeg_available():
        print("WARNING: ffmpeg not found on PATH — only 'noise_20db' codec will work")

    # Load existing manifest
    with open(args.manifest, newline="") as f:
        reader = csv.DictReader(f)
        original_rows = list(reader)
        fieldnames = reader.fieldnames

    rng = random.Random(args.seed)

    new_rows = list(original_rows)
    for codec in args.codecs:
        # Select rows to augment (cap per condition)
        candidates = [r for r in original_rows if r["condition"] == "clean"]
        rng.shuffle(candidates)
        selected = candidates[: args.max_per_condition]

        print(f"Applying {codec} to {len(selected)} files...")
        success = 0

        for row in selected:
            src = Path(row["path"])
            if not src.exists():
                continue

            ext = CODEC_EXTS.get(codec, ".wav")
            dst = src.parent / f"{src.stem}_{codec}{ext}"
            dst_wav = src.parent / f"{src.stem}_{codec}.wav"

            if apply_codec(str(src), str(dst_wav), codec):
                new_row = dict(row)
                new_row["path"] = str(dst_wav)
                new_row["condition"] = codec
                new_rows.append(new_row)
                success += 1

        print(f"  {codec}: {success}/{len(selected)} succeeded")

    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(new_rows)

    print(f"\nAugmented manifest saved to {args.out} ({len(new_rows)} rows total)")


if __name__ == "__main__":
    main()
