import torch
import torch.nn as nn
from typing import Optional, Tuple, Union

def block(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )

class SpoofCNN(nn.Module):
    def __init__(self, n_attack_classes: int = 0):
        super().__init__()
        self.features = nn.Sequential(
            block(1, 16),
            block(16, 32),
            block(32, 64),
            block(64, 96),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.drop = nn.Dropout(0.3)
        self.head = nn.Linear(96, 2)  # logits: [bonafide, spoof]
        self.attack_head = nn.Linear(96, n_attack_classes) if n_attack_classes > 0 else None

    def forward(self, x: torch.Tensor) -> Union[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        f = self.features(x)  # (B, 96, H', W') used for Grad-CAM
        z = self.drop(self.pool(f).flatten(1))
        out = self.head(z)
        if self.attack_head is not None:
            return out, self.attack_head(z)
        return out

def get_gradcam_target_layer(model: SpoofCNN) -> nn.Module:
    """Returns the last Conv2d layer before pooling."""
    return model.features[-1][3]
