"""
Grad-CAM implementation for SpoofCNN.

Returns a heatmap over the full 1-second log-mel window (64 x ~101).
The heatmap is normalized to [0, 1] and packed as PackedMatrix for the browser.
"""
import time
import numpy as np
import torch
import torch.nn.functional as F
from typing import Optional
from .model import SpoofCNN, get_gradcam_target_layer
from .features import pack_matrix_u8_b64
from .schemas import PackedMatrix


def compute_gradcam(
    model: SpoofCNN,
    mel_tensor: torch.Tensor,  # (1, 1, 64, 101) — already on CPU
    target_class: int = 1,      # 1 = spoof
) -> tuple[Optional[PackedMatrix], float]:
    """
    Computes Grad-CAM over the last conv block.

    Returns:
        heatmap (PackedMatrix | None): packed heatmap at mel resolution (64 x 101).
        elapsed_ms (float): wall-clock time for the Grad-CAM pass.
    """
    t0 = time.perf_counter()

    # --- Register hooks ---
    target_layer = get_gradcam_target_layer(model)
    activations: list[torch.Tensor] = []
    gradients: list[torch.Tensor] = []

    def fwd_hook(module, inp, out):
        activations.append(out.detach())

    def bwd_hook(module, grad_in, grad_out):
        gradients.append(grad_out[0].detach())

    fwd_handle = target_layer.register_forward_hook(fwd_hook)
    bwd_handle = target_layer.register_full_backward_hook(bwd_hook)

    try:
        # Enable grad context (model normally runs in inference_mode elsewhere)
        model.eval()
        x = mel_tensor.requires_grad_(True)
        logits = model(x)
        if isinstance(logits, tuple):
            logits = logits[0]

        model.zero_grad()
        score = logits[0, target_class]
        score.backward()

        if not activations or not gradients:
            return None, (time.perf_counter() - t0) * 1000.0

        act = activations[0]   # (1, C, H', W')
        grad = gradients[0]    # (1, C, H', W')

        # Global Average Pool the gradients
        weights = grad.mean(dim=(2, 3), keepdim=True)  # (1, C, 1, 1)
        cam = (weights * act).sum(dim=1, keepdim=True)  # (1, 1, H', W')
        cam = F.relu(cam)

        # Upsample to mel dimensions (64, 101)
        cam_up = F.interpolate(cam, size=(64, 101), mode="bilinear", align_corners=False)
        cam_np = cam_up.squeeze().numpy()  # (64, 101)

        # Normalize to [0, 1]
        cam_min, cam_max = cam_np.min(), cam_np.max()
        if cam_max - cam_min > 1e-6:
            cam_np = (cam_np - cam_min) / (cam_max - cam_min)
        else:
            cam_np = np.zeros_like(cam_np)

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return pack_matrix_u8_b64(cam_np.astype(np.float32)), elapsed_ms

    except Exception:
        return None, (time.perf_counter() - t0) * 1000.0
    finally:
        fwd_handle.remove()
        bwd_handle.remove()
        # Clear gradient state
        try:
            model.zero_grad()
        except Exception:
            pass
