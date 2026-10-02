"""
train_cnn.py — Phase 4 (full-data retraining): Train SpoofCNN on log-mel spectrograms.

Key improvements over the initial run:
  - SE-ResNet architecture (wider channels, SE attention)
  - SpecAugment (time/frequency masking)
  - Mixup regularisation (alpha=0.4)
  - Weighted sampler to compensate for ASVspoof's heavy spoof skew (~1:9 bonafide:spoof)
  - Focal loss with class weighting
  - Cosine annealing with warm restarts

Improvements over the initial run:
  - SE-ResNet architecture (see app/model.py)
  - SpecAugment in dataset (time + frequency masking)
  - Mixup regularisation (alpha=0.4)
  - Cosine annealing LR scheduler with warm restarts (T_0=10 epochs)
  - Focal loss (gamma=2) to down-weight easy negatives
  - Gradient clipping at 5.0
  - Save best checkpoint by dev EER

Usage:
    python services/ml/training/train_cnn.py \\
        --manifest data/processed/manifest_full.csv \\
        --epochs 50 \\
        --batch 64 \\
        --lr 5e-4 \\
        --out services/ml/artifacts/model.pt

Acceptance: EER <= 10% on dev split.
"""
import argparse
import json
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import WeightedRandomSampler
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from app.model import SpoofCNN
from training.dataset import SpoofDataset, CachedSpoofDataset


# ─────────────────────────────────────────────────────────────
# Focal loss
# ─────────────────────────────────────────────────────────────

class FocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, label_smoothing: float = 0.05, class_weights: Optional[torch.Tensor] = None):
        super().__init__()
        self.gamma = gamma
        self.label_smoothing = label_smoothing
        self.class_weights = class_weights  # (2,) tensor or None

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        weight = self.class_weights.to(logits.device) if self.class_weights is not None else None
        ce = F.cross_entropy(logits, targets, reduction="none",
                             label_smoothing=self.label_smoothing,
                             weight=weight)
        probs = torch.softmax(logits, dim=1)
        p_t = probs[torch.arange(len(targets)), targets]
        focal = (1 - p_t) ** self.gamma * ce
        return focal.mean()


# ─────────────────────────────────────────────────────────────
# Mixup
# ─────────────────────────────────────────────────────────────

def mixup_batch(x: torch.Tensor, y: torch.Tensor, alpha: float = 0.4):
    """Mixup augmentation for a batch. Returns mixed (x, y_a, y_b, lam)."""
    if alpha <= 0:
        return x, y, y, 1.0
    lam = float(np.random.beta(alpha, alpha))
    idx = torch.randperm(x.size(0), device=x.device)
    mixed_x = lam * x + (1 - lam) * x[idx]
    return mixed_x, y, y[idx], lam


def mixup_criterion(criterion, logits, y_a, y_b, lam):
    return lam * criterion(logits, y_a) + (1 - lam) * criterion(logits, y_b)


# ─────────────────────────────────────────────────────────────
# EER
# ─────────────────────────────────────────────────────────────

def compute_eer(labels: np.ndarray, scores: np.ndarray) -> tuple[float, float]:
    """Compute EER and the threshold at EER."""
    thresholds = np.linspace(0, 1, 500)
    fprs, fnrs = [], []
    for t in thresholds:
        pred = (scores >= t).astype(int)
        fp   = ((pred == 1) & (labels == 0)).sum()
        fn   = ((pred == 0) & (labels == 1)).sum()
        tn   = ((pred == 0) & (labels == 0)).sum()
        tp   = ((pred == 1) & (labels == 1)).sum()
        fprs.append(fp / (fp + tn + 1e-9))
        fnrs.append(fn / (fn + tp + 1e-9))

    fprs, fnrs = np.array(fprs), np.array(fnrs)
    diff = fnrs - fprs
    try:
        from scipy.interpolate import interp1d
        from scipy.optimize import brentq
        eer_thresh = brentq(interp1d(thresholds, diff), thresholds[0], thresholds[-1])
        eer = float(interp1d(thresholds, fprs)(eer_thresh))
    except Exception:
        eer       = float(np.abs(diff).min())
        eer_thresh = float(thresholds[np.abs(diff).argmin()])
    return eer, eer_thresh


# ─────────────────────────────────────────────────────────────
# Evaluation
# ─────────────────────────────────────────────────────────────

def evaluate(model: SpoofCNN, loader: DataLoader, device: torch.device) -> dict:
    model.eval()
    all_labels, all_probs = [], []
    total_loss = 0.0
    criterion  = nn.CrossEntropyLoss(label_smoothing=0.0)

    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            out  = model(x)
            if isinstance(out, tuple):
                out = out[0]
            total_loss += criterion(out, y).item() * len(y)
            probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
            all_probs.extend(probs.tolist())
            all_labels.extend(y.cpu().numpy().tolist())

    labels = np.array(all_labels)
    probs  = np.array(all_probs)
    acc    = float((probs.round() == labels).mean())
    eer, eer_thresh = compute_eer(labels, probs)
    return {
        "loss":      total_loss / max(len(labels), 1),
        "acc":       acc,
        "eer":       eer,
        "eer_thresh": eer_thresh,
    }


# ─────────────────────────────────────────────────────────────
# Training loop
# ─────────────────────────────────────────────────────────────

