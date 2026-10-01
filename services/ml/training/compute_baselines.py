"""
compute_baselines.py — Phase 3/5

Compute human baseline percentiles (P10, P90) for each biomarker from
bonafide utterances in the train set. Saves to artifacts/baselines.json.

Usage:
    python -m training.compute_baselines \
        --manifest data/processed/manifest.csv \
        --out services/ml/artifacts/baselines.json \
        --max_samples 500
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))


BIOMARKER_KEYS = [
    "pitch_perturbation",
    "rolloff_95_hz",
    "hf_ratio_4_8k",
    "spectral_flatness",
    "phase_coherence",
]


def extract_all_biomarker_values(manifest_path: str, max_samples: int) -> dict[str, list[float]]:
    """
    Iterate over bonafide train utterances and collect raw biomarker values.
    """
    from app.features import extract_biomarkers
    import soundfile as sf
    import librosa

    rows = []
    with open(manifest_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["split"] == "train" and int(row["label"]) == 0:
                rows.append(row)

    rng = np.random.default_rng(42)
    if len(rows) > max_samples:
        idxs = rng.choice(len(rows), max_samples, replace=False)
        rows = [rows[i] for i in idxs]

    print(f"Computing baselines from {len(rows)} bonafide utterances...")

    values: dict[str, list[float]] = {k: [] for k in BIOMARKER_KEYS}
    failures = 0

    for i, row in enumerate(rows):
        try:
            data, sr = sf.read(row["path"], always_2d=False)
            if len(data.shape) > 1:
                data = data.mean(axis=1)
            data = data.astype(np.float32)
            if sr != 16000:
                data = librosa.resample(data, orig_sr=sr, target_sr=16000)
            if len(data) >= 16000:
                data = data[:16000]
            else:
                padded = np.zeros(16000, dtype=np.float32)
                padded[:len(data)] = data
                data = padded

            # No baselines dict yet — use defaults (extract_biomarkers handles it)
            biomarkers = extract_biomarkers(data, {})
            for bm in biomarkers:
                values[bm.key].append(bm.value)
        except Exception as e:
            failures += 1
            if failures <= 3:
                print(f"  WARN: {row['path']}: {e}")

        if (i + 1) % 100 == 0:
            print(f"  ... {i + 1}/{len(rows)}")

    if failures:
        print(f"  {failures} files skipped")

    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--out", type=str, default="services/ml/artifacts/baselines.json")
    parser.add_argument("--max_samples", type=int, default=500)
    args = parser.parse_args()

    values = extract_all_biomarker_values(args.manifest, args.max_samples)

    baselines: dict[str, dict[str, float]] = {}
    for key, vals in values.items():
        if not vals:
            print(f"  WARNING: no values for {key}; using defaults")
            continue
        arr = np.array(vals)
        baselines[key] = {
            "mean": round(float(arr.mean()), 6),
            "std":  round(float(arr.std()), 6),
            "p10":  round(float(np.percentile(arr, 10)), 6),
            "p25":  round(float(np.percentile(arr, 25)), 6),
            "p50":  round(float(np.percentile(arr, 50)), 6),
            "p75":  round(float(np.percentile(arr, 75)), 6),
            "p90":  round(float(np.percentile(arr, 90)), 6),
            "n":    len(vals),
        }
        print(f"  {key}: p10={baselines[key]['p10']:.4f} p90={baselines[key]['p90']:.4f} (n={len(vals)})")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(baselines, f, indent=2)
    print(f"\nBaselines saved to {out_path}")


if __name__ == "__main__":
    main()
