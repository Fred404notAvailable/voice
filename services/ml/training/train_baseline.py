"""
train_baseline.py — Phase 3: Train the handcrafted-feature fallback model.

Extracts 19-dim feature vectors from all train/dev utterances and fits
a LogisticRegression pipeline. Evaluates EER on dev set.

Usage:
    python -m training.train_baseline \
        --manifest data/processed/manifest.csv \
        --out services/ml/artifacts/fallback.pkl
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from app.fallback import extract_fallback_features, FallbackClassifier


def load_features_from_manifest(manifest_path: str, split: str) -> tuple[np.ndarray, np.ndarray]:
    rows = []
    with open(manifest_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["split"] == split:
                rows.append(row)

    print(f"  Extracting features for {split} ({len(rows)} files)...")
    X, y = [], []
    failures = 0
    for i, row in enumerate(rows):
        try:
            import soundfile as sf
            import librosa
            data, sr = sf.read(row["path"], always_2d=False)
            if len(data.shape) > 1:
                data = data.mean(axis=1)
            data = data.astype(np.float32)
            if sr != 16000:
                data = librosa.resample(data, orig_sr=sr, target_sr=16000)
            # Crop or pad to 1 second
            if len(data) >= 16000:
                data = data[:16000]
            else:
                padded = np.zeros(16000, dtype=np.float32)
                padded[:len(data)] = data
                data = padded
            feat = extract_fallback_features(data)
            X.append(feat)
            y.append(int(row["label"]))
        except Exception as e:
            failures += 1
            if failures <= 5:
                print(f"    WARN: failed on {row['path']}: {e}")
        if (i + 1) % 500 == 0:
            print(f"    ... {i + 1}/{len(rows)}")

    if failures > 0:
        print(f"  {failures} files failed to load")
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


def compute_eer(labels: np.ndarray, scores: np.ndarray) -> float:
    thresholds = np.linspace(0, 1, 500)
    best = float("inf")
    for t in thresholds:
        pred = (scores >= t).astype(int)
        fp = ((pred == 1) & (labels == 0)).sum()
        fn = ((pred == 0) & (labels == 1)).sum()
        tn = ((pred == 0) & (labels == 0)).sum()
        tp = ((pred == 1) & (labels == 1)).sum()
        fpr = fp / (fp + tn + 1e-9)
        fnr = fn / (fn + tp + 1e-9)
        best = min(best, abs(fpr - fnr))
    return best


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--out", type=str, default="services/ml/artifacts/fallback.pkl")
    args = parser.parse_args()

    X_train, y_train = load_features_from_manifest(args.manifest, "train")
    X_dev, y_dev = load_features_from_manifest(args.manifest, "dev")

    print(f"Train: {X_train.shape}, Dev: {X_dev.shape}")

    clf = FallbackClassifier()
    clf.fit(X_train, y_train)

    # Evaluate on dev
    from sklearn.metrics import accuracy_score
    probs_dev = np.array([clf._model.predict_proba(X_dev[i:i+1])[0][1] for i in range(len(X_dev))])
    acc = accuracy_score(y_dev, (probs_dev > 0.5).astype(int))
    eer = compute_eer(y_dev, probs_dev)
    print(f"Dev accuracy: {acc:.3f} | Dev EER: {eer*100:.2f}%")

    out_path = Path(args.out)
    clf.save(out_path)

    # Save metrics
    metrics = {"fallback_dev_acc": round(acc, 4), "fallback_dev_eer": round(eer, 4)}
    metrics_path = out_path.parent / "fallback_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved to {metrics_path}")


if __name__ == "__main__":
    main()
