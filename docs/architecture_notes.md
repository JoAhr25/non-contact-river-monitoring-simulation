# Non-Contact River Monitoring System — Architecture Notes

## 1. System Overview
This project implements a low-cost, non-contact hydrological and floating-debris monitoring station designed for flood-prone tropical rivers (validated in a laboratory stepped-weir flume and a field reach of the Guimbal River, Iloilo). It combines:

- **Edge Compute:** Raspberry Pi 3 Model B (1 GB RAM, BCM2837) running a 5-second staggered Python pipeline with explicit `gc.collect()` memory reclamation between heavy CV/AI stages.
- **Optical & Night-Vision Sensing:** Raspberry Pi Camera Module 3 NoIR (Sony IMX708) paired with a 12 V 850 nm 4-LED IR illuminator for day/night Large-Scale Particle Image Velocimetry (LSPIV) and floating debris detection.
- **Water-Level Sensing:** Benewake TF-Luna Time-of-Flight (ToF) LiDAR over UART (115200 baud) with a 7-sample sliding-window median filter:
  $$H_{\text{water}} = H_{\text{mount}} - D_{\text{laser}} \cos\theta$$
- **Discharge Estimation:** Adapted `pyOpenRiverCam` LSPIV using 4-point Ground Control Point (GCP) homography rectification ($\mathbf{H}_{\text{gcp}}$), Farneback optical flow, and a surface-to-mean velocity coefficient ($\alpha = 0.85$):
  $$Q = A(H_{\text{water}}) \cdot (\alpha \cdot V_{\text{surface}})$$
- **Debris Hazard Index ($HI$):** Lightweight YOLOv8-nano (`320x320` ONNX) detector estimating floating debris count and surface coverage ratio.
- **Telemetry & Storage:** Local WAL-mode SQLite logging (`edge_node/logger.py`) and a 12-byte big-endian UART frame with CRC16-CCITT (`edge_node/esp32_uart_bridge.py`) transmitted via an ESP32 + Ai-Thinker Ra-02 (SX1278, 433 MHz) LoRa transceiver.

## 2. Staggered 5-Second Edge Pipeline
1. **Stage 1 — LiDAR Acquisition (`edge_node/laser_sensor.py`):** Read TF-Luna frame, push to 7-sample median filter, compute $H_{\text{water}}$.
2. **Stage 2 — LSPIV Velocity (`edge_node/lspiv_engine.py`):** Capture consecutive grayscale frames, apply $\mathbf{H}_{\text{gcp}}$ perspective warp, run Farneback optical flow, compute $V_{\text{surface}}$, $V_{\text{mean}}$, and $Q$. Release flow buffers and call `gc.collect()`.
3. **Stage 3 — Debris Detection (`edge_node/debris_detector.py`):** Run YOLOv8-nano (`320x320`) on the BGR frame, compute $HI$ and alert tier (`NORMAL`, `WARNING`, `CRITICAL`). Release frame buffers and call `gc.collect()`.
4. **Stage 4 — Persistence & LoRa Uplink (`edge_node/logger.py`, `edge_node/esp32_uart_bridge.py`):** Write row to SQLite and transmit 12-byte big-endian frame over UART to ESP32 + Ra-02.

## 3. 3D Digital Twin Web Simulator
The root web application (`index.html`, `style.css`, `app.js`) provides an interactive Three.js r170 digital twin supporting both **Phase 1 (Controlled Lab Stepped-Weir Flume)** and **Phase 2 (Guimbal River Field Reach)**, camera presets, 850 nm Night IR mode, live hydrological/debris telemetry, and hardware pinout/BOM inspection.
