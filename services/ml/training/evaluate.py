"""
evaluate.py — Phase 7: Full evaluation on clean + codec-degraded splits.

Produces docs/RESULTS.md and artifacts/metrics.json.

Usage:
    python -m training.evaluate \
        --manifest data/processed/manifest.csv \
        --model services/ml/artifacts/model.pt \
        --calibration services/ml/artifacts/calibration.json \
        --out services/ml/artifacts/metrics.json \
        --results_md docs/RESULTS.md
"""
import argparse
import json
import sys
from pathlib import Path
from collections import defaultdict

import numpy as np
import torch
from torch.utils.data import DataLoader

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from app.model import SpoofCNN
from app.calibration import load_temperature
from training.dataset import SpoofDataset
from training.train_cnn import compute_eer


def evaluate_split(model, loader, temperature: float, device) -> dict:
    model.eval()
    all_labels, all_probs = [], []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            out = model(x)
            if isinstance(out, tuple):
                out = out[0]
            logit_diff = (out[:, 1] - out[:, 0]).cpu().numpy()
            probs = 1.0 / (1.0 + np.exp(-logit_diff / max(1e-4, temperature)))
            all_probs.extend(probs.tolist())
            all_labels.extend(y.numpy().tolist())

    labels = np.array(all_labels)
    probs = np.array(all_probs)
    acc = float((probs.round() == labels).mean())
    eer, _ = compute_eer(labels, probs)
    return {"n": len(labels), "acc": round(acc, 4), "eer": round(eer, 4)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--model", type=str, default="services/ml/artifacts/model.pt")
    parser.add_argument("--calibration", type=str, default="services/ml/artifacts/calibration.json")
    parser.add_argument("--out", type=str, default="services/ml/artifacts/metrics.json")
    parser.add_argument("--results_md", type=str, default="docs/RESULTS.md")
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"ERROR: model.pt not found at {model_path}")
        sys.exit(1)

    device = torch.device("cpu")
    model = SpoofCNN()
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()
    temperature = load_temperature(Path(args.calibration))
    print(f"Loaded model. Temperature = {temperature}")

    all_metrics: dict[str, dict] = {}

    # Evaluate per split & per condition
    import csv
    conditions = set()
    with open(args.manifest, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            conditions.add(row["condition"])
    conditions = sorted(conditions)

    for split in ("dev", "eval"):
        for condition in conditions:
            try:
                ds = SpoofDataset(
                    args.manifest, split=split, augment=False,
                    condition_filter=[condition]
                )
                loader = DataLoader(ds, batch_size=64, shuffle=False, num_workers=0)
                metrics = evaluate_split(model, loader, temperature, device)
                key = f"{split}_{condition}"
                all_metrics[key] = metrics
                print(f"  [{key}]: acc={metrics['acc']:.3f} EER={metrics['eer']*100:.2f}% (n={metrics['n']})")
            except ValueError:
                pass  # no rows for this split/condition combo

    # Save metrics JSON
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(all_metrics, f, indent=2)
    print(f"\nMetrics saved to {args.out}")

    # Update RESULTS.md
    md_lines = [
        "# VoiceSentry Results & Evaluation Metrics\n\n",
        "## Model Evaluation\n\n",
        "| Split | Condition | N | Accuracy | EER |\n",
        "|---|---|---|---|---|\n",
    ]
    for key, m in sorted(all_metrics.items()):
        split, condition = key.split("_", 1)
        md_lines.append(f"| {split} | {condition} | {m['n']} | {m['acc']*100:.1f}% | {m['eer']*100:.2f}% |\n")

    md_lines.append("\n## Latency Targets vs Actual\n\n")
    md_lines.append("| Metric | Target | Hard Floor | Actual Measured |\n")
    md_lines.append("|---|---|---|---|\n")
    md_lines.append("| ML time per 1s window (CPU) | ≤150ms | ≤300ms | _Pending bench_latency.py_ |\n")
    md_lines.append("| End-to-end latency | ≤400ms | ≤800ms | _Pending bench_latency.py_ |\n")
    md_lines.append("| Time-to-verdict (obvious clone) | ≤2.5s | ≤4s | _Pending manual test_ |\n")

    results_path = Path(args.results_md)
    results_path.parent.mkdir(parents=True, exist_ok=True)
    with open(results_path, "w", encoding="utf-8") as f:
        f.writelines(md_lines)
    print(f"RESULTS.md updated at {results_path}")


if __name__ == "__main__":
    main()
