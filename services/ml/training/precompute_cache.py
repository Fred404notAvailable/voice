"""
precompute_cache.py — Pre-compute log-mel spectrograms for all manifest entries
and save as a flat NumPy memmap (or .npz files) for fast training.

This converts FLAC I/O + mel computation (slow) into a single upfront pass,
so subsequent training epochs read pre-computed tensors directly.

Output:
    data/processed/mel_cache_{split}.npz
        - 'mels':   float16 array of shape (N, 64, 101)
        - 'labels': int8    array of shape (N,)
        - 'paths':  list of original paths (for debugging)

Usage:
    python services/ml/training/precompute_cache.py \\
        --manifest data/processed/manifest_full.csv \\
        --out_dir  data/processed \\
        --splits   train dev eval \\
        --workers  4
"""
import argparse
import csv
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from training.dataset import load_audio_1s, log_mel


def _process_row(args):
    path, label = args
    y = load_audio_1s(path)
    if y is None:
        y = np.zeros(16000, dtype=np.float32)
    mel = log_mel(y).astype(np.float16)   # (64, 101) float16 → ~13 KB each
    return mel, int(label)


def precompute_split(rows: list[dict], out_path: Path, workers: int = 0):
    n = len(rows)
    print(f"  Processing {n} utterances -> {out_path.name} ...")

    args_list = [(r["path"], r["label"]) for r in rows]


    mels   = np.zeros((n, 64, 101), dtype=np.float16)
    labels = np.zeros(n, dtype=np.int8)
    paths  = []

    if workers > 0:
        # Parallel processing
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(_process_row, a): i for i, a in enumerate(args_list)}
            done = 0
            for fut in as_completed(futures):
                i = futures[fut]
                mel, label = fut.result()
                mels[i]   = mel
                labels[i] = label
                done += 1
                if done % 1000 == 0:
                    print(f"    {done}/{n} ({done/n*100:.1f}%)")
    else:
        # Single-process (safer on Windows)
        for i, (path, label) in enumerate(args_list):
            y = load_audio_1s(path)
            if y is None:
                y = np.zeros(16000, dtype=np.float32)
            mels[i]   = log_mel(y).astype(np.float16)
            labels[i] = int(label)
            paths.append(path)
            if (i + 1) % 1000 == 0:
                print(f"    {i+1}/{n} ({(i+1)/n*100:.1f}%)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(str(out_path), mels=mels, labels=labels)
    size_mb = out_path.stat().st_size / 1e6
    print(f"  Saved {out_path.name}  ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="data/processed/manifest_full.csv")
    parser.add_argument("--out_dir",  default="data/processed")
    parser.add_argument("--splits",   nargs="+", default=["train", "dev"])
    parser.add_argument("--workers",  type=int, default=0,
                        help="ProcessPoolExecutor workers (0=single process, safer on Windows)")
    args = parser.parse_args()

    # Load manifest
    rows_by_split: dict[str, list[dict]] = {}
    with open(args.manifest, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["condition"] != "clean":
                continue  # cache only clean for now
            s = row["split"]
            rows_by_split.setdefault(s, []).append(row)

    for split in args.splits:
        rows = rows_by_split.get(split, [])
        if not rows:
            print(f"  No rows for split={split}")
            continue
        out_path = Path(args.out_dir) / f"mel_cache_{split}.npz"
        if out_path.exists():
            print(f"  {out_path.name} already exists — skipping. Delete to regenerate.")
            continue
        precompute_split(rows, out_path, workers=args.workers)

    print("\nDone. Use CachedSpoofDataset in training for fast epoch iteration.")


if __name__ == "__main__":
    main()