def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on: {device}")
    if device.type == "cuda":
        print(f"  GPU: {torch.cuda.get_device_name(0)}")

    def _make_ds(split, augment):
        """Use cached npz if available, otherwise fall back to live FLAC loading."""
        cache_path = Path(args.cache_dir) / f"mel_cache_{split}.npz"
        if cache_path.exists():
            print(f"  [{split}] Using cache: {cache_path}")
            return CachedSpoofDataset(cache_path, augment=augment, spec_aug_prob=0.5)
        else:
            print(f"  [{split}] No cache found — loading from FLAC (slow). Run precompute_cache.py first.")
            return SpoofDataset(
                args.manifest, split=split, augment=augment,
                noise_prob=0.3, spec_aug_prob=0.5,
            )

    train_ds = _make_ds("train", augment=True)
    dev_ds   = _make_ds("dev",   augment=False)

    # Build weighted sampler to balance bonafide:spoof
    labels_train = [int(r["label"]) for r in train_ds.rows]
    n_bonafide = labels_train.count(0)
    n_spoof    = labels_train.count(1)
    total_train = len(labels_train)
    print(f"  Train class distribution: bonafide={n_bonafide}, spoof={n_spoof}")

    if args.balance and n_bonafide > 0 and n_spoof > 0:
        # Weight each sample inversely proportional to its class frequency
        w_bonafide = total_train / (2.0 * n_bonafide)
        w_spoof    = total_train / (2.0 * n_spoof)
        sample_weights = torch.tensor(
            [w_bonafide if l == 0 else w_spoof for l in labels_train], dtype=torch.float
        )
        sampler = WeightedRandomSampler(sample_weights, num_samples=total_train, replacement=True)
        train_loader = DataLoader(
            train_ds, batch_size=args.batch, sampler=sampler,
            num_workers=args.workers, pin_memory=(device.type == "cuda"),
            persistent_workers=(args.workers > 0),
        )
        # Class weights for loss (bonafide upweighted)
        class_weights = torch.tensor([w_bonafide, w_spoof], dtype=torch.float)
        print(f"  WeightedSampler: w_bonafide={w_bonafide:.2f}, w_spoof={w_spoof:.2f}")
    else:
        train_loader = DataLoader(
            train_ds, batch_size=args.batch, shuffle=True,
            num_workers=args.workers, pin_memory=(device.type == "cuda"),
            persistent_workers=(args.workers > 0),
        )
        class_weights = None
    dev_loader = DataLoader(
        dev_ds, batch_size=args.batch * 2, shuffle=False,
        num_workers=args.workers,
    )

    model     = SpoofCNN().to(device)
    criterion = FocalLoss(gamma=2.0, label_smoothing=0.05, class_weights=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=2e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=args.T0, T_mult=1, eta_min=args.lr * 0.01,
    )

    best_eer  = float("inf")
    best_path = Path(args.out)
    best_path.parent.mkdir(parents=True, exist_ok=True)

    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0         = time.perf_counter()
        train_loss = 0.0
        n_samples  = 0

        for x, y in train_loader:
            x, y = x.to(device), y.to(device)

            # Mixup
            mixed_x, y_a, y_b, lam = mixup_batch(x, y, alpha=args.mixup_alpha)

            optimizer.zero_grad()
            out = model(mixed_x)
            if isinstance(out, tuple):
                out = out[0]

            loss = mixup_criterion(criterion, out, y_a, y_b, lam)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()

            train_loss += loss.item() * len(y)
            n_samples  += len(y)

        scheduler.step(epoch)
        train_loss /= n_samples

        dev_metrics = evaluate(model, dev_loader, device)
        elapsed     = time.perf_counter() - t0
        lr_now      = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch {epoch:3d}/{args.epochs} | "
            f"lr={lr_now:.2e} | "
            f"train_loss={train_loss:.4f} | "
            f"dev_loss={dev_metrics['loss']:.4f} | "
            f"dev_acc={dev_metrics['acc']:.3f} | "
            f"EER={dev_metrics['eer']*100:.2f}% | "
            f"{elapsed:.1f}s"
        )

        row = {
            "epoch": epoch,
            "lr": round(lr_now, 8),
            "train_loss": round(train_loss, 4),
            **{k: round(v, 4) for k, v in dev_metrics.items()},
        }
        history.append(row)

        if dev_metrics["eer"] < best_eer:
            best_eer = dev_metrics["eer"]
            torch.save(model.state_dict(), best_path)
            print(f"  -> Saved best model (EER={best_eer*100:.2f}%)")

    # Save history
    hist_path = best_path.parent / "training_history.json"
    with open(hist_path, "w") as f:
        json.dump(history, f, indent=2)

    print(f"\nTraining complete. Best dev EER: {best_eer*100:.2f}%")
    print(f"Model saved to: {best_path}")
    print(f"History saved to: {hist_path}")

    if best_eer > 0.10:
        print("WARNING: Best EER exceeds 10% target — check data or increase epochs")
    else:
        print("SUCCESS: Best EER is within 10% target")


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest",     type=str,   default="data/processed/manifest_full.csv")
    parser.add_argument("--cache_dir",    type=str,   default="data/processed",
                        help="Directory containing mel_cache_train.npz / mel_cache_dev.npz")
    parser.add_argument("--epochs",       type=int,   default=50)
    parser.add_argument("--batch",        type=int,   default=64)
    parser.add_argument("--lr",           type=float, default=5e-4)
    parser.add_argument("--T0",           type=int,   default=10,  help="CosineAnnealingWarmRestarts period")
    parser.add_argument("--mixup_alpha",  type=float, default=0.4, help="Mixup beta distribution alpha (0=off)")
    parser.add_argument("--workers",      type=int,   default=0,   help="DataLoader num_workers")
    parser.add_argument("--balance",      action="store_true", default=True,
                        help="Use WeightedRandomSampler + class weights to balance bonafide/spoof")
    parser.add_argument("--no-balance",   dest="balance", action="store_false")
    parser.add_argument("--out",          type=str,   default="services/ml/artifacts/model.pt")
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
