"""ESP32 + Ra-02 (SX1278) LoRa UART bridge using a 12-byte big-endian frame.

Frame Layout (12 bytes total, big-endian '>BHHHHBH'):
- Byte 0     : uint8   Node ID (0x01)
- Bytes 1-2  : uint16  Water Level (mm)
- Bytes 3-4  : uint16  Surface Velocity (mm/s)
- Bytes 5-6  : uint16  Discharge (L/s, i.e., m3/s * 1000, clamped to 65535)
- Bytes 7-8  : uint16  Debris Hazard Index * 100 (0..10000)
- Byte 9     : uint8   Debris Count (0..255)
- Bytes 10-11: uint16  CRC16-CCITT (poly 0x1021, init 0xFFFF) over bytes 0..9
"""

from __future__ import annotations

import struct
from typing import Optional

try:
    import serial  # type: ignore
except ImportError:  # pragma: no cover
    serial = None


FRAME_STRUCT = struct.Struct(">BHHHHBH")
PAYLOAD_STRUCT = struct.Struct(">BHHHHB")


def crc16_ccitt(data: bytes, init: int = 0xFFFF) -> int:
    """Compute CRC16-CCITT (0x1021) over a byte sequence."""
    crc = init
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def pack_telemetry_frame(
    node_id: int,
    water_level_m: float,
    v_surface_ms: float,
    discharge_m3s: float,
    hazard_index: float,
    debris_count: int,
) -> bytes:
    """Pack telemetry values into a 12-byte big-endian LoRa UART frame."""
    wl_mm = max(0, min(65535, int(round(water_level_m * 1000.0))))
    vel_mms = max(0, min(65535, int(round(v_surface_ms * 1000.0))))
    q_ls = max(0, min(65535, int(round(discharge_m3s * 1000.0))))
    hi_x100 = max(0, min(10000, int(round(hazard_index * 100.0))))
    count_u8 = max(0, min(255, int(debris_count)))

    header_and_payload = PAYLOAD_STRUCT.pack(
        node_id & 0xFF, wl_mm, vel_mms, q_ls, hi_x100, count_u8
    )
    crc = crc16_ccitt(header_and_payload)
    return header_and_payload + struct.pack(">H", crc)


class ESP32UartBridge:
    """Transmits 12-byte telemetry frames over UART to the ESP32 LoRa node."""

    def __init__(
        self,
        port: str = "/dev/ttyUSB0",
        baudrate: int = 9600,
        node_id: int = 1,
        timeout_s: float = 0.5,
    ) -> None:
        self.port = port
        self.baudrate = baudrate
        self.node_id = node_id
        self.timeout_s = timeout_s
        self._serial: Optional[object] = None

    def open(self) -> None:
        """Open UART serial port to ESP32."""
        if serial is None:
            raise RuntimeError("pyserial is required to open the ESP32 UART bridge.")
        self._serial = serial.Serial(self.port, self.baudrate, timeout=self.timeout_s)

    def close(self) -> None:
        """Close UART serial port."""
        if self._serial is not None:
            self._serial.close()
            self._serial = None

    def send_telemetry(
        self,
        water_level_m: float,
        v_surface_ms: float,
        discharge_m3s: float,
        hazard_index: float,
        debris_count: int,
    ) -> bytes:
        """Pack and transmit a 12-byte telemetry frame over UART."""
        frame = pack_telemetry_frame(
            node_id=self.node_id,
            water_level_m=water_level_m,
            v_surface_ms=v_surface_ms,
            discharge_m3s=discharge_m3s,
            hazard_index=hazard_index,
            debris_count=debris_count,
        )
        if self._serial is not None:
            self._serial.write(frame)
            self._serial.flush()
        return frame
