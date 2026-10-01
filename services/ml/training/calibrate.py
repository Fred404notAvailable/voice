"""
calibrate.py — Phase 4: Temperature scaling calibration on dev split.

Loads trained model.pt, runs inference on the dev set, then finds T* that
minimizes NLL on the dev set probabilities.

Usage:
    python -m training.calibrate \
        --manifest data/processed/manifest.csv \
        --model services/ml/artifacts/model.pt \
        --out services/ml/artifacts/calibration.json
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from app.model import SpoofCNN
from app.calibration import compute_logit_diffs, calibrate_temperature, save_calibration, nll_with_temperature
from training.dataset import SpoofDataset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--model", type=str, default="services/ml/artifacts/model.pt")
    parser.add_argument("--out", type=str, default="services/ml/artifacts/calibration.json")
    parser.add_argument("--batch", type=int, default=64)
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"ERROR: model not found at {model_path}")
        sys.exit(1)

    device = torch.device("cpu")  # calibration always on CPU
    model = SpoofCNN()
    state_dict = torch.load(model_path, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()
    print(f"Loaded model from {model_path}")

    dev_ds = SpoofDataset(args.manifest, split="dev", augment=False)
    dev_loader = DataLoader(dev_ds, batch_size=args.batch, shuffle=False, num_workers=0)

    print("Computing logit diffs on dev set...")
    logit_diffs, labels = compute_logit_diffs(model, dev_loader)

    # Pre-calibration NLL
    nll_before = nll_with_temperature(1.0, logit_diffs, labels)
    print(f"NLL before calibration (T=1.0): {nll_before:.4f}")

    T_star = calibrate_temperature(logit_diffs, labels)

    nll_after = nll_with_temperature(T_star, logit_diffs, labels)
    print(f"NLL after calibration (T={T_star:.4f}): {nll_after:.4f}")

    save_calibration(
        T_star,
        Path(args.out),
        extra={
            "nll_before": round(nll_before, 4),
            "nll_after": round(nll_after, 4),
            "dev_samples": int(len(labels)),
        },
    )
    print(f"Calibration saved to {args.out}")


if __name__ == "__main__":
    main()
