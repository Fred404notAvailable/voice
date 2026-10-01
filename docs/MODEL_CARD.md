# VoiceSentry Model Card

## Model Details
- **Architecture**: `SpoofCNN` (Custom 4-block Conv2D on 64-mel spectrograms, AdaptiveAvgPool2d, Dropout 0.3, Linear 2-class head).
- **Parameters**: ~250k parameters (<1M budget).
- **Explainability**: Grad-CAM on `features[-1]` last Conv2d layer before pooling.
- **Sequential Decision**: Leaky SPRT accumulator with hysteresis ($\alpha=0.02, \beta=0.02, \text{decay}=0.85$).
- **Calibration**: Temperature scaling with parameter $T$ fit on validation set logits.

## 8 kHz Ceiling Note
At 16 kHz sampling, the Nyquist limit is 8 kHz. All spectral analysis (roll-off, HF ratio 4-8 kHz) operates within the 0-8 kHz band. No claims are made regarding cutoffs above 8 kHz.

## Limitations
- Performance may degrade on unseen synthesis architectures and generators.
- Whisper/singing or non-speech sounds may produce low confidence.
