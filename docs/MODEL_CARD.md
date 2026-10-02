# VoiceSentry Model Card

## Model Architecture & Pipeline
- **Primary Neural Model**: `SpoofCNN` — Squeeze-and-Excitation Residual Network (SE-ResNet) with 1.98M parameters on 64-channel log-mel spectrograms ($0\text{--}8\text{ kHz}$).
- **Explainability**: Integrated Grad-CAM spatial-frequency explainer on the final residual convolutional activation layer with bilinear interpolation.
- **Multimodal Risk Fusion**: Blends neural log-mel features ($60\%$) with a physiological acoustic biomarker anomaly prior ($40\%$) including circular phase coherence dispersion and pitch perturbation.
- **Sequential Decision Engine**: Leaky Sequential Probability Ratio Test (SPRT) accumulator with dual-threshold hysteresis ($\alpha = 0.02, \beta = 0.02, \text{decay} = 0.85$).
- **Probability Calibration**: Temperature scaling ($T^* = 1.0625$, $NLL = 0.5778$) fitted on class-balanced validation logits.
- **Wideband Cutoff Detector**: Analyzes native audio sampling rates $> 16\text{ kHz}$ to identify artificial brickwall cutoffs at $12\text{ kHz}$ or $16\text{ kHz}$ characteristic of $24\text{ kHz} / 32\text{ kHz}$ neural vocoders upsampled to $48\text{ kHz}$.

## Intended Use
- **Real-Time Streaming Voice Forensics**: Low-latency detection of cloned, synthetic, and replay voices over WebRTC and microphone streams ($33\text{--}60\text{ ms}$ typical CPU latency per $0.5\text{ s}$ hop).
- **Asynchronous File Forensics**: Forensic analysis of uploaded `.wav`, `.mp3`, and `.flac` recordings with timeline replay.

## Training Data & Generator Generalization
- **Training Corpus**: ASVspoof 2019 Logical Access (LA) clean and codec-augmented partitions ($25,380$ training utterances, $24,844$ dev utterances).
- **Augmentation**: Multi-codec telephony hardening (G.711 $\mu$-law/A-law, Opus $16\text{ kbps} / 8\text{ kbps}$, MP3 $32\text{ kbps}$, $+20\text{ dB}$ Gaussian noise, SpecAugment time/frequency masking).
- **Held-Out Evaluation**: Evaluated against unseen generators ($A07\text{--}A19$) and modern zero-shot neural synthesis (e.g., ElevenLabs, XTTS, BigVGAN).

## Domain Shift Case Study: Modern Zero-Shot AI Voices
- **Phenomenon**: Legacy spoof detectors trained strictly on ASVspoof 2019 look for acoustic artifacts from older vocoders (such as WORLD, STRAIGHT, and WaveNet buzz). Modern continuous diffusion and neural codec models generate smooth spectrograms in the $0\text{--}8\text{ kHz}$ range that can produce lower logit differences on legacy-trained CNNs.
- **Forensic Countermeasures**:
  1. **Phase Coherence Degradation**: Modern neural vocoders do not emulate the continuous physiological coupling of physical human vocal folds, causing phase coherence to drop significantly below the human baseline ($0.55$ vs human $0.60\text{--}0.64$).
  2. **Wideband Nyquist Ceiling**: 32 kHz neural vocoders upsampled to 48 kHz exhibit a sharp energy collapse at exactly 16.0 kHz ($300\times$ drop into digital silence).
  3. **Multimodal Fusion**: The acoustic biomarker prior prevents the system from falsely committing to "Authentic" on modern zero-shot generators.

## Limitations & Boundary Conditions
- **8 kHz Ceiling in 16 kHz Streaming**: When streaming at 16 kHz, frequencies above 8 kHz cannot be observed. Wideband cutoff checks operate exclusively on native high-samplerate uploads.
- **Acoustic Noise Floor**: Extreme background noise ($< 10\text{ dB}$ SNR) or severe acoustic reverberation may reduce biomarker confidence.
- **Whispering and Singing**: Whispered speech lacks modal vocal fold oscillation and may trigger elevated biomarker flags.
