# Non-Contact River Monitoring System — 3D Digital Twin & Edge Node

An open-source, low-cost (~$223.50 USD) non-contact hydrological and floating-debris monitoring system combining a **Three.js 3D Digital Twin** web simulator with **Raspberry Pi 3 Model B + ESP32 LoRa** edge-node firmware.

## Features

- **3D Digital Twin Web Simulator (`index.html`, `style.css`, `app.js`):**
  - **Phase 1 — Controlled Lab Tank:** Stepped-weir acrylic flume with adjustable gantry, submersible pump, wave makers, and live water-level / discharge / debris controls.
  - **Phase 2 — Guimbal River (Field Reach):** Field river cross-section with flat grassy terrain, bank/bridge mounting presets, and 4-point Ground Control Point (GCP) aerial view.
  - **850 nm Night IR Mode & Live Telemetry HUD:** Simulates Pi Camera Module 3 NoIR + 4-LED 850 nm IR illumination, LSPIV optical flow vectors, YOLOv8-nano bounding boxes, and Thesis Tables 1–9 / Pinout / BOM panels.
- **Raspberry Pi 3B Edge Node (`edge_node/`):**
  - Staggered 5-second execution loop with explicit `gc.collect()` memory reclamation between heavy CV/AI stages to run reliably within 1 GB RAM.
  - **TF-Luna ToF LiDAR** with a 7-sample sliding-window median filter.
  - **Adapted `pyOpenRiverCam` LSPIV** using 4-point GCP homography rectification and Farneback optical flow.
  - **YOLOv8-nano** floating debris detector and Debris Hazard Index ($HI$) calculator.
  - **WAL-mode SQLite** local telemetry archival and **12-byte big-endian LoRa UART** framing with CRC16-CCITT.

## Raspberry Pi Staggered Pipeline

```text
┌─────────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────────┐
│ 1. TF-Luna ToF LiDAR    │ ──▶ │ 2. LSPIV Optical Flow        │ ──▶ │ 3. YOLOv8-nano Debris    │
│ 7-sample median filter  │     │ 4-pt GCP Homography + α=0.85 │     │ 320x320 ONNX + HI Score  │
└─────────────────────────┘     └──────────────┬───────────────┘     └────────────┬─────────────┘
                                               │ gc.collect()                     │ gc.collect()
                                               ▼                                  ▼
                                ┌───────────────────────────────────────────────────────────────┐
                                │ 4. SQLite WAL Log + 12-byte LoRa UART Frame (ESP32 + Ra-02)   │
                                └───────────────────────────────────────────────────────────────┘
```

## Governing Equations

- **Water Level (ToF LiDAR):**
  $$H_{\text{water}} = H_{\text{mount}} - D_{\text{laser}} \cos\theta$$
- **Surface-to-Mean Velocity & Discharge (LSPIV):**
  $$V_{\text{mean}} = \alpha \cdot V_{\text{surface}} \quad (\alpha = 0.85)$$
  $$Q = A(H_{\text{water}}) \cdot V_{\text{mean}}$$
- **Debris Hazard Index ($HI$):**
  $$HI = \min\Big(100,\; 8.5 \cdot N_{\text{debris}} + 250 \cdot R_{\text{coverage}} + 6.0 \cdot V_{\text{surface}}\Big)$$

## 12-Byte Big-Endian LoRa Telemetry Frame

Sent over UART (`9600` baud) from Raspberry Pi to ESP32 + Ra-02 (SX1278, 433 MHz) using struct format `>BHHHHBH`:

| Byte Offset | Size | Type | Field | Scaling / Notes |
|---|---|---|---|---|
| `0` | 1 B | `uint8` | `node_id` | Station identifier (e.g., `0x01`) |
| `1..2` | 2 B | `uint16` | `water_level_mm` | $H_{\text{water}} \times 1000$ |
| `3..4` | 2 B | `uint16` | `v_surface_mms` | $V_{\text{surface}} \times 1000$ |
| `5..6` | 2 B | `uint16` | `discharge_ls` | $Q \times 1000$ ($\text{L/s}$, clamped to `65535`) |
| `7..8` | 2 B | `uint16` | `hazard_index_x100` | $HI \times 100$ (`0..10000`) |
| `9` | 1 B | `uint8` | `debris_count` | Detected floating debris count (`0..255`) |
| `10..11` | 2 B | `uint16` | `crc16_ccitt` | CRC16-CCITT (`0x1021`, init `0xFFFF`) over bytes `0..9` |

## Bill of Materials Summary

The complete 18-item prototype BOM totals **~$223.50 USD** (see [`docs/final_thesis_bom.csv`](docs/final_thesis_bom.csv) and [`docs/budget_friendly_materials_recommendation.csv`](docs/budget_friendly_materials_recommendation.csv)):

- **Compute & Vision:** Raspberry Pi 3 Model B (1 GB), Pi Camera Module 3 NoIR, 850 nm 4-LED IR Illuminator
- **Ranging & Telemetry:** Benewake TF-Luna ToF LiDAR, ESP32 DevKit V1, Ai-Thinker Ra-02 (SX1278) 433 MHz LoRa
- **Power & Storage:** 3S2P 12 V LiFePO4/Li-ion w/ BMS, LM2596 5.1 V Buck, 12 V Buck-Boost, 5 A Fuse, DS3231 RTC, 32 GB microSD, External 2.5" SATA SSD
- **Testbed & Mechanics:** Custom Stepped-Weir Flume & Pump, 2x Wave Makers, PVC/Al Gantry, 2x IP65 Enclosures, JST GH Harnesses

## Repository Structure

```text
.
├── .github/workflows/pages.yml                 # Auto-deploy simulator to GitHub Pages
├── docs/
│   ├── architecture_notes.md                   # System & pipeline architecture notes
│   ├── budget_friendly_materials_recommendation.csv
│   └── final_thesis_bom.csv                    # 18-item BOM (~$223.50 USD)
├── edge_node/
│   ├── __init__.py
│   ├── debris_detector.py                      # YOLOv8-nano + Hazard Index (HI)
│   ├── esp32_uart_bridge.py                    # 12-byte big-endian LoRa UART packer
│   ├── laser_sensor.py                         # TF-Luna ToF LiDAR + 7-sample median filter
│   ├── logger.py                               # WAL-mode SQLite telemetry logger
│   ├── lspiv_engine.py                         # GCP homography + Farneback optical flow
│   ├── main.py                                 # 5-second staggered loop + gc.collect()
│   └── requirements.txt                        # Pinned Python dependencies
├── app.js                                      # Three.js r170 3D Digital Twin logic
├── index.html                                  # Simulator entry page (GitHub Pages root)
├── style.css                                   # Dark-glass studio UI styles
├── CITATION.cff                                # Academic citation metadata
├── LICENSE                                     # MIT License
└── README.md
```

## Quickstart

### 1. Run the 3D Web Simulator Locally
Because `app.js` uses ES modules (`<script type="module">`), serve the root directory over HTTP:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### 2. Run the Edge Node Firmware (Hardware-Free Simulation Mode)

```bash
python -m pip install -r edge_node/requirements.txt
python -m edge_node.main --simulate --cycles 5
```

## License

Released under the [MIT License](LICENSE).
