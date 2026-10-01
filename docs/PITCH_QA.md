# Anticipated Judge Q&A

- **Q: How does VoiceSentry handle generators it has never seen?**
  - *A*: VoiceSentry is evaluated on held-out unseen generator attacks (A07-A19 in ASVspoof). The SPRT sequential test and temperature calibration keep error rates controlled, while the intermediate "Suspicious" tier prevents false commitments.
- **Q: What about false positives on a noisy real phone call?**
  - *A*: VoiceSentry trains on phone codecs (G.711 mu/A-law, Opus, low-bitrate MP3) and noise augmentation. SPRT hysteresis prevents noise bursts from causing premature latching.
- **Q: Why use SPRT rather than simple averaging of chunk probabilities?**
  - *A*: SPRT provides mathematically grounded stopping times with user-defined false-positive ($\alpha$) and false-negative ($\beta$) error budgets. It reports the exact time-to-verdict and estimated time-to-decision.
- **Q: Is the heatmap genuine or just decorative?**
  - *A*: The heatmap is calculated directly via Grad-CAM from the final convolutional layer of the classification network with respect to the spoof class score.
- **Q: How does privacy work?**
  - *A*: Audio is streamed in-memory only through ring buffers and discarded after each hop. No raw audio is persisted unless the user explicitly clicks "Save session".
