import { getDefaultThresholds } from '../sim/pipelineModel.js';
import { TIMELINE_STAGES, TOTAL_TIMELINE_DURATION_S } from './timelineController.js';
import {
  THESIS_BOM,
  THESIS_BOM_TOTAL_PHP,
  EDGE_LORA_BOM,
  BUDGET_ALTERNATIVES,
} from '../shared/bomData.js';

/**
 * Interactive Thesis Dashboard, Simulation Controls & Email Alert Studio
 * Exports createDashboardPanel(containerEl, state, actions) returning:
 * { update(snapshot, sensitivityData, trialLogs, timelineInfo), showEmailAlert(alertObj) }
 */
const DASH_STYLE_ID = 'river-sim-dashboard-styles';

function ensureDashboardStyles() {
  if (document.getElementById(DASH_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DASH_STYLE_ID;
  style.textContent = `
    .dash-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.01em;
      color: #f8fafc;
    }
    .dash-sep {
      width: 1px;
      height: 18px;
      background: rgba(148, 163, 184, 0.24);
      margin: 0 2px;
    }
    .dash-preset-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .dash-preset-btn {
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 7px;
    }
    .dash-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px;
      background: rgba(8, 13, 24, 0.72);
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      flex-wrap: wrap;
    }
    .dash-tab-btn {
      flex: 1 1 auto;
      text-align: center;
      padding: 5px 7px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 7px;
      color: #94a3b8;
      background: transparent;
      border: 1px solid transparent;
    }
    .dash-tab-btn.active {
      color: #e0f2fe;
      background: rgba(14, 116, 144, 0.42);
      border-color: rgba(56, 189, 248, 0.65);
    }
    .dash-pane {
      display: none;
      flex-direction: column;
      gap: 10px;
    }
    .dash-pane.active {
      display: flex;
    }
    .dash-section {
      background: rgba(15, 23, 42, 0.62);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 10px;
      padding: 9px 10px;
    }
    .dash-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #7dd3fc;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .dash-ctrl-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 8px;
    }
    .dash-ctrl-row:last-child {
      margin-bottom: 0;
    }
    .dash-ctrl-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      color: #cbd5e1;
    }
    .dash-ctrl-val {
      font-family: var(--font-mono, monospace);
      color: #38bdf8;
      font-size: 11px;
    }
    .dash-toggle-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .dash-seg-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 3px;
      background: rgba(6, 10, 19, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 8px;
      margin-top: 2px;
    }
    .dash-seg-group-3 {
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
    }
    .dash-seg-btn {
      padding: 5px 6px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      border-color: transparent;
      background: transparent;
      color: #94a3b8;
      text-align: center;
      line-height: 1.25;
    }
    .dash-seg-group-3 .dash-seg-btn {
      padding: 5px 4px;
      font-size: 10px;
      line-height: 1.2;
    }
    .dash-seg-btn:hover {
      background: rgba(30, 41, 59, 0.65);
      color: #e2e8f0;
    }
    .dash-seg-btn.active {
      background: rgba(14, 116, 144, 0.52);
      border-color: rgba(56, 189, 248, 0.75);
      color: #e0f2fe;
    }
    .dash-subbox {
      background: rgba(6, 10, 20, 0.55);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 8px;
      padding: 7px 8px;
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .dash-kpi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }
    .dash-kpi-card {
      background: rgba(9, 14, 25, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 9px;
      padding: 7px 9px;
    }
    .dash-kpi-name {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
    }
    .dash-kpi-val {
      font-size: 16px;
      font-weight: 700;
      margin: 2px 0;
      color: #f8fafc;
    }
    .dash-kpi-sub {
      font-size: 10.5px;
      color: #94a3b8;
    }
    .dash-table-wrap {
      overflow-x: auto;
      max-height: 220px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 7px;
      background: rgba(6, 10, 19, 0.65);
    }
    .dash-stage-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .dash-stage-pill {
      padding: 3px 7px;
      font-size: 10.5px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .dash-stage-pill.active {
      background: rgba(16, 185, 129, 0.28);
      border-color: #10b981;
      color: #d1fae5;
    }
    .dash-timeline-scrub {
      flex: 1 1 180px;
      min-width: 140px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dash-timeline-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #cbd5e1;
      gap: 8px;
    }
    .dash-email-card {
      background: rgba(9, 14, 26, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-left: 3px solid #f59e0b;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .dash-email-card.critical {
      border-left-color: #ef4444;
    }
    .dash-toast {
      pointer-events: auto;
      width: min(350px, calc(100vw - 24px));
      background: rgba(10, 15, 28, 0.94);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(245, 158, 11, 0.55);
      border-left: 4px solid #f59e0b;
      border-radius: 10px;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.62);
      padding: 10px 12px;
      color: #f8fafc;
      animation: dashToastIn 0.24s ease-out;
    }
    .dash-toast.critical {
      border-color: rgba(239, 68, 68, 0.65);
      border-left-color: #ef4444;
    }
    @keyframes dashToastIn {
      from {
        opacity: 0;
        transform: translateX(18px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
  `;
  document.head.appendChild(style);
}

const CAMERA_PRESETS = [
  { id: 'video_replica', label: 'Video Replica', phase: 'lab' },
  { id: 'side_profile', label: 'Side Profile', phase: 'lab' },
  { id: 'overhead_gantry', label: 'Overhead Gantry', phase: 'lab' },
  { id: 'hydraulic_cutaway', label: 'Hydraulic Cutaway', phase: 'lab' },
  { id: 'river_cross_section', label: 'River Cross-Section', phase: 'river' },
  { id: 'gcp_aerial', label: 'GCP Aerial', phase: 'river' },
  { id: 'exploded_cad', label: 'Exploded IP65 CAD', phase: 'both' },
  { id: 'noir_pov', label: 'NoIR Camera POV', phase: 'both' },
];

const TABLE3_PINOUT = [
  { id: 'BT1', comp: 'BT1: 3S2P Li-ion w/ 3S BMS (4S LFP Alt.)', pin: '+ / -', target: 'F1 Pin 1 / Common GND' },
  { id: 'F1', comp: 'F1: 5A Inline Fuse', pin: 'Pin 1 / Pin 2', target: 'BT1 + / PS1 IN+ & PS2 VIN+' },
  { id: 'PS1', comp: 'PS1: LM2596 Buck (5.1V)', pin: 'IN+ / OUT+', target: 'F1 Pin 2 / Pi 5V & TF-Luna VCC' },
  { id: 'PS2', comp: 'PS2: DC-DC Buck-Boost (12V)', pin: 'VIN+ / OUT+', target: 'F1 Pin 2 / 850nm IR Illuminator VCC' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'GPIO 2, 3 (I2C1)', target: 'U4 DS3231 SDA, SCL (3V3)' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'GPIO 14, 15 (UART0)', target: 'U2 TF-Luna RX, TX (5V / 3V3 TTL)' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'CSI / USB / SDIO', target: 'U3 Cam 3 NoIR / SATA SSD / 32GB microSD' },
  { id: 'U2', comp: 'U2: Benewake TF-Luna LiDAR', pin: 'VCC, GND, TX, RX', target: 'PS1 5V, GND, GPIO15, GPIO14' },
  { id: 'U4', comp: 'U4: DS3231 RTC Module (0x68)', pin: 'VCC, GND, SDA, SCL', target: 'Pi 3V3 (Pin 1), GND, GPIO2, GPIO3' },
  { id: 'IR1', comp: 'IR Illuminator (850 nm)', pin: 'VCC / GND', target: 'PS2 OUT+ (12V) / Common GND' },
  { id: 'AP1', comp: 'AP1: Wi-Fi AP (or ESP32+Ra-02 9600 UART)', pin: '2.4 GHz / 433 MHz', target: 'Cloud FastAPI Server / LoRa Gateway' },
];

function createDashboardPanel(containerEl, state, actions = {}) {
  ensureDashboardStyles();

  const root = document.createElement('div');
  root.className = 'dash-root-wrap';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

  // Ensure thresholds exist on state
  if (!state.thresholds) {
    state.thresholds = getDefaultThresholds(state.mode === 'river' ? 'river' : 'lab');
  }

  root.innerHTML = `
    <!-- TOP BAR: Drawer Toggle, Phase Mode Switcher & Filtered Camera Presets -->
    <header class="top-bar">
      <div class="top-bar-group">
        <button type="button" class="btn active" data-act="toggle-drawer" title="Show/Hide Left Controls & Thesis Drawer (D)">☰ Studio</button>
        <div class="dash-sep"></div>
        <button type="button" class="btn active" data-mode="lab">Phase 1: Lab</button>
        <button type="button" class="btn" data-mode="river">Phase 2: River</button>
      </div>
      <div class="top-bar-group">
        <div class="dash-preset-strip" data-el="preset-strip">
          ${CAMERA_PRESETS.map(
            (p) => `<button type="button" class="btn dash-preset-btn" data-preset="${p.id}" data-preset-phase="${p.phase}">${p.label}</button>`
          ).join('')}
        </div>
        <div class="dash-sep"></div>
        <button type="button" class="btn" data-act="quick-explode" title="Explode / Assemble IP65 Enclosures (E)">Explode</button>
        <button type="button" class="btn" data-act="quick-ir" title="Toggle 850nm Night IR (N)">850nm IR</button>
        <button type="button" class="btn active" data-act="quick-hud" title="Toggle Video Telemetry HUD (H)">HUD</button>
        <button type="button" class="btn" data-act="toggle-present" title="Projector / Defense Presentation Mode (P)">Present</button>
        <button type="button" class="btn" data-act="screenshot" title="Capture High-Res PNG Screenshot">📸</button>
      </div>
    </header>

    <!-- TOP-CENTER STAGE SUBTITLE NARRATION BANNER (Defense Presenter Aid) -->
    <div class="stage-narration-banner" data-el="stage-banner" role="region" aria-label="Stage Narration">
      <div class="stage-banner-head">
        <span class="stage-banner-title" data-el="banner-title">Stage 0: Ready</span>
        <div style="display:flex;align-items:center;gap:4px;">
          <button type="button" class="btn" style="padding:2px 6px;font-size:10px;" data-act="prev-stage" title="Previous Stage (←)">◀</button>
          <button type="button" class="btn" style="padding:2px 6px;font-size:10px;" data-act="next-stage" title="Next Stage (→)">▶</button>
          <button type="button" class="btn" style="padding:2px 7px;font-size:10px;" data-act="toggle-hold" title="Auto-pause at end of each stage for panel Q&amp;A">Hold: OFF</button>
          <button type="button" class="btn" style="padding:2px 6px;font-size:10px;" data-act="close-banner" title="Dismiss Narration Banner">×</button>
        </div>
      </div>
      <div class="stage-banner-sub" data-el="banner-sub">Select Play Story or any stage below to narrate governance equations and hardware flow.</div>
      <div class="stage-banner-eq" data-el="banner-eq">WL = H_mount - D · cos(θ) • Q = k · Vs · A(WL)</div>
    </div>

    <!-- LEFT COLLAPSIBLE THESIS & CONTROLS DRAWER -->
    <aside class="drawer-shell" data-el="drawer" aria-label="Simulation Controls and Thesis Dashboard">
      <nav class="dash-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" aria-controls="pane-controls" class="dash-tab-btn active" data-tab="controls">Controls</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="pane-telemetry" class="dash-tab-btn" data-tab="telemetry">Telemetry</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="pane-tables" class="dash-tab-btn" data-tab="tables">Tables 1–9</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="pane-hardware" class="dash-tab-btn" data-tab="hardware">Pinout &amp; BOM</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="pane-alerts" class="dash-tab-btn" data-tab="alerts">Alerts (<span data-el="alert-tab-count">0</span>)</button>
      </nav>

      <div class="drawer-scroll">
        <!-- TAB 1: SIMULATION CONTROLS -->
        <div class="dash-pane active" data-pane="controls">
          <!-- Architecture Profile Alignment Selector -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>System Architecture Profile</span>
              <span class="badge badge-ok mono" data-kpi="arch-badge">PROPOSAL</span>
            </div>
            <div class="dash-seg-group" role="group" aria-label="Architecture Profile">
              <button type="button" class="btn dash-seg-btn active" data-arch="proposal">Thesis Proposal (Wi-Fi + Cloud)</button>
              <button type="button" class="btn dash-seg-btn" data-arch="edge_lora">Edge / LoRa (ESP32 + Ra-02)</button>
            </div>
          </div>

          <!-- Phase 1 Controls -->
          <div class="dash-section" data-el="phase1-controls">
            <div class="dash-section-title">
              <span>Phase 1: Stepped-Weir Flume</span>
              <span class="badge badge-ok">LAB</span>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Submersible Water Pump</span>
                <button type="button" class="btn btn-emerald" data-ctrl="pumpActive">Pump: ON</button>
              </div>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Red Ball Valve Opening</span>
                <span class="dash-ctrl-val" data-val="valveOpening">75%</span>
              </div>
              <input type="range" min="0" max="100" step="1" value="75" data-input="valveOpening" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Wave Makers Power (2×)</span>
                <span class="dash-ctrl-val" data-val="waveMakerPower">25%</span>
              </div>
              <input type="range" min="0" max="100" step="1" value="25" data-input="waveMakerPower" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Debris / Foam Tracers</span>
                <span class="dash-ctrl-val" data-val="debrisCountTarget">6 items</span>
              </div>
              <input type="range" min="0" max="15" step="1" value="6" data-input="debrisCountTarget" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Sensor Mounting Height H</span>
                <span class="dash-ctrl-val" data-val="lidarHeightM">0.693 m</span>
              </div>
              <input type="range" min="0.50" max="1.25" step="0.005" value="0.693" data-input="lidarHeightM" />
            </div>
          </div>

          <!-- Phase 2 Real River Controls -->
          <div class="dash-section" data-el="phase2-controls" style="display:none;">
            <div class="dash-section-title">
              <span>Phase 2: Guimbal River, Iloilo</span>
              <span class="badge badge-warn">FIELD</span>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Mounting Placement</span>
                <span class="dash-ctrl-val" data-val="riverMountMode">Bridge (4.50 m)</span>
              </div>
              <div class="dash-seg-group dash-seg-group-3" role="group" aria-label="Mounting Placement">
                <button type="button" class="btn dash-seg-btn active" data-mount="bridge">Overhead Bridge Mount</button>
                <button type="button" class="btn dash-seg-btn" data-mount="side_pole">Riverbank Side-Pole</button>
                <button type="button" class="btn dash-seg-btn" data-mount="lab_pole">Lab-Style Side Pole</button>
              </div>
            </div>
            <div class="dash-ctrl-row" data-el="bridge-height-row">
              <div class="dash-ctrl-label">
                <span>Bridge Mount Height H</span>
                <span class="dash-ctrl-val" data-val="riverLidarHeightM">4.50 m</span>
              </div>
              <input type="range" min="3.20" max="6.50" step="0.05" value="4.50" data-input="riverLidarHeightM" />
            </div>
            <div class="dash-subbox" data-el="side-pole-controls" style="display:none;">
              <div class="dash-ctrl-row">
                <div class="dash-ctrl-label">
                  <span>Side-Pole Mount Height H<sub>mount</sub></span>
                  <span class="dash-ctrl-val" data-val="sidePoleHeightM">6.00 m</span>
                </div>
                <input type="range" min="4.50" max="7.50" step="0.05" value="6.00" data-input="sidePoleHeightM" />
              </div>
              <div class="dash-ctrl-row">
                <div class="dash-ctrl-label">
                  <span>TF-Luna LiDAR Beam Angle θ</span>
                  <span class="dash-ctrl-val" data-val="riverLidarTiltDeg">32° (Slant)</span>
                </div>
                <div class="dash-seg-group" style="margin-bottom:4px;">
                  <button type="button" class="btn dash-seg-btn" data-lidar-aim="nadir">Straight Down (0°)</button>
                  <button type="button" class="btn dash-seg-btn active" data-lidar-aim="slant">Angled Channel (32°)</button>
                </div>
                <input type="range" min="0" max="45" step="1" value="32" data-input="riverLidarTiltDeg" />
              </div>
              <div class="dash-toggle-grid">
                <button type="button" class="btn active" data-ctrl="riverLidarSlantComp" title="H_water = H_mount - (D_laser * cos(θ))">cos(θ) Comp: ON</button>
                <button type="button" class="btn" data-act="reframe-mount" title="Focus viewport on Side-Pole & Channel">Frame Side-Pole</button>
              </div>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Flow Stage / Storm Preset</span>
                <select data-input="riverStagePreset">
                  <option value="baseflow">Baseflow (0.55 m)</option>
                  <option value="normal" selected>Normal Flow (1.15 m)</option>
                  <option value="monsoon">Habagat Monsoon (1.95 m)</option>
                  <option value="flood">Flood Peak (2.65 m)</option>
                  <option value="hydrograph">Storm Hydrograph Pulse</option>
                </select>
              </div>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Water Stage WL</span>
                <span class="dash-ctrl-val" data-val="riverStageM">1.15 m</span>
              </div>
              <input type="range" min="0.30" max="3.00" step="0.05" value="1.15" data-input="riverStageM" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Manning's Roughness n</span>
                <span class="dash-ctrl-val" data-val="manningN">0.035</span>
              </div>
              <input type="range" min="0.022" max="0.065" step="0.001" value="0.035" data-input="manningN" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Channel Slope S₀</span>
                <span class="dash-ctrl-val" data-val="channelSlope">0.0022</span>
              </div>
              <input type="range" min="0.0005" max="0.0080" step="0.0001" value="0.0022" data-input="channelSlope" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Velocity Coefficient k</span>
                <span class="dash-ctrl-val" data-val="velocityCoeffK">0.85</span>
              </div>
              <input type="range" min="0.70" max="0.95" step="0.01" value="0.85" data-input="velocityCoeffK" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Lighting / Sun Glare</span>
                <select data-input="timeOfDayPreset">
                  <option value="day">Daylight (Clear)</option>
                  <option value="glare">High Noon Solar Glare</option>
                  <option value="dusk">Dusk Low-Light</option>
                  <option value="night_no_ir">Nighttime (IR OFF)</option>
                  <option value="night">Nighttime (850nm IR ON)</option>
                </select>
              </div>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Rainfall Intensity</span>
                <span class="dash-ctrl-val" data-val="rainIntensity">0%</span>
              </div>
              <input type="range" min="0" max="100" step="5" value="0" data-input="rainIntensity" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>River Debris Injection</span>
                <span class="dash-ctrl-val" data-val="riverDebrisTarget">12 items</span>
              </div>
              <input type="range" min="0" max="25" step="1" value="12" data-input="riverDebrisTarget" />
            </div>
            <div class="dash-toggle-grid" style="margin-top:6px;">
              <button type="button" class="btn active" data-ctrl="showBathymetrySlice">Bathymetry Slice</button>
              <button type="button" class="btn active" data-ctrl="showGcpGrid">GCP Grid</button>
              <button type="button" class="btn" data-ctrl="independentFieldRef" style="grid-column:1 / -1;" title="Objective 5A / Table 7: Enable when independent field discharge measurement is present">Field Discharge Ref: ABSENT (Obj 5A)</button>
            </div>
          </div>

          <!-- Shared Prototype & Environment Controls -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Prototype &amp; Optics Twin</span>
              <span class="mono" style="color:#94a3b8;font-size:10px;">IP65 / NoIR</span>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Exploded IP65 CAD View</span>
                <span class="dash-ctrl-val" data-val="explodeFactor">0%</span>
              </div>
              <input type="range" min="0" max="100" step="1" value="0" data-input="explodeFactor" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Water Surface Color (Obj 3E/5D)</span>
                <select data-input="turbidityMode">
                  <option value="clear">Clear (&lt; 50 NTU)</option>
                  <option value="turbid_white">Turbid White (Kaolin)</option>
                  <option value="silty">Silty (200–500 NTU)</option>
                  <option value="muddy">Muddy Brown (&gt;= 700 NTU)</option>
                  <option value="algal_green">Algal Green Water</option>
                  <option value="dark">Dark / Black Water</option>
                </select>
              </div>
            </div>
            <div class="dash-toggle-grid">
              <button type="button" class="btn" data-ctrl="nightMode">850nm Night IR: OFF</button>
              <button type="button" class="btn btn-emerald" data-ctrl="wifiOnline">Wi-Fi: ONLINE</button>
              <button type="button" class="btn active" data-ctrl="showOptics" title="False-color visualization of invisible 850 nm NIR LiDAR beam + NoIR FOV">850nm NIR Visual: ON</button>
              <button type="button" class="btn active" data-ctrl="pipelineActive">Logging: ON</button>
            </div>
          </div>

          <!-- Threshold Sliders -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Email Alert Thresholds</span>
              <button type="button" class="btn" style="padding:2px 7px;font-size:10px;" data-act="test-alert">Test Alert</button>
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Water Level WL Threshold</span>
                <span class="dash-ctrl-val" data-val="th-wl">0.345 m</span>
              </div>
              <input type="range" min="0.1" max="3.0" step="0.005" value="0.345" data-input="th-wl" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Velocity Vs Threshold</span>
                <span class="dash-ctrl-val" data-val="th-vs">0.28 m/s</span>
              </div>
              <input type="range" min="0.1" max="4.5" step="0.02" value="0.28" data-input="th-vs" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Discharge Q Threshold</span>
                <span class="dash-ctrl-val" data-val="th-q">0.00145 m³/s</span>
              </div>
              <input type="range" min="0.0005" max="60" step="0.0001" value="0.00145" data-input="th-q" />
            </div>
            <div class="dash-ctrl-row">
              <div class="dash-ctrl-label">
                <span>Debris Count Ns Threshold</span>
                <span class="dash-ctrl-val" data-val="th-n">8 items</span>
              </div>
              <input type="range" min="1" max="25" step="1" value="8" data-input="th-n" />
            </div>
          </div>
        </div>

        <!-- TAB 2: LIVE TELEMETRY & SENSITIVITY CHARTS -->
        <div class="dash-pane" data-pane="telemetry">
          <div class="dash-kpi-grid">
            <div class="dash-kpi-card">
              <div class="dash-kpi-name">Water Level (H − D)</div>
              <div class="dash-kpi-val mono" data-kpi="wl">0.335 m</div>
              <div class="dash-kpi-sub mono" data-kpi="wl-err">AE: 0.0 cm | Table X</div>
            </div>
            <div class="dash-kpi-card">
              <div class="dash-kpi-name">Surface Velocity (Vs)</div>
              <div class="dash-kpi-val mono" data-kpi="vs">0.24 m/s</div>
              <div class="dash-kpi-sub mono" data-kpi="vs-err">rRMSE: 0.0% (&lt;=20%)</div>
            </div>
            <div class="dash-kpi-card">
              <div class="dash-kpi-name">Discharge (Q = k·Vs·A)</div>
              <div class="dash-kpi-val mono" data-kpi="q">0.0012 m³/s</div>
              <div class="dash-kpi-sub mono" data-kpi="q-sub">A: 0.016 m² | k: 0.85</div>
            </div>
            <div class="dash-kpi-card">
              <div class="dash-kpi-name">YOLOv8 Debris &amp; Hazard HI</div>
              <div class="dash-kpi-val mono" data-kpi="ns">0 / 0</div>
              <div class="dash-kpi-sub mono" data-kpi="f1">F1:100% | HI: 0.5 (NORMAL)</div>
            </div>
          </div>

          <!-- Active Mounting Location & Sensor Incidence Telemetry -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Mounting &amp; Sensor Incidence</span>
              <span class="badge badge-ok mono" data-kpi="mount-badge">LAB GANTRY</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;" class="mono">
              <div>Location: <span data-kpi="mount-loc" style="color:#e2e8f0;">Lab PVC Gantry</span></div>
              <div>H<sub>mount</sub>: <span data-kpi="mount-h" style="color:#7dd3fc;">0.693 m</span></div>
              <div>LiDAR θ: <span data-kpi="lidar-ang" style="color:#6ee7b7;">0.0°</span></div>
              <div>Cam θ<sub>cam</sub>: <span data-kpi="cam-ang" style="color:#f472b6;">0.0°</span></div>
              <div>D<sub>laser</sub>: <span data-kpi="d-laser" style="color:#cbd5e1;">0.358 m</span></div>
              <div>GCP / Comp: <span data-kpi="gcp-comp" style="color:#fcd34d;">Fixed</span></div>
            </div>
          </div>

          <!-- Edge Buffering & DS3231 RTC Card -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>DS3231 RTC &amp; Edge Buffering (TSR%)</span>
              <span class="badge badge-ok mono" data-kpi="sync-badge">SYNCED</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;" class="mono">
              <div>RTC: <span data-kpi="rtc-time" style="color:#e2e8f0;">--</span></div>
              <div>TSR L/V: <span data-kpi="tsr" style="color:#6ee7b7;">100% / 100%</span></div>
              <div>Local Queue: <span data-kpi="queue">0</span> rec</div>
              <div>Latency: <span data-kpi="latency">185 ms</span></div>
              <div>Mode/RAM: <span data-kpi="proc-mode">Real-Time</span></div>
              <div>Alert Deliv: <span data-kpi="alert-meta">100% / 0ms</span></div>
              <div>microSD Logs: <span data-kpi="sd-logs">0</span></div>
              <div>SATA SSD: <span data-kpi="ssd-mb">42.6 MB</span></div>
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(148,163,184,0.14);font-size:10.5px;line-height:1.4;" class="mono">
              <div>12B LoRa (&gt;BHHHHBH): <span data-kpi="lora-hex" style="color:#7dd3fc;word-break:break-all;">--</span></div>
              <div style="color:#94a3b8;" data-kpi="lora-meta">Node 1 | WL -- mm | Vs -- mm/s | CRC16 --</div>
            </div>
          </div>

          <!-- Objective 5A / Table 7 Sensitivity Curve -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Discharge Sensitivity (Obj 5A / Table 7)</span>
              <span class="mono" style="font-size:10px;color:#94a3b8;">k ∈ [0.70, 0.95], WL ± 0.05m</span>
            </div>
            <canvas width="340" height="150" style="width:100%;height:auto;background:#050a14;border-radius:7px;border:1px solid rgba(148,163,184,0.16);" data-el="sens-canvas"></canvas>
            <div class="mono" style="font-size:10.5px;color:#cbd5e1;margin-top:5px;" data-kpi="sens-summary">
              ΔQ(k): -- | ΔQ(±5cm): -- | Band: --%
            </div>
          </div>

          <!-- Synchronized Live Time-Series Plot (WL, Vs, Q vs Thresholds) -->
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Live Telemetry Time Series</span>
              <span class="mono" style="font-size:9.5px;color:#94a3b8;">WL(cyan) • Vs(green) • Q(amber)</span>
            </div>
            <canvas width="340" height="118" style="width:100%;height:auto;background:#050a14;border-radius:7px;border:1px solid rgba(148,163,184,0.16);" data-el="ts-canvas"></canvas>
          </div>

          <!-- Table X Acceptance Criteria Live Status -->
          <div class="dash-section">
            <div class="dash-section-title"><span>Table X Acceptance Criteria</span></div>
            <div data-el="tablex-list" style="display:flex;flex-direction:column;gap:4px;font-size:11px;"></div>
          </div>
        </div>

        <!-- TAB 3: THESIS TABLES 1-9 & EXPORT -->
        <div class="dash-pane" data-pane="tables">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" data-act="capture-trial">+ Log Trial</button>
            <button type="button" class="btn" data-act="export-csv">Export CSV</button>
            <button type="button" class="btn" data-act="export-json">Export JSON</button>
            <button type="button" class="btn" data-act="export-md">Export MD</button>
            <button type="button" class="btn btn-danger" data-act="reset-logs">Reset</button>
          </div>
          <div class="dash-seg-group" style="flex-wrap:wrap;" role="group" aria-label="Thesis Table Sub-Views">
            <button type="button" class="btn dash-seg-btn active" data-tview="all">All 1–9</button>
            <button type="button" class="btn dash-seg-btn" data-tview="t12">T1–T2 Lab</button>
            <button type="button" class="btn dash-seg-btn" data-tview="t34">T3–T4 Day/IR</button>
            <button type="button" class="btn dash-seg-btn" data-tview="t5">T5 Func</button>
            <button type="button" class="btn dash-seg-btn" data-tview="t67">T6–T7 Field</button>
            <button type="button" class="btn dash-seg-btn" data-tview="t89">T8–T9 Field</button>
          </div>
          <div style="font-size:10.5px;color:#94a3b8;">
            Daytime vs 850 nm IR-assisted metrics &amp; separate LiDAR/Video TSR% reported per Paper pp. 47–60.
          </div>

          <div class="dash-section" data-tsec="t12">
            <div class="dash-section-title">
              <span>Table 1: Controlled WL &amp; Velocity</span>
              <span class="mono" data-kpi="t1-stats" style="font-size:10px;color:#94a3b8;">MaxAE: --</span>
            </div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Time</th><th>D(m)</th><th>WL(m)</th><th>Ref(m)</th><th>AE(cm)</th><th>Vs</th><th>Vr</th></tr></thead>
                <tbody data-tbody="t1"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section" data-tsec="t12">
            <div class="dash-section-title"><span>Table 2: Controlled Discharge (m³/s)</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>A(m²)</th><th>k</th><th>Qs</th><th>Qr</th><th>Err%</th></tr></thead>
                <tbody data-tbody="t2"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section" data-tsec="t34">
            <div class="dash-section-title">
              <span>Table 3 &amp; 4: Controlled Debris (Day/IR) &amp; TSR%</span>
              <span class="mono" data-kpi="t34-split" style="font-size:9.5px;color:#94a3b8;">Day: -- | IR: --</span>
            </div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Light</th><th>Ns/Nr</th><th>TP/FP/FN</th><th>F1%</th><th>L-TSR</th><th>V-TSR</th></tr></thead>
                <tbody data-tbody="t34"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section" data-tsec="t5">
            <div class="dash-section-title"><span>Table 5: System Functionality Checklist</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>Function</th><th>Pass Criterion</th><th>Tested</th><th>Passed</th><th>Status</th></tr></thead>
                <tbody data-tbody="t5"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section" data-tsec="t67">
            <div class="dash-section-title"><span>Tables 6–7: Field WL, Conditions &amp; Discharge</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Stage/Rain</th><th>WL(m)</th><th>Vs</th><th>Q(m³/s)</th><th>Ref?</th></tr></thead>
                <tbody data-tbody="field"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section" data-tsec="t89">
            <div class="dash-section-title">
              <span>Tables 8–9: Field Debris (Day/IR) &amp; TSR%</span>
              <span class="mono" data-kpi="t89-split" style="font-size:9.5px;color:#94a3b8;">Day: -- | IR: --</span>
            </div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Light</th><th>Ns/Nr</th><th>F1%</th><th>HI</th><th>L-TSR</th><th>V-TSR</th></tr></thead>
                <tbody data-tbody="field89"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB 4: HARDWARE PINOUT (TABLE 3) & BOM -->
        <div class="dash-pane" data-pane="hardware">
          <div class="dash-section">
            <div class="dash-section-title"><span>Table 3: Prototype Pin Connection Table</span></div>
            <div class="dash-table-wrap" style="max-height:220px;">
              <table class="data-table">
                <thead><tr><th>Component</th><th>Pin / Port</th><th>Connected To</th></tr></thead>
                <tbody>
                  ${TABLE3_PINOUT.map(
                    (r) => `<tr data-comp="${r.id}" style="cursor:pointer;" title="Click to inspect ${r.id}"><td>${r.comp}</td><td class="mono">${r.pin}</td><td>${r.target}</td></tr>`
                  ).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="dash-section">
            <div class="dash-section-title">
              <span>Bill of Materials Comparison</span>
              <span class="badge badge-ok mono" data-kpi="bom-total">Total: ₱${THESIS_BOM_TOTAL_PHP.toLocaleString()}</span>
            </div>
            <div class="dash-seg-group dash-seg-group-3" style="margin-bottom:6px;" role="group" aria-label="BOM View">
              <button type="button" class="btn dash-seg-btn active" data-bom="proposal">Proposal ₱20,278</button>
              <button type="button" class="btn dash-seg-btn" data-bom="edge_lora">Edge CSV $223.50</button>
              <button type="button" class="btn dash-seg-btn" data-bom="budget">Budget -$65</button>
            </div>
            <div class="dash-table-wrap" style="max-height:250px;">
              <table class="data-table" data-el="bom-table">
                <thead><tr data-el="bom-thead"><th>Material</th><th>Qty</th><th>Cost</th><th>Specification</th></tr></thead>
                <tbody data-el="bom-tbody">
                  ${THESIS_BOM.map(
                    (b) => `<tr><td>${b.item}</td><td class="mono">${b.qty}</td><td class="mono">${b.cost}</td><td>${b.spec}</td></tr>`
                  ).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB 5: EMAIL ALERT LOG INBOX -->
        <div class="dash-pane" data-pane="alerts">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11.5px;color:#cbd5e1;">Threshold Email Notification Inbox</span>
            <button type="button" class="btn" data-act="test-alert-2">Send Test Alert</button>
          </div>
          <div data-el="alert-list" style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;color:#94a3b8;padding:12px;text-align:center;">
              No threshold breaches logged yet. Raise flow/debris or run Stage 5 to trigger alerts.
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- BOTTOM 7-STAGE START-TO-END STORYLINE TRANSPORT BAR -->
    <footer class="bottom-timeline-bar">
      <button type="button" class="btn btn-emerald" data-act="play-pause" style="min-width:104px;">▶ Play Story</button>
      <div class="dash-stage-pills" data-el="stage-pills">
        ${TIMELINE_STAGES.map(
          (s) =>
            `<button type="button" class="btn dash-stage-pill" data-stage="${s.index}" title="${s.title}">${s.shortLabel}</button>`
        ).join('')}
      </div>
      <div class="dash-timeline-scrub">
        <div class="dash-timeline-meta">
          <span data-el="stage-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Ready — Start-to-End 7-Stage Pipeline</span>
          <span class="mono" data-el="stage-time">0.0s / 75.0s</span>
        </div>
        <input type="range" min="0" max="1000" step="1" value="0" data-input="timeline-scrub" aria-label="Timeline Progress Scrubber" />
      </div>
      <button type="button" class="btn" style="padding:4px 8px;font-size:10.5px;" data-act="open-banner" title="Show Stage Subtitle Banner">Caption</button>
    </footer>
  `;

  if (containerEl) {
    containerEl.appendChild(root);
  }

  const q = (sel) => root.querySelector(sel);
  const qa = (sel) => Array.from(root.querySelectorAll(sel));

  const drawerEl = q('[data-el="drawer"]');
  const toggleDrawerBtn = q('[data-act="toggle-drawer"]');
  const phase1Box = q('[data-el="phase1-controls"]');
  const phase2Box = q('[data-el="phase2-controls"]');
  const sidePoleBox = q('[data-el="side-pole-controls"]');
  const bridgeHeightRow = q('[data-el="bridge-height-row"]');
  const sensCanvas = q('[data-el="sens-canvas"]');
  const sensCtx = sensCanvas.getContext('2d');
  const tsCanvas = q('[data-el="ts-canvas"]');
  const tsCtx = tsCanvas ? tsCanvas.getContext('2d') : null;
  const alertListEl = q('[data-el="alert-list"]');
  const alertTabCount = q('[data-el="alert-tab-count"]');
  const stageBannerEl = q('[data-el="stage-banner"]');
  const bannerTitleEl = q('[data-el="banner-title"]');
  const bannerSubEl = q('[data-el="banner-sub"]');
  const bannerEqEl = q('[data-el="banner-eq"]');

  const playPauseBtn = q('[data-act="play-pause"]');
  const scrubInput = q('[data-input="timeline-scrub"]');
  const stageTitleEl = q('[data-el="stage-title"]');
  const stageTimeEl = q('[data-el="stage-time"]');

  const quickIrBtn = q('[data-act="quick-ir"]');
  const quickHudBtn = q('[data-act="quick-hud"]');
  const quickExplodeBtn = q('[data-act="quick-explode"]');
  const togglePresentBtn = q('[data-act="toggle-present"]');
  const holdBtn = q('[data-act="toggle-hold"]');

  // Cache DOM refs once on mount to prevent ~45 querySelector calls per 75 ms tick
  const domVal = new Map(qa('[data-val]').map((el) => [el.dataset.val, el]));
  const domInput = new Map(qa('[data-input]').map((el) => [el.dataset.input, el]));
  const domCtrl = new Map(qa('[data-ctrl]').map((el) => [el.dataset.ctrl, el]));
  const domKpi = new Map(qa('[data-kpi]').map((el) => [el.dataset.kpi, el]));
  const domTbody = new Map(qa('[data-tbody]').map((el) => [el.dataset.tbody, el]));
  const presetBtns = qa('[data-preset]');
  const modeBtns = qa('[data-mode]');
  const archBtns = qa('[data-arch]');
  const mountBtns = qa('[data-mount]');
  const lidarAimBtns = qa('[data-lidar-aim]');
  const stagePills = qa('[data-stage]');
  const tableXListEl = q('[data-el="tablex-list"]');

  // Accessible aria-labels on range inputs
  domInput.forEach((el, key) => {
    if (el.tagName === 'INPUT' && el.type === 'range' && !el.getAttribute('aria-label')) {
      el.setAttribute('aria-label', key);
    }
  });

  function sizeHiDpi(canvasEl, ctx, cssW, cssH) {
    if (!canvasEl || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tw = Math.round(cssW * dpr);
    const th = Math.round(cssH * dpr);
    if (canvasEl.width !== tw || canvasEl.height !== th) {
      canvasEl.width = tw;
      canvasEl.height = th;
      canvasEl.style.width = `${cssW}px`;
      canvasEl.style.height = `${cssH}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeHiDpi(sensCanvas, sensCtx, 340, 150);
  if (tsCanvas && tsCtx) sizeHiDpi(tsCanvas, tsCtx, 340, 118);

  const tsSeries = [];
  let lastTsSampleMs = 0;
  let drawerOpen = true;
  let prePresentDrawerOpen = true;
  let presentationMode = false;
  let bannerDismissed = false;
  let holdAtStageEnd = false;
  let activeTab = 'controls';
  let hudVisible = true;
  let lastLoggedTrialSig = '';
  let lastAlertSig = '';
  let lastTableXSig = '';
  let lastModeRendered = null;

  function emitChange(key, value) {
    actions.onStateChange?.(key, value, state);
  }

  function pauseOnManualEdit() {
    actions.pauseTimeline?.();
  }

  function setDrawerOpen(open) {
    drawerOpen = Boolean(open);
    drawerEl.classList.toggle('collapsed', !drawerOpen);
    toggleDrawerBtn.classList.toggle('active', drawerOpen);
    if (stageBannerEl) stageBannerEl.classList.toggle('wide', !drawerOpen);
  }

  function setPresentationMode(nextPresent) {
    const val = Boolean(nextPresent);
    if (val === presentationMode) return;
    presentationMode = val;
    document.body.classList.toggle('presentation-mode', presentationMode);
    if (togglePresentBtn) togglePresentBtn.classList.toggle('active', presentationMode);
    if (presentationMode) {
      prePresentDrawerOpen = drawerOpen;
      setDrawerOpen(false);
    } else {
      setDrawerOpen(prePresentDrawerOpen);
    }
  }

  function toggleIrIlluminator() {
    pauseOnManualEdit();
    const nextNight = !state.nightMode;
    state.nightMode = nextNight;
    if (nextNight) {
      state.sunGlare = 0.0;
      state.timeOfDay = 'night';
    } else if (state.timeOfDay === 'night') {
      state.timeOfDay = 'night_no_ir';
    }
    emitChange('nightMode', state.nightMode);
    syncControlWidgets();
  }

  // Top Bar Interactions
  toggleDrawerBtn.addEventListener('click', () => {
    setDrawerOpen(!drawerOpen);
  });

  if (quickExplodeBtn) {
    quickExplodeBtn.addEventListener('click', () => {
      pauseOnManualEdit();
      state.explodeFactor = (state.explodeFactor ?? 0) > 0.2 ? 0.0 : 0.85;
      emitChange('explodeFactor', state.explodeFactor);
      if (state.explodeFactor > 0.2) actions.setCameraPreset?.('exploded_cad');
      syncControlWidgets();
    });
  }

  if (togglePresentBtn) {
    togglePresentBtn.addEventListener('click', () => {
      setPresentationMode(!presentationMode);
    });
  }

  q('[data-act="screenshot"]')?.addEventListener('click', () => {
    actions.onScreenshot?.();
  });

  q('[data-act="prev-stage"]')?.addEventListener('click', () => actions.onPrevStage?.());
  q('[data-act="next-stage"]')?.addEventListener('click', () => actions.onNextStage?.());
  if (holdBtn) {
    holdBtn.addEventListener('click', () => {
      holdAtStageEnd = !holdAtStageEnd;
      holdBtn.textContent = holdAtStageEnd ? 'Hold: ON' : 'Hold: OFF';
      holdBtn.classList.toggle('active', holdAtStageEnd);
      actions.onToggleHold?.(holdAtStageEnd);
    });
  }
  q('[data-act="close-banner"]')?.addEventListener('click', () => {
    bannerDismissed = true;
    stageBannerEl?.classList.add('hidden');
  });
  q('[data-act="open-banner"]')?.addEventListener('click', () => {
    bannerDismissed = !bannerDismissed;
    stageBannerEl?.classList.toggle('hidden', bannerDismissed);
  });

  qa('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      const nextMode = btn.dataset.mode;
      actions.onModeChange?.(nextMode);
      syncControlWidgets();
    });
  });

  qa('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      const presetId = btn.dataset.preset;
      state.cameraPreset = presetId;
      actions.setCameraPreset?.(presetId);
      qa('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === presetId));
    });
  });

  quickIrBtn.addEventListener('click', toggleIrIlluminator);

  quickHudBtn.addEventListener('click', () => {
    hudVisible = !hudVisible;
    quickHudBtn.classList.toggle('active', hudVisible);
    actions.onToggleHud?.(hudVisible);
  });

  // Tab Switching (with ARIA selected states)
  const tabBtns = qa('[data-tab]');
  const paneEls = qa('[data-pane]');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      activeTab = tab;
      tabBtns.forEach((b) => {
        const isSel = b.dataset.tab === tab;
        b.classList.toggle('active', isSel);
        b.setAttribute('aria-selected', isSel ? 'true' : 'false');
      });
      paneEls.forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
    });
  });

  // Toggle Buttons inside Controls
  const bindToggleBtn = (ctrlKey, onToggle) => {
    const btn = q(`[data-ctrl="${ctrlKey}"]`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      state[ctrlKey] = !state[ctrlKey];
      onToggle?.(state[ctrlKey]);
      emitChange(ctrlKey, state[ctrlKey]);
      syncControlWidgets();
    });
  };

  bindToggleBtn('pumpActive');
  const nightBtnCtrl = q('[data-ctrl="nightMode"]');
  if (nightBtnCtrl) {
    nightBtnCtrl.addEventListener('click', toggleIrIlluminator);
  }
  bindToggleBtn('wifiOnline');
  bindToggleBtn('showOptics', (v) => {
    state.showLidarBeam = v;
    state.showCameraFov = v;
  });
  bindToggleBtn('pipelineActive');
  bindToggleBtn('showBathymetrySlice');
  bindToggleBtn('showGcpGrid');
  bindToggleBtn('riverLidarSlantComp');
  bindToggleBtn('independentFieldRef');

  // Architecture Profile Segmented Selector (Thesis Proposal vs Edge/LoRa)
  qa('[data-arch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      const arch = btn.dataset.arch === 'edge_lora' ? 'edge_lora' : 'proposal';
      state.architectureProfile = arch;
      emitChange('architectureProfile', arch);
      syncControlWidgets();
    });
  });

  // Table 1-9 Sub-view Filter
  let activeTableView = 'all';
  qa('[data-tview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTableView = btn.dataset.tview || 'all';
      qa('[data-tview]').forEach((b) => b.classList.toggle('active', b.dataset.tview === activeTableView));
      qa('[data-tsec]').forEach((sec) => {
        sec.style.display = activeTableView === 'all' || sec.dataset.tsec === activeTableView ? '' : 'none';
      });
    });
  });

  // 3-Way BOM Comparison Switcher
  const bomThead = q('[data-el="bom-thead"]');
  const bomTbody = q('[data-el="bom-tbody"]');
  const bomTotalBadge = q('[data-kpi="bom-total"]');
  qa('[data-bom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.bom || 'proposal';
      qa('[data-bom]').forEach((b) => b.classList.toggle('active', b.dataset.bom === mode));
      if (mode === 'edge_lora') {
        if (bomTotalBadge) bomTotalBadge.textContent = 'Total: $223.50 / ₱12,909';
        if (bomThead) bomThead.innerHTML = '<th>Component</th><th>Qty</th><th>Cost</th><th>Specification</th>';
        if (bomTbody) {
          bomTbody.innerHTML = EDGE_LORA_BOM.map(
            (b) => `<tr><td>${b.item}</td><td class="mono">${b.qty}</td><td class="mono">${b.usd} (${b.php})</td><td>${b.spec}</td></tr>`
          ).join('');
        }
      } else if (mode === 'budget') {
        if (bomTotalBadge) bomTotalBadge.textContent = 'Savings: -$65.00 ($128 -> $63)';
        if (bomThead) bomThead.innerHTML = '<th>Subsystem</th><th>Alternative</th><th>Cost (Save)</th><th>Trade-Off</th>';
        if (bomTbody) {
          bomTbody.innerHTML = BUDGET_ALTERNATIVES.map(
            (b) => `<tr><td>${b.sub}</td><td>${b.alt}</td><td class="mono">${b.cost} (${b.save})</td><td>${b.note}</td></tr>`
          ).join('');
        }
      } else {
        if (bomTotalBadge) bomTotalBadge.textContent = `Total: ₱${THESIS_BOM_TOTAL_PHP.toLocaleString()}`;
        if (bomThead) bomThead.innerHTML = '<th>Material</th><th>Qty</th><th>Cost</th><th>Specification</th>';
        if (bomTbody) {
          bomTbody.innerHTML = THESIS_BOM.map(
            (b) => `<tr><td>${b.item}</td><td class="mono">${b.qty}</td><td class="mono">${b.cost}</td><td>${b.spec}</td></tr>`
          ).join('');
        }
      }
    });
  });

  // River Mounting Placement Segmented Selector
  qa('[data-mount]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      const m = btn.dataset.mount;
      const mountMode = m === 'lab_pole' ? 'lab_pole' : m === 'side_pole' ? 'side_pole' : 'bridge';
      state.riverMountMode = mountMode;
      emitChange('riverMountMode', mountMode);
      actions.onMountModeChange?.(mountMode);
      syncControlWidgets();
    });
  });

  // Quick LiDAR Aim Buttons in Side-Pole Mode
  qa('[data-lidar-aim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pauseOnManualEdit();
      const aim = btn.dataset.lidarAim;
      state.riverLidarTiltDeg = aim === 'nadir' ? 0 : 32;
      emitChange('riverLidarTiltDeg', state.riverLidarTiltDeg);
      syncControlWidgets();
    });
  });

  q('[data-act="reframe-mount"]')?.addEventListener('click', () => {
    state.cameraPreset = 'river_cross_section';
    actions.setCameraPreset?.('river_cross_section');
    syncControlWidgets();
  });

  // Range & Select Bindings
  const bindRange = (inputKey, onInput) => {
    const el = q(`[data-input="${inputKey}"]`);
    if (!el) return;
    el.addEventListener('input', () => {
      pauseOnManualEdit();
      onInput(Number(el.value));
      syncControlWidgets();
    });
  };

  bindRange('valveOpening', (v) => {
    state.valveOpening = v / 100;
    emitChange('valveOpening', state.valveOpening);
  });
  bindRange('waveMakerPower', (v) => {
    state.waveMakerPower = v / 100;
    emitChange('waveMakerPower', state.waveMakerPower);
  });
  bindRange('debrisCountTarget', (v) => {
    state.debrisCountTarget = v;
    emitChange('debrisCountTarget', v);
  });
  bindRange('lidarHeightM', (v) => {
    state.lidarHeightM = v;
    emitChange('lidarHeightM', v);
  });
  bindRange('riverLidarHeightM', (v) => {
    state.riverLidarHeightM = v;
    if (state.mode === 'river') state.lidarHeightM = v;
    emitChange('riverLidarHeightM', v);
  });
  bindRange('sidePoleHeightM', (v) => {
    state.sidePoleHeightM = v;
    emitChange('sidePoleHeightM', v);
  });
  bindRange('riverLidarTiltDeg', (v) => {
    state.riverLidarTiltDeg = v;
    emitChange('riverLidarTiltDeg', v);
  });
  bindRange('riverStageM', (v) => {
    state.riverStageM = v;
    if (state.riverStagePreset === 'hydrograph') state.riverStagePreset = 'normal';
    emitChange('riverStageM', v);
  });
  bindRange('manningN', (v) => {
    state.manningN = v;
    emitChange('manningN', v);
  });
  bindRange('channelSlope', (v) => {
    state.channelSlope = v;
    emitChange('channelSlope', v);
  });
  bindRange('velocityCoeffK', (v) => {
    state.velocityCoeffK = v;
    emitChange('velocityCoeffK', v);
  });
  bindRange('rainIntensity', (v) => {
    state.rainIntensity = v / 100;
    emitChange('rainIntensity', state.rainIntensity);
  });
  bindRange('riverDebrisTarget', (v) => {
    state.debrisCountTarget = v;
    emitChange('debrisCountTarget', v);
  });
  bindRange('explodeFactor', (v) => {
    state.explodeFactor = v / 100;
    emitChange('explodeFactor', state.explodeFactor);
  });

  bindRange('th-wl', (v) => {
    state.thresholds.waterLevelM = v;
    emitChange('thresholds', state.thresholds);
  });
  bindRange('th-vs', (v) => {
    state.thresholds.surfaceVelocityMs = v;
    emitChange('thresholds', state.thresholds);
  });
  bindRange('th-q', (v) => {
    state.thresholds.dischargeM3s = v;
    emitChange('thresholds', state.thresholds);
  });
  bindRange('th-n', (v) => {
    state.thresholds.debrisCount = v;
    emitChange('thresholds', state.thresholds);
  });

  const bindSelect = (inputKey, onSelect) => {
    const el = q(`[data-input="${inputKey}"]`);
    if (!el) return;
    el.addEventListener('change', () => {
      pauseOnManualEdit();
      onSelect(el.value);
      syncControlWidgets();
    });
  };

  bindSelect('riverStagePreset', (val) => {
    state.riverStagePreset = val;
    const map = { baseflow: 0.55, normal: 1.15, monsoon: 1.95, flood: 2.65 };
    if (map[val] !== undefined) state.riverStageM = map[val];
    emitChange('riverStagePreset', val);
  });

  bindSelect('turbidityMode', (val) => {
    state.turbidityMode = val;
    emitChange('turbidityMode', val);
  });

  bindSelect('timeOfDayPreset', (val) => {
    state.timeOfDay = val;
    if (val === 'day') {
      state.sunGlare = 0.0;
      state.nightMode = false;
    } else if (val === 'glare') {
      state.sunGlare = 0.85;
      state.nightMode = false;
    } else if (val === 'dusk') {
      state.sunGlare = 0.15;
      state.nightMode = false;
    } else if (val === 'night_no_ir') {
      state.sunGlare = 0.0;
      state.nightMode = false;
    } else if (val === 'night') {
      state.sunGlare = 0.0;
      state.nightMode = true;
    }
    emitChange('timeOfDay', val);
  });

  // Table & Alert Actions
  q('[data-act="capture-trial"]')?.addEventListener('click', () => actions.onCaptureTrial?.());
  q('[data-act="reset-logs"]')?.addEventListener('click', () => {
    shownToastIds.clear();
    lastAlertSig = '';
    lastLoggedTrialSig = '';
    actions.onResetLogs?.();
  });
  q('[data-act="test-alert"]')?.addEventListener('click', () => triggerSyntheticAlert());
  q('[data-act="test-alert-2"]')?.addEventListener('click', () => triggerSyntheticAlert());

  q('[data-act="export-csv"]')?.addEventListener('click', () => {
    if (actions.onExportCsv) {
      actions.onExportCsv();
      return;
    }
    triggerDownload('river_monitoring_trials.csv', latestLogsAsCsv(), 'text/csv;charset=utf-8');
  });

  q('[data-act="export-json"]')?.addEventListener('click', () => {
    const payload = JSON.stringify(cachedTrialLogs || {}, null, 2);
    triggerDownload('river_monitoring_trials.json', payload, 'application/json');
  });

  function generateMarkdownReport() {
    const snap = lastSnapshot;
    const isRiver = snap?.phase === 'phase2' || state.mode === 'river';
    const p1 = cachedTrialLogs?.phase1 || [];
    const p2 = cachedTrialLogs?.phase2 || [];
    const s1 = cachedTrialLogs?.stats?.phase1;
    const s2 = cachedTrialLogs?.stats?.phase2;
    const rows = [...p1, ...p2];
    const recent = rows.slice(-10);
    const lines = [
      '# River Monitoring System — Simulation Trial Report',
      '',
      `- **RTC Timestamp:** ${snap?.rtcLocalLabel || new Date().toISOString()}`,
      `- **Active Phase:** ${isRiver ? 'Phase 2 — Guimbal River Field' : 'Phase 1 — Controlled Flume Tank'}`,
      `- **Mounting Mode:** ${snap?.mounting?.label || state.riverMountMode}`,
      `- **Architecture Profile:** ${state.architectureProfile === 'edge_lora' ? 'Edge / LoRa (ESP32 + Ra-02)' : 'Thesis Proposal (Wi-Fi + Cloud)'}`,
      '',
      '## Live Telemetry Snapshot',
      snap
        ? [
            `- **Water Level (WL):** ${snap.waterLevel.calculatedM.toFixed(3)} m (AE ${snap.waterLevel.absErrorCm.toFixed(2)} cm, Table X: ${snap.waterLevel.tableXPass ? 'PASS' : 'FAIL'})`,
            `- **Surface Velocity (Vs):** ${snap.velocity.estimatedVs.toFixed(2)} m/s (rRMSE ${snap.velocity.rRrmsePct.toFixed(1)}%)`,
            `- **Discharge (Q):** ${snap.discharge.estimatedQ < 0.05 ? snap.discharge.estimatedQ.toFixed(5) : snap.discharge.estimatedQ.toFixed(2)} m^3/s (A=${snap.discharge.wettedAreaM2.toFixed(isRiver ? 2 : 4)} m^2, k=${snap.discharge.velocityCoeffK.toFixed(2)})`,
            `- **YOLOv8 Debris & Hazard Index:** ${snap.debris.systemCountNs}/${snap.debris.manualCountNr} (F1 ${snap.debris.f1Pct.toFixed(0)}%, HI ${Number(snap.debris.hazardIndex ?? 0).toFixed(1)} [${snap.debris.alertLevel}])`,
            `- **Edge Storage TSR (LiDAR / Video):** ${Number(snap.edgeStorage.lidarTsrPct ?? snap.edgeStorage.tsrPct).toFixed(1)}% / ${Number(snap.edgeStorage.videoTsrPct ?? snap.edgeStorage.tsrPct).toFixed(1)}% (Queue: ${snap.edgeStorage.queuedCount})`,
            `- **12-Byte LoRa Frame (>BHHHHBH):** \`${snap.loraPayload?.hex || '--'}\``,
          ].join('\n')
        : '_No live snapshot captured yet._',
      '',
      '## Aggregate Thesis Metrics',
      s1
        ? `- **Phase 1 (Lab, ${p1.length} trials):** MaxAE ${s1.wlMaxAeCm.toFixed(2)} cm | MAE ${s1.wlMaeCm.toFixed(2)} cm | RMSE ${s1.wlRmseCm.toFixed(2)} cm | Day F1 ${s1.day.f1Pct.toFixed(0)}% (${s1.day.frames}f) | 850nm IR F1 ${s1.nightIr.f1Pct.toFixed(0)}% (${s1.nightIr.frames}f)`
        : '- **Phase 1:** No trials recorded.',
      s2
        ? `- **Phase 2 (River, ${p2.length} trials):** MaxAE ${s2.wlMaxAeCm.toFixed(2)} cm | MAE ${s2.wlMaeCm.toFixed(2)} cm | RMSE ${s2.wlRmseCm.toFixed(2)} cm | Day F1 ${s2.day.f1Pct.toFixed(0)}% (${s2.day.frames}f) | 850nm IR F1 ${s2.nightIr.f1Pct.toFixed(0)}% (${s2.nightIr.frames}f)`
        : '- **Phase 2:** No trials recorded.',
      '',
      '## Latest Logged Trials (Up to 10)',
      '| Trial | Phase | Lighting | WL (m) | AE (cm) | Vs (m/s) | Q (m^3/s) | Ns/Nr | F1% | HI | TSR L/V |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...(recent.length
        ? recent.map(
            (r) =>
              `| ${r.trialId} | ${r.phase} | ${r.lightingCondition} | ${Number(r.calculatedWlM ?? 0).toFixed(3)} | ${Number(r.wlAbsErrorCm ?? 0).toFixed(2)} | ${Number(r.estimatedVsMs ?? 0).toFixed(2)} | ${Number(r.estimatedQM3s ?? 0) < 0.05 ? Number(r.estimatedQM3s ?? 0).toFixed(5) : Number(r.estimatedQM3s ?? 0).toFixed(2)} | ${r.systemDebrisNs}/${r.manualDebrisNr} | ${Number(r.f1Pct ?? 0).toFixed(0)}% | ${Number(r.hazardIndex ?? 0).toFixed(1)} | ${Number(r.lidarTsrPct ?? r.tsrPct ?? 0).toFixed(0)}%/${Number(r.videoTsrPct ?? r.tsrPct ?? 0).toFixed(0)}% |`
          )
        : ['| _None_ | - | - | - | - | - | - | - | - | - | - |']),
      '',
    ];
    return lines.join('\n');
  }

  q('[data-act="export-md"]')?.addEventListener('click', () => {
    triggerDownload('river_monitoring_report.md', generateMarkdownReport(), 'text/markdown;charset=utf-8');
  });

  // Bottom Timeline Transport
  playPauseBtn.addEventListener('click', () => {
    actions.togglePlay?.();
  });

  qa('[data-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.stage);
      actions.seekStage?.(idx);
    });
  });

  scrubInput.addEventListener('input', () => {
    const p = Number(scrubInput.value) / 1000;
    actions.setTimelineProgress?.(p);
  });

  let cachedTrialLogs = null;
  let lastSnapshot = null;
  const shownToastIds = new Set();

  qa('tr[data-comp]').forEach((row) => {
    row.addEventListener('click', () => {
      actions.onSelectComponent?.(row.dataset.comp);
    });
  });

  function triggerSyntheticAlert() {
    if (actions.onTriggerTestAlert) {
      actions.onTriggerTestAlert();
      return;
    }
    const isRiver = state.mode === 'river';
    const sample = {
      id: `ALT-TEST`,
      timestamp: lastSnapshot?.rtcLocalLabel || new Date().toISOString(),
      parameter: 'Discharge (Q)',
      value: isRiver ? 31.4 : 0.00168,
      threshold: state.thresholds?.dischargeM3s ?? (isRiver ? 28.0 : 0.00145),
      unit: 'm³/s',
      severity: 'CRITICAL',
      recipient: isRiver ? 'guimbal-drrmo@iloilo.gov.ph' : 'lab-monitor@usa.edu.ph',
      subject: `[CRITICAL] Simulated Discharge Threshold Breach`,
      message: `Manual threshold test triggered on ${isRiver ? 'Guimbal River' : 'Controlled Lab Tank'}.`,
      deliveryStatus: state.wifiOnline === false ? 'QUEUED (NO WIFI)' : 'DELIVERED',
      deliveryDelayMs: state.wifiOnline === false ? 0 : 340,
    };
    showEmailAlert(sample);
  }

  function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(val) {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function latestLogsAsCsv() {
    const rows = [
      ...(cachedTrialLogs?.phase1 || []),
      ...(cachedTrialLogs?.phase2 || []),
    ];
    const header = [
      'TrialID', 'Phase', 'Timestamp_RTC', 'MountMode', 'MountHeight_m', 'LiDAR_Angle_deg',
      'Camera_Angle_deg', 'SlantComp', 'FlowStage', 'Lighting', 'Turbidity',
      'Rainfall', 'Glare', 'LiDAR_D_m', 'WL_m', 'Ref_WL_m', 'AE_cm', 'TableX_WL_Pass',
      'Vs_ms', 'Vr_ms', 'Area_m2', 'k', 'Q_m3s', 'Ref_Q_m3s', 'IndependentRef',
      'Ns', 'Nr', 'TP', 'FP', 'FN', 'Precision_Pct', 'Recall_Pct', 'F1_Pct',
      'HazardIndex', 'AlertLevel', 'LiDAR_TSR_Pct', 'Video_TSR_Pct', 'TSR_Pct',
      'AlertsCount', 'LoRa_12B_Hex'
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.trialId, r.phase, r.timestamp,
        r.mountMode || (r.phase === 'phase2' ? 'Overhead Bridge Mount' : 'Lab PVC Gantry'),
        Number(r.mountHeightM ?? (r.phase === 'phase2' ? 4.5 : 0.693)).toFixed(2),
        Number(r.lidarAngleDeg ?? 0).toFixed(1),
        Number(r.cameraAngleDeg ?? 0).toFixed(1),
        r.slantCompEnabled !== false,
        r.flowStage, r.lightingCondition, r.turbidity,
        r.rainfall, r.glare,
        Number(r.lidarDistanceM ?? 0).toFixed(4),
        Number(r.calculatedWlM ?? 0).toFixed(4),
        Number(r.referenceWlM ?? 0).toFixed(4),
        Number(r.wlAbsErrorCm ?? 0).toFixed(2),
        Boolean(r.tableXWaterLevelPass),
        Number(r.estimatedVsMs ?? 0).toFixed(3),
        Number(r.referenceVsMs ?? 0).toFixed(3),
        Number(r.wettedAreaM2 ?? 0).toFixed(4),
        r.velocityCoeffK,
        Number(r.estimatedQM3s ?? 0).toFixed(5),
        Number(r.referenceQM3s ?? 0).toFixed(5),
        Boolean(r.independentRefAvailable),
        r.systemDebrisNs, r.manualDebrisNr, r.tp, r.fp, r.fn,
        Number(r.precisionPct ?? 0).toFixed(1),
        Number(r.recallPct ?? 0).toFixed(1),
        Number(r.f1Pct ?? 0).toFixed(1),
        Number(r.hazardIndex ?? 0).toFixed(2),
        r.alertLevel || 'NORMAL',
        Number(r.lidarTsrPct ?? r.tsrPct ?? 0).toFixed(1),
        Number(r.videoTsrPct ?? r.tsrPct ?? 0).toFixed(1),
        Number(r.tsrPct ?? 0).toFixed(1),
        r.alertsCount ?? 0,
        r.loraPayloadHex || '',
      ].map(csvCell).join(','));
    }
    return lines.join('\n');
  }

  function setIfUnfocused(inputKey, val) {
    const el = domInput.get(inputKey) || q(`[data-input="${inputKey}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(val);
    }
  }

  function setValText(key, text) {
    const el = domVal.get(key);
    if (el) el.textContent = text;
  }

  function setKpiText(key, text) {
    const el = domKpi.get(key);
    if (el) el.textContent = text;
  }

  function syncControlWidgets() {
    const isRiver = state.mode === 'river';
    const phaseKey = isRiver ? 'river' : 'lab';

    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === phaseKey));
    phase1Box.style.display = isRiver ? 'none' : '';
    phase2Box.style.display = isRiver ? '' : 'none';

    presetBtns.forEach((b) => {
      const pPhase = b.dataset.presetPhase || 'both';
      const visible = pPhase === 'both' || pPhase === phaseKey;
      b.style.display = visible ? '' : 'none';
      if (state.cameraPreset) {
        b.classList.toggle('active', b.dataset.preset === state.cameraPreset);
      }
    });

    if (quickExplodeBtn) {
      quickExplodeBtn.classList.toggle('active', (state.explodeFactor ?? 0) > 0.2);
    }

    // Phase 1 values
    const valvePct = Math.round((state.valveOpening ?? 0.75) * 100);
    const wavePct = Math.round((state.waveMakerPower ?? 0.25) * 100);
    const debrisN = Math.round(state.debrisCountTarget ?? (isRiver ? 12 : 6));
    const hVal = Number(state.lidarHeightM ?? (isRiver ? 4.5 : 0.693));

    setIfUnfocused('valveOpening', valvePct);
    setValText('valveOpening', `${valvePct}%`);

    setIfUnfocused('waveMakerPower', wavePct);
    setValText('waveMakerPower', `${wavePct}%`);

    setIfUnfocused('debrisCountTarget', Math.min(15, debrisN));
    setValText('debrisCountTarget', `${debrisN} items`);

    setIfUnfocused('lidarHeightM', hVal);
    setValText('lidarHeightM', `${hVal.toFixed(3)} m`);

    const pumpBtn = domCtrl.get('pumpActive');
    const pumpOn = state.pumpActive !== false;
    if (pumpBtn) {
      pumpBtn.textContent = pumpOn ? 'Pump: ON' : 'Pump: OFF';
      pumpBtn.classList.toggle('btn-emerald', pumpOn);
      pumpBtn.classList.toggle('btn-danger', !pumpOn);
    }

    // Phase 2 values
    const isLabPole = state.riverMountMode === 'lab_pole';
    const isSidePole = state.riverMountMode === 'side_pole';
    const isAnySidePole = isLabPole || isSidePole;
    const activeMountKey = isLabPole ? 'lab_pole' : isSidePole ? 'side_pole' : 'bridge';
    const mountValLabel = isLabPole
      ? `Lab-Style Pole (${Number(state.sidePoleHeightM ?? 6.00).toFixed(2)} m)`
      : isSidePole
        ? `Side-Pole (${Number(state.sidePoleHeightM ?? 6.00).toFixed(2)} m)`
        : `Bridge (${Number(state.riverLidarHeightM ?? 4.50).toFixed(2)} m)`;
    setValText('riverMountMode', mountValLabel);
    mountBtns.forEach((b) => b.classList.toggle('active', b.dataset.mount === activeMountKey));
    if (sidePoleBox) sidePoleBox.style.display = isAnySidePole ? '' : 'none';
    if (bridgeHeightRow) bridgeHeightRow.style.display = isRiver && !isAnySidePole ? '' : 'none';

    const bridgeH = Number(state.riverLidarHeightM ?? 4.50);
    setIfUnfocused('riverLidarHeightM', bridgeH);
    setValText('riverLidarHeightM', `${bridgeH.toFixed(2)} m`);

    const sideH = Number(state.sidePoleHeightM ?? 6.00);
    setIfUnfocused('sidePoleHeightM', sideH);
    setValText('sidePoleHeightM', `${sideH.toFixed(2)} m`);

    const tiltDeg = Math.round(Number(state.riverLidarTiltDeg ?? 32));
    setIfUnfocused('riverLidarTiltDeg', tiltDeg);
    setValText('riverLidarTiltDeg', tiltDeg <= 0 ? '0° (Nadir)' : `${tiltDeg}° (Slant)`);
    lidarAimBtns.forEach((b) => {
      const want = b.dataset.lidarAim === 'nadir' ? tiltDeg === 0 : tiltDeg > 0;
      b.classList.toggle('active', want);
    });

    const slantCompBtn = domCtrl.get('riverLidarSlantComp');
    if (slantCompBtn) {
      const compOn = state.riverLidarSlantComp !== false;
      slantCompBtn.textContent = compOn ? 'cos(θ) Comp: ON' : 'cos(θ) Comp: OFF';
      slantCompBtn.classList.toggle('active', compOn);
    }

    setIfUnfocused('riverStagePreset', state.riverStagePreset || 'normal');
    const stageM = Number(state.riverStageM ?? 1.15);
    setIfUnfocused('riverStageM', stageM);
    setValText('riverStageM', `${stageM.toFixed(2)} m`);

    const nVal = Number(state.manningN ?? 0.035);
    setIfUnfocused('manningN', nVal);
    setValText('manningN', nVal.toFixed(3));

    const s0Val = Number(state.channelSlope ?? 0.0022);
    setIfUnfocused('channelSlope', s0Val);
    setValText('channelSlope', s0Val.toFixed(4));

    const kVal = Number(state.velocityCoeffK ?? 0.85);
    setIfUnfocused('velocityCoeffK', kVal);
    setValText('velocityCoeffK', kVal.toFixed(2));

    const rainPct = Math.round((state.rainIntensity ?? 0) * 100);
    setIfUnfocused('rainIntensity', rainPct);
    setValText('rainIntensity', `${rainPct}%`);

    setIfUnfocused('riverDebrisTarget', debrisN);
    setValText('riverDebrisTarget', `${debrisN} items`);

    const archKey = state.architectureProfile === 'edge_lora' ? 'edge_lora' : 'proposal';
    archBtns.forEach((b) => b.classList.toggle('active', b.dataset.arch === archKey));
    const archBadge = domKpi.get('arch-badge');
    if (archBadge) {
      archBadge.textContent = archKey === 'edge_lora' ? 'EDGE + LORA' : 'PROPOSAL';
      archBadge.className = `badge mono ${archKey === 'edge_lora' ? 'badge-warn' : 'badge-ok'}`;
    }

    const sliceBtn = domCtrl.get('showBathymetrySlice');
    if (sliceBtn) sliceBtn.classList.toggle('active', state.showBathymetrySlice !== false);
    const gcpBtn = domCtrl.get('showGcpGrid');
    if (gcpBtn) gcpBtn.classList.toggle('active', state.showGcpGrid !== false);
    const refBtn = domCtrl.get('independentFieldRef');
    if (refBtn) {
      const hasRef = Boolean(state.independentFieldRef);
      refBtn.classList.toggle('active', hasRef);
      refBtn.textContent = hasRef ? 'Field Discharge Ref: AVAILABLE (Q_ref)' : 'Field Discharge Ref: ABSENT (Obj 5A)';
    }

    // Shared values
    const expPct = Math.round((state.explodeFactor ?? 0) * 100);
    setIfUnfocused('explodeFactor', expPct);
    setValText('explodeFactor', `${expPct}%`);

    setIfUnfocused('turbidityMode', state.turbidityMode || (isRiver ? 'silty' : 'clear'));
    const tod = state.nightMode
      ? 'night'
      : state.timeOfDay === 'night_no_ir'
        ? 'night_no_ir'
        : (state.sunGlare ?? 0) > 0.5
          ? 'glare'
          : state.timeOfDay || 'day';
    setIfUnfocused('timeOfDayPreset', tod);

    const nightOn = Boolean(state.nightMode);
    const nightBtn = domCtrl.get('nightMode');
    if (nightBtn) {
      nightBtn.textContent = nightOn ? '850nm Night IR: ON' : '850nm Night IR: OFF';
      nightBtn.classList.toggle('active', nightOn);
    }
    quickIrBtn.classList.toggle('active', nightOn);

    const wifiOn = state.wifiOnline !== false;
    const wifiBtn = domCtrl.get('wifiOnline');
    if (wifiBtn) {
      wifiBtn.textContent = wifiOn ? 'Wi-Fi: ONLINE' : 'Wi-Fi: OUTAGE';
      wifiBtn.classList.toggle('btn-emerald', wifiOn);
      wifiBtn.classList.toggle('btn-danger', !wifiOn);
    }

    const opticsBtn = domCtrl.get('showOptics');
    const opticsOn = state.showOptics !== false;
    if (opticsBtn) {
      opticsBtn.textContent = opticsOn ? '850nm NIR Visual: ON' : '850nm NIR Visual: OFF';
      opticsBtn.classList.toggle('active', opticsOn);
    }

    const pipeBtn = domCtrl.get('pipelineActive');
    const pipeOn = state.pipelineActive !== false;
    if (pipeBtn) {
      pipeBtn.textContent = pipeOn ? 'Logging: ON' : 'Logging: PAUSED';
      pipeBtn.classList.toggle('active', pipeOn);
    }

    // Threshold sliders adapt range cleanly between Lab and River
    const th = state.thresholds || getDefaultThresholds(phaseKey);
    const thWlInput = domInput.get('th-wl');
    const thVsInput = domInput.get('th-vs');
    const thQInput = domInput.get('th-q');
    if (isRiver !== lastModeRendered) {
      lastModeRendered = isRiver;
      if (thWlInput) {
        thWlInput.min = isRiver ? '0.50' : '0.200';
        thWlInput.max = isRiver ? '3.30' : '0.420';
        thWlInput.step = isRiver ? '0.05' : '0.002';
      }
      if (thVsInput) {
        thVsInput.min = isRiver ? '0.30' : '0.040';
        thVsInput.max = isRiver ? '4.50' : '0.350';
        thVsInput.step = isRiver ? '0.05' : '0.005';
      }
      if (thQInput) {
        thQInput.min = isRiver ? '2.0' : '0.0005';
        thQInput.max = isRiver ? '65.0' : '0.0040';
        thQInput.step = isRiver ? '0.5' : '0.00005';
      }
    }
    setIfUnfocused('th-wl', th.waterLevelM);
    setValText('th-wl', `${Number(th.waterLevelM).toFixed(3)} m`);
    setIfUnfocused('th-vs', th.surfaceVelocityMs);
    setValText('th-vs', `${Number(th.surfaceVelocityMs).toFixed(2)} m/s`);
    setIfUnfocused('th-q', th.dischargeM3s);
    setValText('th-q', `${Number(th.dischargeM3s).toFixed(isRiver ? 1 : 5)} m³/s`);
    setIfUnfocused('th-n', th.debrisCount);
    setValText('th-n', `${Math.round(th.debrisCount)} items`);
  }

  function renderSensitivityChart(sens) {
    if (!sens || !sens.points || !sens.points.length) return;
    sizeHiDpi(sensCanvas, sensCtx, 340, 150);
    const w = 340;
    const h = 150;
    const padL = 44;
    const padR = 14;
    const padT = 14;
    const padB = 24;
    const cw = w - padL - padR;
    const ch = h - padT - padB;

    sensCtx.clearRect(0, 0, w, h);

    let minQ = Infinity;
    let maxQ = -Infinity;
    for (const pt of sens.points) {
      if (pt.qLowWL < minQ) minQ = pt.qLowWL;
      if (pt.qHighWL > maxQ) maxQ = pt.qHighWL;
    }
    minQ = Math.max(0, minQ * 0.88);
    maxQ = Math.max(minQ + 1e-5, maxQ * 1.12);

    const xForK = (k) => padL + ((k - 0.70) / 0.25) * cw;
    const yForQ = (qVal) => padT + ch - ((qVal - minQ) / (maxQ - minQ)) * ch;

    // Grid & Y labels
    sensCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    sensCtx.fillStyle = '#94a3b8';
    sensCtx.font = '10px monospace';
    sensCtx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const frac = i / 3;
      const y = padT + ch * (1 - frac);
      const qTick = minQ + (maxQ - minQ) * frac;
      sensCtx.beginPath();
      sensCtx.moveTo(padL, y);
      sensCtx.lineTo(w - padR, y);
      sensCtx.stroke();
      sensCtx.fillText(qTick < 0.05 ? qTick.toFixed(4) : qTick.toFixed(1), 4, y + 3);
    }

    // X ticks (k)
    for (const pt of sens.points) {
      const x = xForK(pt.k);
      sensCtx.fillText(pt.k.toFixed(2), x - 11, h - 7);
    }

    // Shaded WL +- 0.05m uncertainty band
    sensCtx.beginPath();
    sens.points.forEach((pt, idx) => {
      const x = xForK(pt.k);
      const y = yForQ(pt.qHighWL);
      if (idx === 0) sensCtx.moveTo(x, y);
      else sensCtx.lineTo(x, y);
    });
    for (let i = sens.points.length - 1; i >= 0; i--) {
      const pt = sens.points[i];
      sensCtx.lineTo(xForK(pt.k), yForQ(pt.qLowWL));
    }
    sensCtx.closePath();
    sensCtx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    sensCtx.fill();

    // Nominal Q(k) curve
    sensCtx.beginPath();
    sens.points.forEach((pt, idx) => {
      const x = xForK(pt.k);
      const y = yForQ(pt.qNominal);
      if (idx === 0) sensCtx.moveTo(x, y);
      else sensCtx.lineTo(x, y);
    });
    sensCtx.strokeStyle = '#38bdf8';
    sensCtx.lineWidth = 2.2;
    sensCtx.stroke();

    // Active k marker dot
    const curX = xForK(sens.currentK);
    const curY = yForQ(sens.currentQ);
    sensCtx.fillStyle = '#22ff88';
    sensCtx.beginPath();
    sensCtx.arc(curX, curY, 4, 0, Math.PI * 2);
    sensCtx.fill();

    const fmtQ = (v) => (v < 0.05 ? v.toFixed(5) : v.toFixed(2));
    setKpiText(
      'sens-summary',
      `ΔQ(k): ${fmtQ(sens.deltaQOverK)} | ΔQ(±5cm): ${fmtQ(sens.deltaQOverWL)} | GUM u_c: ±${sens.uncertaintyBandPct.toFixed(1)}%`
    );
  }

  let lastTsPhase = null;
  function renderTimeSeriesChart() {
    if (!tsCanvas || !tsCtx) return;
    sizeHiDpi(tsCanvas, tsCtx, 340, 118);
    const w = 340;
    const h = 118;
    const padL = 8;
    const padR = 8;
    const padT = 16;
    const padB = 14;
    const cw = w - padL - padR;
    const ch = h - padT - padB;

    tsCtx.clearRect(0, 0, w, h);
    tsCtx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    tsCtx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = padT + (ch * i) / 2;
      tsCtx.beginPath();
      tsCtx.moveTo(padL, y);
      tsCtx.lineTo(w - padR, y);
      tsCtx.stroke();
    }

    if (tsSeries.length < 2) {
      tsCtx.fillStyle = '#64748b';
      tsCtx.font = '10px monospace';
      tsCtx.fillText('Sampling live WL / Vs / Q series…', padL + 4, padT + ch * 0.52);
      return;
    }

    const drawTrace = (getter, thGetter, strokeColor) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < tsSeries.length; i++) {
        const v = getter(tsSeries[i]);
        const thV = thGetter(tsSeries[i]);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (thV < lo) lo = thV;
        if (thV > hi) hi = thV;
      }
      const span = Math.max(hi - lo, Math.max(Math.abs(hi), 1e-4) * 0.25);
      lo = Math.max(0, lo - span * 0.15);
      hi = hi + span * 0.15;
      const denom = Math.max(hi - lo, 1e-6);

      const lastTh = thGetter(tsSeries[tsSeries.length - 1]);
      const thY = padT + ch - ((lastTh - lo) / denom) * ch;
      tsCtx.save();
      tsCtx.setLineDash([4, 4]);
      tsCtx.strokeStyle = strokeColor;
      tsCtx.globalAlpha = 0.42;
      tsCtx.lineWidth = 1;
      tsCtx.beginPath();
      tsCtx.moveTo(padL, thY);
      tsCtx.lineTo(w - padR, thY);
      tsCtx.stroke();
      tsCtx.restore();

      tsCtx.strokeStyle = strokeColor;
      tsCtx.lineWidth = 1.75;
      tsCtx.beginPath();
      for (let i = 0; i < tsSeries.length; i++) {
        const x = padL + (i / (tsSeries.length - 1)) * cw;
        const y = padT + ch - ((getter(tsSeries[i]) - lo) / denom) * ch;
        if (i === 0) tsCtx.moveTo(x, y);
        else tsCtx.lineTo(x, y);
      }
      tsCtx.stroke();
    };

    drawTrace((d) => d.wl, (d) => d.wlTh, '#38bdf8');
    drawTrace((d) => d.vs, (d) => d.vsTh, '#34d399');
    drawTrace((d) => d.q, (d) => d.qTh, '#fbbf24');

    const latest = tsSeries[tsSeries.length - 1];
    tsCtx.fillStyle = '#cbd5e1';
    tsCtx.font = '9.5px monospace';
    tsCtx.fillText(
      `WL ${latest.wl.toFixed(3)}m | Vs ${latest.vs.toFixed(2)}m/s | Q ${latest.q < 0.05 ? latest.q.toFixed(4) : latest.q.toFixed(1)} (${tsSeries.length}/90)`,
      padL,
      11
    );
  }

  function renderTables(trialLogs, snapshot) {
    if (!trialLogs || !drawerOpen || activeTab !== 'tables') return;
    const p1 = trialLogs.phase1 || [];
    const p2 = trialLogs.phase2 || [];
    const sig = `${p1.length}-${p2.length}-${p1[p1.length - 1]?.trialId || ''}-${p2[p2.length - 1]?.trialId || ''}-${snapshot.edgeStorage.lidarTsrPct.toFixed(1)}-${snapshot.edgeStorage.videoTsrPct.toFixed(1)}-${snapshot.functionalityChecks?.[0]?.tested || 0}`;
    if (sig === lastLoggedTrialSig) return;
    lastLoggedTrialSig = sig;

    const s1 = trialLogs.stats?.phase1;
    if (s1) {
      setKpiText(
        't1-stats',
        `MaxAE: ${s1.wlMaxAeCm.toFixed(2)}cm | MAE: ${s1.wlMaeCm.toFixed(2)}cm | RMSE: ${s1.wlRmseCm.toFixed(2)}cm`
      );
      setKpiText(
        't34-split',
        `Day: F1 ${s1.day.f1Pct.toFixed(0)}% (${s1.day.frames}f) | 850nm IR: F1 ${s1.nightIr.f1Pct.toFixed(0)}% (${s1.nightIr.frames}f)`
      );
    }

    const s2 = trialLogs.stats?.phase2;
    if (s2) {
      setKpiText(
        't89-split',
        `Day: F1 ${s2.day.f1Pct.toFixed(0)}% (${s2.day.frames}f) | 850nm IR: F1 ${s2.nightIr.f1Pct.toFixed(0)}% (${s2.nightIr.frames}f)`
      );
    }

    const t1El = domTbody.get('t1');
    if (t1El) {
      t1El.innerHTML = p1
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            `<tr><td class="mono">${r.trialId}</td><td class="mono">${String(r.timestamp || '').slice(11, 19)}</td><td class="mono">${r.lidarDistanceM.toFixed(3)}</td><td class="mono">${r.calculatedWlM.toFixed(3)}</td><td class="mono">${r.referenceWlM.toFixed(3)}</td><td class="mono">${r.wlAbsErrorCm.toFixed(2)}</td><td class="mono">${r.estimatedVsMs.toFixed(2)}</td><td class="mono">${r.referenceVsMs.toFixed(2)}</td></tr>`
        )
        .join('');
    }

    const t2El = domTbody.get('t2');
    if (t2El) {
      t2El.innerHTML = p1
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            `<tr><td class="mono">${r.trialId}</td><td class="mono">${r.wettedAreaM2.toFixed(4)}</td><td class="mono">${r.velocityCoeffK.toFixed(2)}</td><td class="mono">${r.estimatedQM3s.toFixed(5)}</td><td class="mono">${r.referenceQM3s.toFixed(5)}</td><td class="mono">${r.qPercentError.toFixed(1)}%</td></tr>`
        )
        .join('');
    }

    const t34El = domTbody.get('t34');
    if (t34El) {
      t34El.innerHTML = p1
        .slice(-10)
        .reverse()
        .map(
          (r) =>
            `<tr><td class="mono">${r.trialId}</td><td>${r.lightingCondition}</td><td class="mono">${r.systemDebrisNs}/${r.manualDebrisNr}</td><td class="mono">${r.tp}/${r.fp}/${r.fn}</td><td class="mono">${r.f1Pct.toFixed(0)}%</td><td class="mono">${Number(r.lidarTsrPct ?? r.tsrPct).toFixed(0)}%</td><td class="mono">${Number(r.videoTsrPct ?? r.tsrPct).toFixed(0)}%</td></tr>`
        )
        .join('');
    }

    const t5El = domTbody.get('t5');
    if (t5El) {
      t5El.innerHTML = (snapshot.functionalityChecks || [])
        .map(
          (c) =>
            `<tr><td>${c.name}</td><td>${c.criterion}</td><td class="mono">${c.tested ?? 1}</td><td class="mono">${c.passed ?? 1}</td><td><span class="badge ${c.status === 'PASS' ? 'badge-ok' : 'badge-warn'}">${c.status}</span></td></tr>`
        )
        .join('');
    }

    const fieldEl = domTbody.get('field');
    if (fieldEl) {
      fieldEl.innerHTML = p2.length
        ? p2
            .slice(-10)
            .reverse()
            .map(
              (r) =>
                `<tr><td class="mono">${r.trialId}</td><td>${r.flowStage}/${r.rainfall}</td><td class="mono">${r.calculatedWlM.toFixed(2)}</td><td class="mono">${r.estimatedVsMs.toFixed(2)}</td><td class="mono">${r.estimatedQM3s.toFixed(2)}</td><td class="mono">${r.independentRefAvailable ? 'Yes' : 'No'}</td></tr>`
            )
            .join('')
        : `<tr><td colspan="6" style="color:#94a3b8;text-align:center;">Switch to Phase 2 or Stage 6 to record Tables 6–7 field trials.</td></tr>`;
    }

    const field89El = domTbody.get('field89');
    if (field89El) {
      field89El.innerHTML = p2.length
        ? p2
            .slice(-10)
            .reverse()
            .map(
              (r) =>
                `<tr><td class="mono">${r.trialId}</td><td>${r.lightingCondition}</td><td class="mono">${r.systemDebrisNs}/${r.manualDebrisNr}</td><td class="mono">${r.f1Pct.toFixed(0)}%</td><td class="mono">${Number(r.hazardIndex ?? 0).toFixed(1)}</td><td class="mono">${Number(r.lidarTsrPct ?? r.tsrPct).toFixed(0)}%</td><td class="mono">${Number(r.videoTsrPct ?? r.tsrPct).toFixed(0)}%</td></tr>`
            )
            .join('')
        : `<tr><td colspan="7" style="color:#94a3b8;text-align:center;">No Phase 2 debris / TSR records logged yet.</td></tr>`;
    }
  }

  function renderAlertInbox(alerts = []) {
    alertTabCount.textContent = String(alerts.length);
    if (!drawerOpen || activeTab !== 'alerts') return;
    const alertSig = alerts.map((a) => `${a.id}:${a.deliveryStatus}`).join('|');
    if (alertSig === lastAlertSig) return;
    lastAlertSig = alertSig;

    if (!alerts.length) {
      alertListEl.innerHTML = `<div style="font-size:11px;color:#94a3b8;padding:12px;text-align:center;">No threshold breaches logged yet. Raise flow/debris or run Stage 5 to trigger alerts.</div>`;
      return;
    }

    alertListEl.innerHTML = alerts
      .map(
        (a) => `
      <div class="dash-email-card ${a.severity === 'CRITICAL' ? 'critical' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:3px;">
          <strong style="color:${a.severity === 'CRITICAL' ? '#fca5a5' : '#fcd34d'};">${a.subject}</strong>
          <span class="badge ${a.deliveryStatus.includes('DELIVERED') ? 'badge-ok' : 'badge-warn'} mono">${a.deliveryStatus}</span>
        </div>
        <div class="mono" style="color:#94a3b8;font-size:10px;margin-bottom:3px;">To: ${a.recipient} | ${a.timestamp} | Delay: ${a.deliveryDelayMs} ms</div>
        <div style="color:#e2e8f0;">${a.message}</div>
      </div>
    `
      )
      .join('');
  }

  function showEmailAlert(alertObj) {
    if (!alertObj) return;
    if (alertObj.id && alertObj.id !== 'ALT-TEST') {
      if (shownToastIds.has(alertObj.id)) return;
      shownToastIds.add(alertObj.id);
    }
    const toastHost = document.getElementById('alert-toast-root') || root;
    const toast = document.createElement('div');
    toast.className = `dash-toast ${alertObj.severity === 'CRITICAL' ? 'critical' : ''}`;
    toast.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-weight:700;font-size:12px;color:${alertObj.severity === 'CRITICAL' ? '#fca5a5' : '#fcd34d'};">
          ✉ Email Alert (${alertObj.severity || 'WARNING'})
        </span>
        <span class="badge badge-ok mono">${alertObj.deliveryDelayMs ?? 320} ms</span>
      </div>
      <div style="font-size:11.5px;font-weight:600;margin-bottom:3px;">${alertObj.subject || alertObj.parameter}</div>
      <div style="font-size:11px;color:#cbd5e1;">${alertObj.message || ''}</div>
      <div class="mono" style="font-size:10px;color:#94a3b8;margin-top:4px;">To: ${alertObj.recipient || 'drrmo@iloilo.gov.ph'} • ${alertObj.deliveryStatus || 'DELIVERED'}</div>
    `;
    toastHost.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 6500);
  }

  let lastStageIdxForBanner = -2;
  function update(snapshot, sensitivityData, trialLogs, timelineInfoArg) {
    lastSnapshot = snapshot;
    cachedTrialLogs = trialLogs;

    syncControlWidgets();

    // Update Timeline Bar & Stage Narration Banner
    const tInfo = timelineInfoArg || actions.getTimelineInfo?.() || state.timelineInfo;
    if (tInfo) {
      playPauseBtn.textContent = tInfo.playing ? '⏸ Pause' : '▶ Play Story';
      playPauseBtn.classList.toggle('btn-primary', tInfo.playing);
      playPauseBtn.classList.toggle('btn-emerald', !tInfo.playing);
      if (document.activeElement !== scrubInput) {
        scrubInput.value = String(Math.round((tInfo.progress || 0) * 1000));
      }
      stageTitleEl.textContent = tInfo.title || '7-Stage Pipeline';
      stageTimeEl.textContent = `${(tInfo.currentTime || 0).toFixed(1)}s / ${(tInfo.totalDuration || TOTAL_TIMELINE_DURATION_S).toFixed(1)}s`;
      stagePills.forEach((b) =>
        b.classList.toggle('active', Number(b.dataset.stage) === tInfo.index)
      );

      if (tInfo.index !== lastStageIdxForBanner) {
        lastStageIdxForBanner = tInfo.index;
        if (tInfo.playing || tInfo.index >= 0) {
          bannerDismissed = false;
        }
      }
      if (stageBannerEl) {
        stageBannerEl.classList.toggle('hidden', bannerDismissed);
        if (bannerTitleEl) bannerTitleEl.textContent = tInfo.title || 'Ready — 7-Stage Pipeline';
        if (bannerSubEl) bannerSubEl.textContent = tInfo.subtitle || 'Press Play Story or use ← / → to step through thesis stages.';
        if (bannerEqEl) bannerEqEl.textContent = tInfo.equation || 'WL = H_mount - D · cos(θ) • Q = k · Vs · A(WL)';
      }
      if (holdBtn) {
        const holdOn = Boolean(tInfo.holdAtStageEnd);
        holdAtStageEnd = holdOn;
        holdBtn.textContent = holdOn ? 'Hold: ON' : 'Hold: OFF';
        holdBtn.classList.toggle('active', holdOn);
      }
    }

    if (!snapshot) return;

    // Sample live time-series buffer at ~4 Hz regardless of active tab
    const nowMs = performance.now();
    if (lastTsPhase && lastTsPhase !== snapshot.phase) {
      tsSeries.length = 0;
    }
    lastTsPhase = snapshot.phase;
    if (nowMs - lastTsSampleMs >= 250) {
      lastTsSampleMs = nowMs;
      const th = state.thresholds || getDefaultThresholds(snapshot.phase === 'phase2' ? 'river' : 'lab');
      tsSeries.push({
        wl: snapshot.waterLevel.calculatedM,
        vs: snapshot.velocity.estimatedVs,
        q: snapshot.discharge.estimatedQ,
        wlTh: Number(th.waterLevelM ?? (snapshot.phase === 'phase2' ? 2.5 : 0.345)),
        vsTh: Number(th.surfaceVelocityMs ?? (snapshot.phase === 'phase2' ? 2.4 : 0.28)),
        qTh: Number(th.dischargeM3s ?? (snapshot.phase === 'phase2' ? 28.0 : 0.00145)),
      });
      if (tsSeries.length > 90) tsSeries.shift();
    }

    const isRiver = snapshot.phase === 'phase2';

    // Update Telemetry KPI Cards & Charts only when visible
    if (drawerOpen && activeTab === 'telemetry') {
      setKpiText('wl', `${snapshot.waterLevel.calculatedM.toFixed(3)} m`);
      setKpiText(
        'wl-err',
        `AE: ${snapshot.waterLevel.absErrorCm.toFixed(2)} cm (Max ${Number(snapshot.waterLevel.maxAbsErrorCm ?? snapshot.waterLevel.absErrorCm).toFixed(1)} cm) | ${snapshot.waterLevel.tableXPass ? 'PASS' : 'FAIL'}`
      );

      setKpiText('vs', `${snapshot.velocity.estimatedVs.toFixed(2)} m/s`);
      setKpiText('vs-err', `rRMSE: ${snapshot.velocity.rRrmsePct.toFixed(1)}% (<=20%)`);

      const qVal = snapshot.discharge.estimatedQ;
      setKpiText('q', `${qVal < 0.05 ? qVal.toFixed(5) : qVal.toFixed(2)} m³/s`);
      setKpiText('q-sub', `A: ${snapshot.discharge.wettedAreaM2.toFixed(isRiver ? 2 : 4)} m² | k: ${snapshot.discharge.velocityCoeffK.toFixed(2)}`);

      setKpiText('ns', `${snapshot.debris.systemCountNs} / ${snapshot.debris.manualCountNr}`);
      setKpiText('f1', `F1:${snapshot.debris.f1Pct.toFixed(0)}% | HI: ${Number(snapshot.debris.hazardIndex ?? 0).toFixed(1)} (${snapshot.debris.alertLevel || 'NORMAL'})`);

      const mnt = snapshot.mounting;
      if (mnt) {
        const mBadge = domKpi.get('mount-badge');
        if (mBadge) {
          mBadge.textContent = mnt.mode === 'lab_pole'
            ? 'LAB-POLE'
            : mnt.mode === 'side_pole'
              ? 'SIDE-POLE'
              : mnt.mode === 'bridge'
                ? 'BRIDGE'
                : 'LAB GANTRY';
          mBadge.className = `badge mono ${mnt.hitDryBank ? 'badge-warn' : 'badge-ok'}`;
        }
        setKpiText('mount-loc', mnt.label);
        setKpiText('mount-h', `${mnt.heightM.toFixed(2)} m`);
        setKpiText(
          'lidar-ang',
          mnt.lidarIncidenceDeg > 0.1 ? `${mnt.lidarIncidenceDeg.toFixed(1)}° Slant` : '0.0° Nadir'
        );
        setKpiText('cam-ang', `${mnt.cameraIncidenceDeg.toFixed(1)}°`);
        setKpiText(
          'd-laser',
          mnt.lidarIncidenceDeg > 0.1
            ? `${mnt.rawLaserDistanceM.toFixed(2)}m → ${mnt.compensatedDistanceM.toFixed(2)}m`
            : `${mnt.rawLaserDistanceM.toFixed(3)} m`
        );
        setKpiText(
          'gcp-comp',
          (mnt.mode === 'side_pole' || mnt.mode === 'lab_pole')
            ? `H_gcp | ${mnt.slantCompEnabled ? 'cos(θ) ON' : 'RAW OFF'}`
            : mnt.gcpLayout
        );
      }

      const edge = snapshot.edgeStorage;
      const syncBadge = domKpi.get('sync-badge');
      if (syncBadge) {
        syncBadge.textContent = edge.uploadStatus;
        syncBadge.className = `badge mono ${edge.wifiOnline ? 'badge-ok' : 'badge-warn'}`;
      }
      setKpiText('rtc-time', snapshot.rtcLocalLabel);
      setKpiText('tsr', `${Number(edge.lidarTsrPct ?? edge.tsrPct).toFixed(1)}% / ${Number(edge.videoTsrPct ?? edge.tsrPct).toFixed(1)}%`);
      setKpiText('queue', String(edge.queuedCount));
      setKpiText('latency', `${edge.processingLatencyMs} ms`);
      setKpiText(
        'proc-mode',
        edge.architectureProfile === 'edge_lora'
          ? `${edge.ramUsedMb}MB (${edge.edgeStageLabel?.split(':')[0] || '5s'})`
          : edge.processingMode || 'Real-Time'
      );
      if (snapshot.alertsMeta) {
        setKpiText('alert-meta', `${snapshot.alertsMeta.deliveryRatePct.toFixed(0)}% / ${snapshot.alertsMeta.meanDelayMs}ms`);
      }
      setKpiText('sd-logs', String(edge.microSdRecords));
      setKpiText('ssd-mb', `${edge.ssdUsedMB.toFixed(1)} MB`);
      const lora = snapshot.loraPayload;
      if (lora) {
        setKpiText('lora-hex', lora.hex || lora.compactHex || '--');
        const rfSuffix = edge.architectureProfile === 'edge_lora'
          ? ` | ${edge.loraRssiDbm}dBm SNR+${edge.loraSnrDb}dB`
          : '';
        setKpiText(
          'lora-meta',
          `Node ${lora.nodeId ?? 1} | WL ${lora.waterMm}mm | Vs ${lora.velocityMms ?? lora.distanceMm}mm/s | Q ${lora.dischargeLs ?? 0}L/s | HI ${(Number(lora.hazardIndexX100 ?? 0) / 100).toFixed(1)} | CRC16 ${lora.crc16Hex || lora.crc8Hex}${rfSuffix}`
        );
      }

      const txItems = [
        { label: 'Water Level', rule: snapshot.waterLevel.tableXRule, pass: snapshot.waterLevel.tableXPass },
        { label: 'Surface Velocity', rule: snapshot.velocity.tableXRule, pass: snapshot.velocity.tableXPass },
        { label: 'Discharge', rule: snapshot.discharge.tableXRule, pass: snapshot.discharge.tableXPass },
        { label: 'YOLOv8 Exact Match', rule: snapshot.debris.tableXRule, pass: snapshot.debris.tableXPass },
        { label: 'Data Transmission TSR', rule: edge.tableXRule, pass: edge.tableXPass },
        {
          label: 'Email Alert Delivery',
          rule: `${snapshot.alertsMeta?.deliveryRatePct ?? 100}% @ ${snapshot.alertsMeta?.meanDelayMs ?? 0}ms`,
          pass: snapshot.alertsMeta?.tableXPass !== false,
        },
      ];
      const txSig = txItems.map((it) => `${it.rule}:${it.pass}`).join('|');
      if (tableXListEl && txSig !== lastTableXSig) {
        lastTableXSig = txSig;
        tableXListEl.innerHTML = txItems
          .map(
            (it) =>
              `<div style="display:flex;justify-content:space-between;align-items:center;"><span>${it.label} <span class="mono" style="color:#94a3b8;font-size:10px;">(${it.rule})</span></span><span class="badge ${it.pass ? 'badge-ok' : 'badge-alert'}">${it.pass ? 'PASS' : 'CHECK'}</span></div>`
          )
          .join('');
      }

      renderSensitivityChart(sensitivityData);
      renderTimeSeriesChart();
    }

    renderTables(trialLogs, snapshot);

    const allAlerts = trialLogs?.alerts || snapshot.alerts || [];
    renderAlertInbox(allAlerts);

    if (snapshot.newAlerts && snapshot.newAlerts.length) {
      for (const a of snapshot.newAlerts) {
        showEmailAlert(a);
      }
    }
  }

  syncControlWidgets();

  return {
    update,
    showEmailAlert,
    setHudVisible: (v) => {
      hudVisible = Boolean(v);
      quickHudBtn.classList.toggle('active', hudVisible);
    },
    setDrawerOpen,
    isDrawerOpen: () => drawerOpen,
    setPresentationMode,
    isPresentationMode: () => presentationMode,
    syncControlWidgets,
  };
}

export { createDashboardPanel };
