"""Lightweight YOLOv8-nano floating debris detector and Hazard Index calculator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

try:
    from ultralytics import YOLO  # type: ignore
except ImportError:  # pragma: no cover
    YOLO = None


@dataclass(frozen=True)
class DebrisDetection:
    """Single detected floating debris object."""

    label: str
    confidence: float
    area_ratio: float


@dataclass(frozen=True)
class DebrisMetrics:
    """Aggregated floating debris count and Hazard Index (HI)."""

    count: int
    coverage_ratio: float
    hazard_index: float
    alert_level: str
    detections: List[DebrisDetection]


class DebrisDetector:
    """Runs YOLOv8-nano inference on 320x320 frames and computes Hazard Index."""

    def __init__(
        self,
        model_path: str = "yolov8n_debris.onnx",
        conf_threshold: float = 0.35,
        imgsz: int = 320,
    ) -> None:
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.imgsz = imgsz
        self._model: Optional[object] = None

    def load(self) -> None:
        """Load the YOLOv8-nano model into memory."""
        if YOLO is None:
            raise RuntimeError("ultralytics is required to load the YOLOv8-nano model.")
        self._model = YOLO(self.model_path, task="detect")

    @staticmethod
    def compute_hazard_index(
        count: int,
        coverage_ratio: float,
        v_surface_ms: float,
    ) -> tuple[float, str]:
        """Compute normalized Debris Hazard Index HI in [0.0, 100.0].

        Combines debris count, surface coverage fraction, and flow velocity.
        """
        hi = min(
            100.0,
            (count * 8.5) + (coverage_ratio * 250.0) + (max(0.0, v_surface_ms) * 6.0),
        )
        if hi >= 70.0:
            level = "CRITICAL"
        elif hi >= 40.0:
            level = "WARNING"
        else:
            level = "NORMAL"
        return round(hi, 2), level

    def detect(self, frame_bgr: np.ndarray, v_surface_ms: float = 0.0) -> DebrisMetrics:
        """Run debris inference on a frame and compute the Hazard Index."""
        if self._model is None:
            raise RuntimeError("DebrisDetector model not loaded. Call load() first.")

        h, w = frame_bgr.shape[:2]
        frame_area = float(max(1, h * w))
        results = self._model.predict(
            source=frame_bgr,
            imgsz=self.imgsz,
            conf=self.conf_threshold,
            verbose=False,
        )

        detections: List[DebrisDetection] = []
        total_box_area = 0.0

        for res in results:
            boxes = getattr(res, "boxes", None)
            if boxes is None:
                continue
            names = getattr(res, "names", {})
            for box in boxes:
                xyxy = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                box_area = max(0.0, (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1]))
                total_box_area += box_area
                detections.append(
                    DebrisDetection(
                        label=str(names.get(cls_id, f"class_{cls_id}")),
                        confidence=round(conf, 3),
                        area_ratio=round(box_area / frame_area, 5),
                    )
                )

        coverage = min(1.0, total_box_area / frame_area)
        hi, alert_level = self.compute_hazard_index(len(detections), coverage, v_surface_ms)
        return DebrisMetrics(
            count=len(detections),
            coverage_ratio=round(coverage, 5),
            hazard_index=hi,
            alert_level=alert_level,
            detections=detections,
        )
