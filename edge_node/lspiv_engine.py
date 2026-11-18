"""Adapted pyOpenRiverCam LSPIV surface velocity and discharge estimator.

Pipeline:
1. Rectify oblique camera frames into metric planimetric space using a 4-point
   Ground Control Point (GCP) homography matrix H_gcp.
2. Estimate dense surface displacement via Farneback optical flow.
3. Convert pixel displacement to surface velocity V_surf (m/s), apply the
   depth-averaged velocity coefficient alpha = 0.85 (V_mean = alpha * V_surf),
   and compute river discharge Q = A(H) * V_mean.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence, Tuple

import numpy as np

try:
    import cv2  # type: ignore
except ImportError:  # pragma: no cover
    cv2 = None


@dataclass(frozen=True)
class LSPIVResult:
    """Output of a single LSPIV velocity & discharge estimation cycle."""

    v_surface_ms: float
    v_mean_ms: float
    cross_section_area_m2: float
    discharge_m3s: float
    valid_vectors: int


class LSPIVEngine:
    """Lightweight LSPIV engine tuned for Raspberry Pi 3 Model B (1 GB RAM)."""

    def __init__(
        self,
        src_gcp_px: Sequence[Tuple[float, float]],
        dst_gcp_m: Sequence[Tuple[float, float]],
        rectified_size: Tuple[int, int] = (320, 240),
        pixels_per_meter: float = 40.0,
        alpha: float = 0.85,
        fps: float = 15.0,
        area_fn: Optional[Callable[[float], float]] = None,
    ) -> None:
        if len(src_gcp_px) != 4 or len(dst_gcp_m) != 4:
            raise ValueError("Exactly 4 GCP point pairs are required for homography.")
        self.rectified_size = rectified_size
        self.pixels_per_meter = pixels_per_meter
        self.alpha = alpha
        self.fps = fps
        self.area_fn = area_fn or self.default_trapezoidal_area

        src_pts = np.asarray(src_gcp_px, dtype=np.float32)
        dst_px = np.asarray(dst_gcp_m, dtype=np.float32) * pixels_per_meter
        if cv2 is not None:
            self.homography, _ = cv2.findHomography(src_pts, dst_px)
        else:
            self.homography = np.eye(3, dtype=np.float32)

    @staticmethod
    def default_trapezoidal_area(
        water_level_m: float,
        bottom_width_m: float = 8.0,
        side_slope: float = 1.5,
    ) -> float:
        """Compute trapezoidal channel cross-sectional area A(H) in m^2."""
        h = max(0.0, water_level_m)
        return (bottom_width_m + side_slope * h) * h

    def rectify_frame(self, frame_gray: np.ndarray) -> np.ndarray:
        """Warp raw grayscale frame into metric top-down view using H_gcp."""
        if cv2 is None:
            raise RuntimeError("OpenCV (cv2) is required for frame rectification.")
        return cv2.warpPerspective(frame_gray, self.homography, self.rectified_size)

    def estimate(
        self,
        prev_gray: np.ndarray,
        curr_gray: np.ndarray,
        water_level_m: float,
        rectify: bool = True,
    ) -> LSPIVResult:
        """Compute surface velocity, mean velocity, and discharge from two frames."""
        if cv2 is None:
            raise RuntimeError("OpenCV (cv2) is required for Farneback optical flow.")

        if rectify:
            prev_rect = self.rectify_frame(prev_gray)
            curr_rect = self.rectify_frame(curr_gray)
        else:
            prev_rect, curr_rect = prev_gray, curr_gray

        flow = cv2.calcOpticalFlowFarneback(
            prev_rect,
            curr_rect,
            None,
            pyr_scale=0.5,
            levels=2,
            winsize=15,
            iterations=2,
            poly_n=5,
            poly_sigma=1.1,
            flags=0,
        )

        # Streamwise velocity component (assume flow along +x in rectified space)
        mag_px = np.hypot(flow[..., 0], flow[..., 1])
        valid_mask = (mag_px > 0.15) & (mag_px < 40.0)
        valid_count = int(np.count_nonzero(valid_mask))

        if valid_count > 0:
            median_disp_px = float(np.median(mag_px[valid_mask]))
            v_surface = (median_disp_px / self.pixels_per_meter) * self.fps
        else:
            v_surface = 0.0

        v_mean = self.alpha * v_surface
        area = self.area_fn(water_level_m)
        discharge = area * v_mean

        return LSPIVResult(
            v_surface_ms=round(v_surface, 4),
            v_mean_ms=round(v_mean, 4),
            cross_section_area_m2=round(area, 4),
            discharge_m3s=round(discharge, 4),
            valid_vectors=valid_count,
        )
