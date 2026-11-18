"""Benewake TF-Luna ToF LiDAR water-level sensor driver.

Reads 9-byte UART frames from the TF-Luna (115200 baud), applies a 7-sample
sliding-window median filter to reject splash/ripple outliers, and computes
water surface elevation:

    H_water = H_mount - D_laser * cos(theta)
"""

from __future__ import annotations

import math
import statistics
import struct
from collections import deque
from dataclasses import dataclass
from typing import Deque, Optional

try:
    import serial  # type: ignore
except ImportError:  # pragma: no cover - allows offline syntax/unit checks
    serial = None


FRAME_HEADER = b"\x59\x59"
FRAME_LENGTH = 9


@dataclass(frozen=True)
class LidarReading:
    """Processed TF-Luna ToF LiDAR measurement."""

    raw_distance_m: float
    filtered_distance_m: float
    water_level_m: float
    signal_strength: int
    temperature_c: float


class TFLunaReader:
    """UART reader with 7-sample sliding-window median filter for TF-Luna."""

    def __init__(
        self,
        port: str = "/dev/serial0",
        baudrate: int = 115200,
        mount_height_m: float = 2.50,
        tilt_angle_deg: float = 0.0,
        window_size: int = 7,
        timeout_s: float = 0.2,
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.mount_height_m = mount_height_m
        self.tilt_angle_rad = math.radians(tilt_angle_deg)
        self.window_size = window_size
        self.timeout_s = timeout_s
        self._window: Deque[float] = deque(maxlen=window_size)
        self._serial: Optional[object] = None

    def open(self) -> None:
        """Open UART serial connection to TF-Luna."""
        if serial is None:
            raise RuntimeError("pyserial is required to open the TF-Luna UART port.")
        self._serial = serial.Serial(self.port, self.baudrate, timeout=self.timeout_s)

    def close(self) -> None:
        """Close UART serial connection if open."""
        if self._serial is not None:
            self._serial.close()
            self._serial = None

    @staticmethod
    def parse_frame(frame: bytes) -> tuple[float, int, float]:
        """Validate and decode a 9-byte TF-Luna UART frame.

        Returns (distance_m, signal_strength, temperature_c).
        """
        if len(frame) != FRAME_LENGTH or frame[:2] != FRAME_HEADER:
            raise ValueError("Invalid TF-Luna frame header or length.")
        checksum = sum(frame[:8]) & 0xFF
        if checksum != frame[8]:
            raise ValueError(f"TF-Luna checksum mismatch: expected {frame[8]:#x}, got {checksum:#x}.")
        dist_cm, strength, temp_raw = struct.unpack("<HHH", frame[2:8])
        distance_m = dist_cm / 100.0
        temperature_c = (temp_raw / 8.0) - 256.0
        return distance_m, strength, temperature_c

    def read_sample(self) -> LidarReading:
        """Read one valid frame from UART and update the 7-sample median filter."""
        if self._serial is None:
            raise RuntimeError("TFLunaReader is not open. Call open() first.")

        while True:
            byte1 = self._serial.read(1)
            if not byte1:
                raise TimeoutError("Timed out waiting for TF-Luna frame header.")
            if byte1 == b"\x59":
                byte2 = self._serial.read(1)
                if byte2 == b"\x59":
                    payload = self._serial.read(7)
                    if len(payload) == 7:
                        raw_d, strength, temp_c = self.parse_frame(FRAME_HEADER + payload)
                        return self.process_distance(raw_d, strength, temp_c)

    def process_distance(
        self,
        raw_distance_m: float,
        signal_strength: int = 1000,
        temperature_c: float = 28.0,
    ) -> LidarReading:
        """Push a distance sample into the median filter and compute water level."""
        self._window.append(raw_distance_m)
        filtered_d = float(statistics.median(self._window))
        vertical_d = filtered_d * math.cos(self.tilt_angle_rad)
        water_level_m = max(0.0, self.mount_height_m - vertical_d)
        return LidarReading(
            raw_distance_m=raw_distance_m,
            filtered_distance_m=filtered_d,
            water_level_m=water_level_m,
            signal_strength=signal_strength,
            temperature_c=temperature_c,
        )
