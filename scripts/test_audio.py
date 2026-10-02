import requests
import json
import sys

url = "http://localhost:8080/api/analyze"
audio_path = sys.argv[1] if len(sys.argv) > 1 else "p_10513780_723.mp3"

with open(audio_path, "rb") as f:
    files = {"file": (audio_path, f, "audio/mpeg")}
    resp = requests.post(url, files=files)

if resp.status_code != 200:
    print(f"HTTP Error {resp.status_code}: {resp.text}")
    sys.exit(1)

data = resp.json()
print("=" * 72)
print("             VOICESENTRY FORENSIC AUDIO ANALYSIS REPORT")
print("=" * 72)
print(f"File Tested   : {audio_path}")
print(f"Duration      : {data.get('duration_s', 0):.2f} seconds")
print(f"Final Verdict : {data.get('verdict')}")
print(f"Decision Time : {data.get('decision_time_s')}s")
print(f"Final Risk    : {data.get('final_risk_pct', 0):.1f}%")
print(f"Total Windows : {len(data.get('windows', []))}")
print("-" * 72)
print(f"{'Seq':<4} | {'Window Time':<12} | {'p_spoof':<8} | {'Risk %':<8} | {'State':<12} | Flagged Biomarkers")
print("-" * 72)

for w in data.get("windows", []):
    seq = w.get("seq")
    t_str = f"{w.get('t_start_s', 0):.1f}s - {w.get('t_end_s', 0):.1f}s"
    p_sp = f"{w.get('p_spoof'):.4f}" if w.get("p_spoof") is not None else "Analyzing"
    risk = f"{w.get('risk_pct', 0):.1f}%"
    st = w.get("state")
    flagged = [b["label"] for b in w.get("biomarkers", []) if b.get("flagged")]
    flag_str = ", ".join(flagged) if flagged else "None"
    print(f"{seq:<4} | {t_str:<12} | {p_sp:<8} | {risk:<8} | {st:<12} | {flag_str}")

if data.get("windows"):
    print("-" * 72)
    print("BIOMARKER SUMMARY ACROSS FULL STREAM (Averaged):")
    biomarker_totals = {}
    for w in data["windows"]:
        for b in w.get("biomarkers", []):
            k = b["key"]
            if k not in biomarker_totals:
                biomarker_totals[k] = {
                    "label": b["label"],
                    "unit": b["unit"],
                    "values": [],
                    "baseline_low": b["baseline_low"],
                    "baseline_high": b["baseline_high"],
                    "flagged_count": 0,
                }
            biomarker_totals[k]["values"].append(b["value"])
            if b.get("flagged"):
                biomarker_totals[k]["flagged_count"] += 1

    total_w = len(data["windows"])
    for k, info in biomarker_totals.items():
        avg_val = sum(info["values"]) / len(info["values"])
        pct_flagged = (info["flagged_count"] / total_w) * 100
        status = "ANOMALOUS" if pct_flagged >= 40 else "NATURAL"
        print(f"  * {info['label']:<24}: avg {avg_val:.4f} {info['unit']} (Human Baseline: {info['baseline_low']:.4f} to {info['baseline_high']:.4f}) | Flagged in {info['flagged_count']}/{total_w} ({pct_flagged:.0f}%) [{status}]")

print("=" * 72)
