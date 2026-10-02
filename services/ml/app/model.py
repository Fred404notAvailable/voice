"""
model.py — SpoofCNN with Squeeze-Excitation attention.

Architecture: 4 ResBlock stages with SE attention, wider channels,
global average pooling + dropout + linear head.

Grad-CAM target: last conv layer of the last block (features[-1].conv2).
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple, Union


class SEBlock(nn.Module):
    """Squeeze-and-Excitation channel attention."""

    def __init__(self, channels: int, reduction: int = 8):
        super().__init__()
        mid = max(channels // reduction, 4)
        self.fc = nn.Sequential(
            nn.Linear(channels, mid, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(mid, channels, bias=False),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, H, W)
        w = x.mean(dim=[2, 3])          # (B, C)
        w = self.fc(w).unsqueeze(-1).unsqueeze(-1)  # (B, C, 1, 1)
        return x * w


class ResBlock(nn.Module):
    """Residual block with two 3×3 convs + SE + optional projection + strided pooling."""

    def __init__(self, cin: int, cout: int, stride: int = 2):
        super().__init__()
        self.stride = stride
        self.conv1 = nn.Conv2d(cin, cout, 3, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(cout)
        self.conv2 = nn.Conv2d(cout, cout, 3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(cout)
        self.se    = SEBlock(cout)

        # Downsampling happens here for BOTH branches
        self.downsample: Optional[nn.Module] = None
        if stride > 1 or cin != cout:
            layers = []
            if stride > 1:
                layers.append(nn.AvgPool2d(stride))
            if cin != cout:
                layers.append(nn.Conv2d(cin, cout, 1, bias=False))
                layers.append(nn.BatchNorm2d(cout))
            self.downsample = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Residual / shortcut branch
        identity = self.downsample(x) if self.downsample is not None else x

        # Main branch
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        if self.stride > 1:
            out = F.avg_pool2d(out, self.stride)
        out = F.relu(self.bn2(self.conv2(out)), inplace=False)
        out = self.se(out)

        return F.relu(out + identity, inplace=True)


class SpoofCNN(nn.Module):
    """
    Anti-spoofing CNN with SE-residual blocks.

    Input  : (B, 1, 64, 101) — log-mel spectrogram
    Output : (B, 2)          — logits [bonafide, spoof]
    """

    def __init__(self, n_attack_classes: int = 0):
        super().__init__()

        # Stem: quick 7×1 channel expansion
        self.stem = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=(7, 1), padding=(3, 0), bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
        )

        # 4 residual stages — each halves spatial dims
        self.stage1 = ResBlock(32,  64,  stride=2)
        self.stage2 = ResBlock(64,  128, stride=2)
        self.stage3 = ResBlock(128, 192, stride=2)
        self.stage4 = ResBlock(192, 256, stride=2)

        # Convenience handle for Grad-CAM target (last conv before pool)
        self._gradcam_target = self.stage4.conv2

        self.pool = nn.AdaptiveAvgPool2d(1)
        self.drop = nn.Dropout(0.35)
        self.head = nn.Linear(256, 2)

        self.attack_head = (
            nn.Linear(256, n_attack_classes) if n_attack_classes > 0 else None
        )

        # Keep legacy attribute for older Grad-CAM code that indexes features[-1][3]
        self.features = nn.Sequential(
            self.stem,
            self.stage1,
            self.stage2,
            self.stage3,
            self.stage4,
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(
        self, x: torch.Tensor
    ) -> Union[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        x = self.stem(x)
        x = self.stage1(x)
        x = self.stage2(x)
        x = self.stage3(x)
        x = self.stage4(x)   # (B, 256, H', W')  <-- Grad-CAM hooks here
        z = self.drop(self.pool(x).flatten(1))
        out = self.head(z)
        if self.attack_head is not None:
            return out, self.attack_head(z)
        return out


def get_gradcam_target_layer(model: SpoofCNN) -> nn.Module:
    """Returns the last Conv2d layer of stage4 — optimal for Grad-CAM."""
    return model.stage4.conv2
