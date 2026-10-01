"""
train_cnn.py — Phase 4: Train SpoofCNN on log-mel spectrograms.

Usage:
    python -m training.train_cnn \
        --manifest data/processed/manifest.csv \
        --epochs 30 \
        --batch 64 \
        --lr 3e-4 \
        --out services/ml/artifacts/model.pt

Acceptance: EER <= 10% on dev split within the training loop printout.
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

# Resolve project root so imports work when called from repo root
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from app.model import SpoofCNN
from training.dataset import SpoofDataset


def compute_eer(labels: np.ndarray, scores: np.ndarray) -> tuple[float, float]:
    """Compute EER and the threshold at EER."""
    from scipy.optimize import brentq
    from scipy.interpolate import interp1d

    thresholds = np.linspace(0, 1, 500)
    fprs, fnrs = [], []
    for t in thresholds:
        pred = (scores >= t).astype(int)
        fp = ((pred == 1) & (labels == 0)).sum()
        fn = ((pred == 0) & (labels == 1)).sum()
        tn = ((pred == 0) & (labels == 0)).sum()
        tp = ((pred == 1) & (labels == 1)).sum()
        fpr = fp / (fp + tn + 1e-9)
        fnr = fn / (fn + tp + 1e-9)
        fprs.append(fpr)
        fnrs.append(fnr)

    fprs, fnrs = np.array(fprs), np.array(fnrs)
    diff = fnrs - fprs
    try:
        eer_thresh = brentq(interp1d(thresholds, diff), thresholds[0], thresholds[-1])
        eer = float(interp1d(thresholds, fprs)(eer_thresh))
    except Exception:
        eer = float(np.abs(diff).min())
        eer_thresh = float(thresholds[np.abs(diff).argmin()])
    return eer, eer_thresh


def evaluate(model: SpoofCNN, loader: DataLoader, device: torch.device) -> dict:
    model.eval()
    all_labels, all_probs = [], []
    total_loss = 0.0
    criterion = nn.CrossEntropyLoss()

    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            out = model(x)
            if isinstance(out, tuple):
                out = out[0]
            loss = criterion(out, y)
            total_loss += loss.item() * len(y)
            probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
            all_probs.extend(probs.tolist())
            all_labels.extend(y.cpu().numpy().tolist())

    labels = np.array(all_labels)
    probs = np.array(all_probs)
    acc = float((probs.round() == labels).mean())
    eer, eer_thresh = compute_eer(labels, probs)
    return {
        "loss": total_loss / len(labels),
        "acc": acc,
        "eer": eer,
        "eer_thresh": eer_thresh,
    }


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on: {device}")

    train_ds = SpoofDataset(args.manifest, split="train", augment=True)
    dev_ds = SpoofDataset(args.manifest, split="dev", augment=False)

    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True,
                              num_workers=0, pin_memory=False)
    dev_loader = DataLoader(dev_ds, batch_size=args.batch, shuffle=False,
                            num_workers=0, pin_memory=False)

    model = SpoofCNN().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)

    best_eer = float("inf")
    best_path = Path(args.out)
    best_path.parent.mkdir(parents=True, exist_ok=True)

    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0 = time.perf_counter()
        train_loss = 0.0
        n_samples = 0

        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            out = model(x)
            if isinstance(out, tuple):
                out = out[0]
            loss = criterion(out, y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            train_loss += loss.item() * len(y)
            n_samples += len(y)

        scheduler.step()
        train_loss /= n_samples

        dev_metrics = evaluate(model, dev_loader, device)
        elapsed = time.perf_counter() - t0

        print(
            f"Epoch {epoch:3d}/{args.epochs} | "
            f"train_loss={train_loss:.4f} | "
            f"dev_loss={dev_metrics['loss']:.4f} | "
            f"dev_acc={dev_metrics['acc']:.3f} | "
            f"EER={dev_metrics['eer']*100:.2f}% | "
            f"{elapsed:.1f}s"
        )

        row = {"epoch": epoch, "train_loss": round(train_loss, 4), **{k: round(v, 4) for k, v in dev_metrics.items()}}
        history.append(row)

        if dev_metrics["eer"] < best_eer:
            best_eer = dev_metrics["eer"]
            torch.save(model.state_dict(), best_path)
            print(f"  -> Saved best model (EER={best_eer*100:.2f}%)")

    # Save training history
    hist_path = best_path.parent / "training_history.json"
    with open(hist_path, "w") as f:
        json.dump(history, f, indent=2)

    print(f"\nTraining complete. Best dev EER: {best_eer*100:.2f}%")
    print(f"Model saved to: {best_path}")
    print(f"History saved to: {hist_path}")

    if best_eer > 0.10:
        print("WARNING: Best EER exceeds 10% target — check data quality or increase epochs")
    else:
        print("SUCCESS: Best EER is within 10% target")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="data/processed/manifest.csv")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--out", type=str, default="services/ml/artifacts/model.pt")
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
