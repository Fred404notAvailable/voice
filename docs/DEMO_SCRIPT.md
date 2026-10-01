# VoiceSentry Demo Script

## Duration: 3 min pitch + 2 min live demo

1. **Hook (20 s)**: A 3-second audio snippet is enough to clone a voice. Caller ID and SMS OTP can be spoofed or bypassed. VoiceSentry is a real-time forensic co-pilot that evaluates incoming voice streams window-by-window and provides visual evidence for verdicts.
2. **Live A/B Demonstration**:
   - Stream authentic audio sample $\to$ Gauge stays in Authentic band (0-35%), heatmap remains dormant.
   - Stream synthetic clone audio $\to$ SPRT risk climbs rapidly, hits Cloned threshold with locked verdict: "Decided at X.Xs". Grad-CAM heatmap highlights synthetic artifact regions.
3. **Forensic Explainability (30 s)**: Walkthrough of spectrogram heatmaps and the 5 acoustic biomarkers (Pitch perturbation, 95% roll-off, 4-8 kHz ratio, flatness, phase coherence).
4. **Telephony & Codec Robustness (30 s)**: Display clean vs phone-codec (G.711, Opus, MP3) performance table.
5. **Honest Limitations (20 s)**: Generalization bounds on novel synthesis algorithms and active retraining loop.
6. **Summary & Closing (10 s)**.
