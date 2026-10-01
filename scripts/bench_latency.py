"""
bench_latency.py — Measure end-to-end and per-stage latency.

Runs N rounds of push_pcm_frame through a SessionEngine (with/without model)
and prints a percentile table. Writes results to docs/RESULTS.md.

Usage:
    python scripts/bench_latency.py [--n 100] [--model services/ml/artifacts/model.pt]
"""
import argparse
import sys
import time
import json
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "ml"))

from app.session_engine import SessionEngine


def make_pcm_frame(seed: int = 0) -> bytes:
    """Synthesize 0.5s of 16 kHz int16 PCM (8000 samples)."""
    rng = np.random.default_rng(seed)
    freq = 440.0
    t = np.linspace(0, 0.5, 8000, endpoint=False, dtype=np.float32)
    y = (np.sin(2 * np.pi * freq * t) * 0.5).astype(np.float32)
    return (y * 32767).astype(np.int16).tobytes()


def bench(model=None, temperature: float = 1.0, n: int = 100) -> dict:
    engine = SessionEngine("bench", model=model, temperature=temperature)

    # Pre-fill ring buffer with 2 frames (so we enter the full-window path)
    engine.push_pcm_frame(0, make_pcm_frame(0))
    engine.push_pcm_frame(1, make_pcm_frame(1))

    timings: list[dict] = []
    for i in range(n):
        result = engine.push_pcm_frame(i + 2, make_pcm_frame(i))
        if result.timings_ms:
            timings.append({
                "total": result.timings_ms.total,
                "features": result.timings_ms.features,
                "model": result.timings_ms.model,
                "gradcam": result.timings_ms.gradcam,
                "biomarkers": result.timings_ms.biomarkers,
            })

    stats = {}
    for key in ("total", "features", "model", "gradcam", "biomarkers"):
        arr = np.array([t[key] for t in timings])
        stats[key] = {
            "p50": round(float(np.percentile(arr, 50)), 2),
            "p90": round(float(np.percentile(arr, 90)), 2),
            "p99": round(float(np.percentile(arr, 99)), 2),
            "max": round(float(arr.max()), 2),
        }
    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default=None)
    parser.add_argument("--n", type=int, default=100)
    args = parser.parse_args()

    model = None
    mode = "no-model (echo)"
    if args.model and Path(args.model).exists():
        import torch
        from app.model import SpoofCNN
        model = SpoofCNN()
        model.load_state_dict(torch.load(args.model, map_location="cpu"))
        model.eval()
        mode = f"SpoofCNN ({args.model})"

    print(f"\n=== VoiceSentry Latency Benchmark ===")
    print(f"Mode: {mode}")
    print(f"Rounds: {args.n}\n")

    t0 = time.perf_counter()
    stats = bench(model=model, n=args.n)
    elapsed = time.perf_counter() - t0

    header = f"{'Stage':<12}  {'p50':>8}  {'p90':>8}  {'p99':>8}  {'max':>8}"
    print(header)
    print("-" * len(header))
    for key in ("features", "model", "gradcam", "biomarkers", "total"):
        s = stats[key]
        print(f"{key:<12}  {s['p50']:>7.1f}ms  {s['p90']:>7.1f}ms  {s['p99']:>7.1f}ms  {s['max']:>7.1f}ms")

    print(f"\nTotal bench time: {elapsed:.1f}s for {args.n} rounds")

    # Check against targets
    print("\n=== Target Compliance ===")
    total_p90 = stats["total"]["p90"]
    print(f"ML time per window (p90): {total_p90:.1f}ms -- {'PASS' if total_p90 <= 300 else 'FAIL (target <=300ms)'}")
    target_pass = total_p90 <= 300

    # Save to JSON
    results_dir = Path("docs")
    results_dir.mkdir(exist_ok=True)
    out = {"mode": mode, "n": args.n, "stats": stats, "target_pass": target_pass}
    with open("docs/bench_results.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nResults saved to docs/bench_results.json")
    return 0 if target_pass else 1


if __name__ == "__main__":
    sys.exit(main())
