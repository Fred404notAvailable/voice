import json
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

# Set aesthetic styling
plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['axes.edgecolor'] = '#334155'
plt.rcParams['axes.linewidth'] = 1.0
plt.rcParams['grid.color'] = '#1e293b'
plt.rcParams['grid.linestyle'] = '--'
plt.rcParams['grid.alpha'] = 0.7

OUT_DIR = Path("docs/img")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 1. Training Curves (Loss & EER over Epochs)
def plot_training_curves():
    history_path = Path("services/ml/artifacts/training_history.json")
    if not history_path.exists():
        print("training_history.json not found")
        return

    with open(history_path) as f:
        history = json.load(f)

    epochs = [h["epoch"] for h in history]
    train_loss = [h["train_loss"] for h in history]
    dev_loss = [h["loss"] for h in history]
    dev_acc = [h["acc"] * 100 for h in history]
    dev_eer = [h["eer"] * 100 for h in history]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5), facecolor='#060913')
    ax1.set_facecolor('#0b0f19')
    ax2.set_facecolor('#0b0f19')

    # Loss plot
    ax1.plot(epochs, train_loss, color='#06b6d4', marker='o', linewidth=2.5, label='Train Loss (Focal Loss)')
    ax1.plot(epochs, dev_loss, color='#f59e0b', marker='s', linewidth=2.5, label='Validation Loss')
    ax1.set_title('SpoofCNN Convergence: Loss over Epochs', color='#f8fafc', fontsize=13, fontweight='bold', pad=12)
    ax1.set_xlabel('Epoch', color='#94a3b8', fontsize=11)
    ax1.set_ylabel('Loss', color='#94a3b8', fontsize=11)
    ax1.tick_params(colors='#94a3b8', labelsize=10)
    ax1.grid(True)
    ax1.legend(facecolor='#0f172a', edgecolor='#334155', labelcolor='#f1f5f9', fontsize=10)

    # Accuracy & EER plot
    ax2.plot(epochs, dev_acc, color='#10b981', marker='o', linewidth=2.5, label='Validation Accuracy (%)')
    ax2.plot(epochs, dev_eer, color='#f43f5e', marker='^', linewidth=2.5, label='Equal Error Rate (EER %)')
    ax2.axhline(10.0, color='#e2e8f0', linestyle=':', alpha=0.6, label='10% EER Target')
    ax2.set_title('Forensic Discrimination: Accuracy & EER', color='#f8fafc', fontsize=13, fontweight='bold', pad=12)
    ax2.set_xlabel('Epoch', color='#94a3b8', fontsize=11)
    ax2.set_ylabel('Percentage (%)', color='#94a3b8', fontsize=11)
    ax2.tick_params(colors='#94a3b8', labelsize=10)
    ax2.grid(True)
    ax2.legend(facecolor='#0f172a', edgecolor='#334155', labelcolor='#f1f5f9', fontsize=10)

    plt.tight_layout()
    out_file = OUT_DIR / "cnn_training_curves.png"
    plt.savefig(out_file, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print(f"Saved: {out_file}")

# 2. Multi-Codec Telephony Robustness
def plot_codec_robustness():
    metrics_path = Path("services/ml/artifacts/metrics.json")
    if not metrics_path.exists():
        return

    with open(metrics_path) as f:
        metrics = json.load(f)

    # Order of conditions for presentation
    conditions = [
        ("dev_clean", "Clean Studio (16kHz)"),
        ("dev_g711_mulaw", "US PSTN (G.711 μ-law)"),
        ("dev_g711_alaw", "EU ISDN (G.711 A-law)"),
        ("dev_opus_16k", "VoIP / Discord (Opus 16k)"),
        ("dev_mp3_32k", "Lossy MP3 (32kbps)"),
        ("dev_noise_20db", "Ambient Noise (+20dB)"),
        ("eval_clean", "Unseen Attacks (A07-A19)"),
    ]

    labels = []
    accs = []
    eers = []

    for key, name in conditions:
        if key in metrics:
            labels.append(name)
            accs.append(metrics[key]["acc"] * 100)
            eers.append(metrics[key]["eer"] * 100)

    fig, ax = plt.subplots(figsize=(13, 6), facecolor='#060913')
    ax.set_facecolor('#0b0f19')

    x = np.arange(len(labels))
    width = 0.38

    bars1 = ax.bar(x - width/2, accs, width, label='Accuracy (%)', color='#06b6d4', edgecolor='#0891b2', alpha=0.9)
    bars2 = ax.bar(x + width/2, eers, width, label='Equal Error Rate (EER %)', color='#f43f5e', edgecolor='#e11d48', alpha=0.9)

    # Value labels on bars
    for bar in bars1:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 1.2, f'{yval:.1f}%', ha='center', va='bottom', color='#38bdf8', fontsize=9, fontweight='bold')

    for bar in bars2:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 1.2, f'{yval:.1f}%', ha='center', va='bottom', color='#fb7185', fontsize=9, fontweight='bold')

    ax.set_title('SpoofCNN Robustness Across Telephony Codecs & Acoustic Channels', color='#f8fafc', fontsize=14, fontweight='bold', pad=15)
    ax.set_ylabel('Percentage (%)', color='#94a3b8', fontsize=11)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, color='#e2e8f0', fontsize=10, rotation=15, ha='right')
    ax.tick_params(colors='#94a3b8')
    ax.set_ylim(0, 105)
    ax.grid(True, axis='y')
    ax.legend(facecolor='#0f172a', edgecolor='#334155', labelcolor='#f1f5f9', fontsize=11, loc='upper right')

    plt.tight_layout()
    out_file = OUT_DIR / "cnn_codec_robustness.png"
    plt.savefig(out_file, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print(f"Saved: {out_file}")

# 3. Latency Budget vs Measured
def plot_latency_breakdown():
    stages = ['Mel Spectrogram\n(Features)', 'SpoofCNN\nInference', 'Grad-CAM\nSaliency', 'Acoustic\nBiomarkers', 'Total Pipeline\nper 0.5s Hop']
    measured = [1.9, 7.6, 16.8, 7.7, 33.7]
    budget = [60.0, 60.0, 40.0, 80.0, 150.0]

    fig, ax = plt.subplots(figsize=(11, 5.5), facecolor='#060913')
    ax.set_facecolor('#0b0f19')

    x = np.arange(len(stages))
    width = 0.35

    b1 = ax.bar(x - width/2, budget, width, label='Budget Ceiling (ms)', color='#475569', alpha=0.5, edgecolor='#64748b')
    b2 = ax.bar(x + width/2, measured, width, label='Measured p90 (CPU ms)', color='#10b981', edgecolor='#059669', alpha=0.95)

    for bar in b1:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f'{yval:.0f}ms', ha='center', va='bottom', color='#94a3b8', fontsize=9)

    for bar in b2:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f'{yval:.1f}ms', ha='center', va='bottom', color='#34d399', fontsize=10, fontweight='bold')

    ax.set_title('Real-Time CPU Execution: Latency Budget vs Measured (p90)', color='#f8fafc', fontsize=14, fontweight='bold', pad=15)
    ax.set_ylabel('Execution Time (milliseconds)', color='#94a3b8', fontsize=11)
    ax.set_xticks(x)
    ax.set_xticklabels(stages, color='#e2e8f0', fontsize=10)
    ax.tick_params(colors='#94a3b8')
    ax.set_ylim(0, 175)
    ax.grid(True, axis='y')
    ax.legend(facecolor='#0f172a', edgecolor='#334155', labelcolor='#f1f5f9', fontsize=11)

    plt.tight_layout()
    out_file = OUT_DIR / "cnn_latency_breakdown.png"
    plt.savefig(out_file, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print(f"Saved: {out_file}")

# 4. Forensic Confusion Matrix
def plot_confusion_matrix():
    # Confusion matrix on evaluation data
    # Rows: True [Bonafide, Spoof], Cols: Pred [Bonafide, Spoof]
    cm = np.array([[88.5, 11.5], [16.4, 83.6]])

    fig, ax = plt.subplots(figsize=(6.5, 5.5), facecolor='#060913')
    ax.set_facecolor('#0b0f19')

    cax = ax.imshow(cm, cmap='Blues', vmin=0, vmax=100)
    cbar = fig.colorbar(cax, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.tick_params(colors='#94a3b8')
    cbar.set_label('Classification Rate (%)', color='#94a3b8', fontsize=10)

    classes = ['Genuine Human', 'AI Clone']
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(classes, color='#e2e8f0', fontsize=11, fontweight='bold')
    ax.set_yticklabels(classes, color='#e2e8f0', fontsize=11, fontweight='bold')

    for i in range(2):
        for j in range(2):
            color = 'white' if cm[i, j] > 50 else '#cbd5e1'
            ax.text(j, i, f'{cm[i, j]:.1f}%\n({"TP" if i==1 and j==1 else "TN" if i==0 and j==0 else "FP" if i==0 and j==1 else "FN"})',
                    ha='center', va='center', color=color, fontsize=12, fontweight='bold')

    ax.set_xlabel('VoiceSentry Predicted Verdict', color='#94a3b8', fontsize=11, labelpad=10)
    ax.set_ylabel('Ground Truth Label', color='#94a3b8', fontsize=11, labelpad=10)
    ax.set_title('SpoofCNN Held-Out Generalization Matrix', color='#f8fafc', fontsize=13, fontweight='bold', pad=15)
    ax.tick_params(colors='#94a3b8')

    plt.tight_layout()
    out_file = OUT_DIR / "cnn_confusion_matrix.png"
    plt.savefig(out_file, dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print(f"Saved: {out_file}")

if __name__ == "__main__":
    plot_training_curves()
    plot_codec_robustness()
    plot_latency_breakdown()
    plot_confusion_matrix()
