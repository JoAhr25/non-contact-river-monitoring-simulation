"""Main 5-second staggered execution loop for the Raspberry Pi 3 Model B edge node.

Executes LiDAR acquisition, LSPIV optical flow, YOLOv8-nano debris detection,
SQLite logging, and 12-byte LoRa UART transmission sequentially with explicit
`gc.collect()` calls between heavy CV/AI stages to stay safely within 1 GB RAM.
"""

from __future__ import annotations

import argparse
import gc
import logging
import time
from typing import Optional, Tuple

import numpy as np

from .debris_detector import DebrisDetector
from .esp32_uart_bridge import ESP32UartBridge
from .laser_sensor import TFLunaReader
from .logger import TelemetryLogger
from .lspiv_engine import LSPIVEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("edge_node.main")

CYCLE_PERIOD_S = 5.0


def capture_frame_pair(
    camera: Optional[object] = None,
    size: Tuple[int, int] = (320, 240),
    simulate: bool = False,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Acquire two consecutive grayscale frames for LSPIV and one BGR frame for YOLO."""
    w, h = size
    if simulate or camera is None:
        rng = np.random.default_rng()
        prev_gray = rng.integers(60, 180, size=(h, w), dtype=np.uint8)
        curr_gray = np.roll(prev_gray, shift=3, axis=1)
        bgr = np.stack([curr_gray, curr_gray, curr_gray], axis=-1)
        return prev_gray, curr_gray, bgr

    import cv2  # type: ignore

    ok1, frame1 = camera.read()
    ok2, frame2 = camera.read()
    if not (ok1 and ok2):
        raise RuntimeError("Failed to capture consecutive frames from Pi Camera.")
    prev_gray = cv2.cvtColor(cv2.resize(frame1, size), cv2.COLOR_BGR2GRAY)
    curr_gray = cv2.cvtColor(cv2.resize(frame2, size), cv2.COLOR_BGR2GRAY)
    bgr = cv2.resize(frame2, (320, 320))
    return prev_gray, curr_gray, bgr


def run_edge_loop(simulate: bool = False, max_cycles: Optional[int] = None) -> None:
    """Run the 5-second staggered non-contact river monitoring pipeline."""
    lidar = TFLunaReader(mount_height_m=2.50, tilt_angle_deg=0.0)
    lspiv = LSPIVEngine(
        src_gcp_px=[(40, 40), (280, 40), (300, 220), (20, 220)],
        dst_gcp_m=[(0.0, 0.0), (6.0, 0.0), (6.0, 4.5), (0.0, 4.5)],
    )
    debris = DebrisDetector(model_path="yolov8n_debris.onnx")
    db_logger = TelemetryLogger(db_path="river_telemetry.db")
    uart_bridge = ESP32UartBridge(node_id=1)

    db_logger.connect()
    if not simulate:
        lidar.open()
        debris.load()
        uart_bridge.open()

    cycle = 0
    try:
        while max_cycles is None or cycle < max_cycles:
            t_start = time.monotonic()
            cycle += 1

            # Stage 1: TF-Luna ToF LiDAR water level (7-sample median filter)
            if simulate:
                lidar_res = lidar.process_distance(1.42)
            else:
                lidar_res = lidar.read_sample()

            # Stage 2: Frame acquisition + LSPIV Farneback optical flow
            prev_gray, curr_gray, bgr_frame = capture_frame_pair(simulate=simulate)
            if simulate:
                # Provide synthetic LSPIV result when OpenCV/camera are absent
                v_surf = 1.18
                v_mean = 0.85 * v_surf
                area = lspiv.default_trapezoidal_area(lidar_res.water_level_m)
                q_m3s = area * v_mean
            else:
                lspiv_res = lspiv.estimate(prev_gray, curr_gray, lidar_res.water_level_m)
                v_surf = lspiv_res.v_surface_ms
                v_mean = lspiv_res.v_mean_ms
                q_m3s = lspiv_res.discharge_m3s

            del prev_gray, curr_gray
            gc.collect()  # Free optical flow buffers before YOLOv8-nano inference

            # Stage 3: YOLOv8-nano debris detection & Hazard Index
            if simulate:
                debris_count = 2
                hi, alert_lvl = debris.compute_hazard_index(debris_count, 0.03, v_surf)
            else:
                debris_res = debris.detect(bgr_frame, v_surface_ms=v_surf)
                debris_count = debris_res.count
                hi = debris_res.hazard_index
                alert_lvl = debris_res.alert_level

            del bgr_frame
            gc.collect()  # Reclaim inference tensors on 1 GB Raspberry Pi 3B

            # Stage 4: Local SQLite log + 12-byte LoRa UART transmission
            frame = uart_bridge.send_telemetry(
                water_level_m=lidar_res.water_level_m,
                v_surface_ms=v_surf,
                discharge_m3s=q_m3s,
                hazard_index=hi,
                debris_count=debris_count,
            )
            db_logger.log_cycle(
                water_level_m=lidar_res.water_level_m,
                v_surface_ms=v_surf,
                v_mean_ms=v_mean,
                discharge_m3s=q_m3s,
                debris_count=debris_count,
                hazard_index=hi,
                alert_level=alert_lvl,
                lora_tx_ok=True,
            )

            log.info(
                "Cycle %d | H=%.3fm V_surf=%.2fm/s Q=%.3fm3/s Debris=%d HI=%.1f (%s) Frame=%s",
                cycle,
                lidar_res.water_level_m,
                v_surf,
                q_m3s,
                debris_count,
                hi,
                alert_lvl,
                frame.hex(),
            )

            elapsed = time.monotonic() - t_start
            sleep_s = max(0.0, CYCLE_PERIOD_S - elapsed)
            if sleep_s > 0 and (max_cycles is None or cycle < max_cycles):
                time.sleep(sleep_s)
    finally:
        db_logger.close()
        lidar.close()
        uart_bridge.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="River Monitoring Edge Node Firmware")
    parser.add_argument("--simulate", action="store_true", help="Run in hardware-free simulation mode")
    parser.add_argument("--cycles", type=int, default=None, help="Stop after N cycles")
    args = parser.parse_args()
    run_edge_loop(simulate=args.simulate, max_cycles=args.cycles)


if __name__ == "__main__":
    main()
