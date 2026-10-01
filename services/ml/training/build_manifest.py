"""
build_manifest.py — Phase 2

Parse ASVspoof 2019 LA protocol files and build data/processed/manifest.csv.

Usage:
    python -m training.build_manifest \
        --data_root data/raw/ASVspoof2019_LA \
        --out data/processed/manifest.csv \
        --train_cap 6000 \
        --dev_cap 1500 \
        --eval_cap 3000

Protocol file format (space-separated, 5 fields):
    SPEAKER_ID  UTTERANCE_ID  -  SYSTEM_ID  KEY
where KEY is 'bonafide' or 'spoof' and SYSTEM_ID is the attack (e.g. A01).
"""
import argparse
import csv
import os
import random
from pathlib import Path

import soundfile as sf


PROTOCOL_FILES = {
    "train": "ASVspoof2019.LA.cm.train.trn.txt",
    "dev":   "ASVspoof2019.LA.cm.dev.trl.txt",
    "eval":  "ASVspoof2019.LA.cm.eval.trl.txt",
}

AUDIO_DIRS = {
    "train": "ASVspoof2019_LA_train/flac",
    "dev":   "ASVspoof2019_LA_dev/flac",
    "eval":  "ASVspoof2019_LA_eval/flac",
}

PROTOCOL_DIR = "ASVspoof2019_LA_cm_protocols"


def parse_protocol(proto_path: Path) -> list[dict]:
    rows = []
    with open(proto_path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 5:
                continue
            speaker, utt_id, _, system_id, key = parts[0], parts[1], parts[2], parts[3], parts[4]
            label = 0 if key == "bonafide" else 1
            rows.append({
                "utterance_id": utt_id,
                "speaker": speaker,
                "system_id": system_id,
                "key": key,
                "label": label,
            })
    return rows


def get_duration(path: Path) -> float:
    try:
        info = sf.info(str(path))
        return info.duration
    except Exception:
        return 0.0


def subsample_balanced(rows: list[dict], cap: int, seed: int = 42) -> list[dict]:
    """Subsample to `cap` total, keeping roughly 1:1 bonafide:spoof."""
    bonafide = [r for r in rows if r["label"] == 0]
    spoof = [r for r in rows if r["label"] == 1]

    rng = random.Random(seed)
    rng.shuffle(bonafide)
    rng.shuffle(spoof)

    half = cap // 2
    selected = bonafide[:half] + spoof[:half]

    # If one class is short, fill up from the other
    if len(bonafide) < half:
        selected = bonafide + spoof[: cap - len(bonafide)]
    elif len(spoof) < half:
        selected = spoof + bonafide[: cap - len(spoof)]

    rng.shuffle(selected)
    return selected[:cap]


def build_manifest(data_root: Path, out_path: Path, caps: dict[str, int]) -> None:
    proto_root = data_root / PROTOCOL_DIR
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["path", "label", "attack_id", "split", "condition", "duration_s"]
    rows_all: list[dict] = []

    for split in ("train", "dev", "eval"):
        proto_file = proto_root / PROTOCOL_FILES[split]
        if not proto_file.exists():
            print(f"WARNING: Protocol file not found: {proto_file}")
            continue

        audio_dir = data_root / AUDIO_DIRS[split]
        parsed = parse_protocol(proto_file)
        print(f"  {split}: {len(parsed)} utterances in protocol")

        cap = caps.get(split, len(parsed))
        selected = subsample_balanced(parsed, cap)
        print(f"  {split}: keeping {len(selected)} (cap={cap})")

        for r in selected:
            flac_path = audio_dir / f"{r['utterance_id']}.flac"
            if not flac_path.exists():
                # Try without extension
                flac_path = audio_dir / r["utterance_id"]

            duration = get_duration(flac_path) if flac_path.exists() else 0.0

            rows_all.append({
                "path": str(flac_path),
                "label": r["label"],
                "attack_id": r["system_id"],
                "split": split,
                "condition": "clean",
                "duration_s": round(duration, 3),
            })

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_all)

    # Print summary
    from collections import Counter
    c = Counter((r["split"], r["label"]) for r in rows_all)
    print(f"\nManifest written to {out_path} ({len(rows_all)} total rows)")
    for (split, label), count in sorted(c.items()):
        tag = "bonafide" if label == 0 else "spoof"
        print(f"  {split:8s} | {tag:9s}: {count}")

    # Record attack split info
    attacks_in_train_dev = set()
    attacks_in_eval = set()
    for r in rows_all:
        if r["split"] in ("train", "dev") and r["label"] == 1:
            attacks_in_train_dev.add(r["attack_id"])
        elif r["split"] == "eval" and r["label"] == 1:
            attacks_in_eval.add(r["attack_id"])
    unseen = attacks_in_eval - attacks_in_train_dev
    seen = attacks_in_eval & attacks_in_train_dev
    print(f"\nAttack split:")
    print(f"  Train/Dev attacks: {sorted(attacks_in_train_dev)}")
    print(f"  Eval attacks (seen in train/dev): {sorted(seen)}")
    print(f"  Eval attacks (UNSEEN / held-out generators): {sorted(unseen)}")


def main():
    parser = argparse.ArgumentParser(description="Build ASVspoof manifest CSV")
    parser.add_argument("--data_root", type=Path, default=Path("data/raw/ASVspoof2019_LA"),
                        help="Root containing ASVspoof2019_LA_cm_protocols and audio dirs")
    parser.add_argument("--out", type=Path, default=Path("data/processed/manifest.csv"))
    parser.add_argument("--train_cap", type=int, default=6000)
    parser.add_argument("--dev_cap", type=int, default=1500)
    parser.add_argument("--eval_cap", type=int, default=3000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    caps = {"train": args.train_cap, "dev": args.dev_cap, "eval": args.eval_cap}
    build_manifest(args.data_root, args.out, caps)


if __name__ == "__main__":
    main()
