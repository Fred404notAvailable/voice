"""
build_own_eval_manifest.py — Builds manifest for custom team evaluation set.

Scans:
  data/own_eval/real/   -> Label 0 (bonafide)
  data/own_eval/clones/ -> Label 1 (spoof)

Outputs:
  data/own_eval/own_eval_manifest.csv
"""
import os
import csv
from pathlib import Path
import soundfile as sf
import librosa

OWN_DIR = Path("data/own_eval")
REAL_DIR = OWN_DIR / "real"
CLONES_DIR = OWN_DIR / "clones"
OUT_CSV = OWN_DIR / "own_eval_manifest.csv"

REAL_DIR.mkdir(parents=True, exist_ok=True)
CLONES_DIR.mkdir(parents=True, exist_ok=True)

SR = 16000
AUDIO_EXTS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}

def process_file(file_path: Path, label: int, generator: str) -> dict:
    try:
        y, orig_sr = sf.read(str(file_path), always_2d=False)
        if len(y.shape) > 1:
            y = y.mean(axis=1)
        if orig_sr != SR:
            y = librosa.resample(y, orig_sr=orig_sr, target_sr=SR)
            # overwrite / save as clean 16kHz wav
            target_wav = file_path.with_suffix(".wav")
            sf.write(str(target_wav), y, SR)
            file_path = target_wav

        dur = round(len(y) / float(SR), 3)
        return {
            "path": str(file_path.resolve()),
            "label": str(label),
            "attack_id": "bonafide" if label == 0 else "custom_clone",
            "split": "own_eval",
            "condition": "clean",
            "duration_s": str(dur),
            "generator": generator,
        }
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return None

def main():
    rows = []

    # Process real recordings
    real_files = [f for f in REAL_DIR.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTS]
    for rf in real_files:
        row = process_file(rf, label=0, generator="human_speaker")
        if row:
            rows.append(row)

    # Process cloned recordings
    clone_files = [f for f in CLONES_DIR.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTS]
    for cf in clone_files:
        # Infer generator from filename if named like elevenlabs_01.wav, xtts_01.wav
        gen = cf.stem.split("_")[0] if "_" in cf.stem else "custom_clone"
        row = process_file(cf, label=1, generator=gen)
        if row:
            rows.append(row)

    with open(OUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "label", "attack_id", "split", "condition", "duration_s", "generator"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nOwn Eval Manifest generated at: {OUT_CSV}")
    print(f"Total clips: {len(rows)} (Real: {len(real_files)}, Clones: {len(clone_files)})")
    if len(rows) == 0:
        print("Note: Drop .wav or .mp3 voice clips into data/own_eval/real/ and data/own_eval/clones/ to populate your team evaluation set.")

if __name__ == "__main__":
    main()
