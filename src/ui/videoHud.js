/**
 * Video-Authentic Floating Telemetry HUD & Live Pi Camera NoIR PIP
 * Replicates the callout aesthetic from Follow_the_flow_of_water_247c7bda_1080p.mp4:
 * - Top-right TF-Luna LiDAR card (live D cm, WL = H - D, SNR%, Signal Strength Histogram, Distance Waveform)
 * - Live Camera NoIR: STREAMING PIP reading WebGLRenderTarget pixels with 850 nm Night IR filter,
 *   toggleable PyORC/LSPIV velocity vectors + GCP grid, and YOLOv8 bounding boxes
 * - Interactive 3D component inspection tooltip card for Exploded IP65 CAD view
 */

const HUD_STYLE_ID = 'river-sim-video-hud-styles';

function ensureHudStyles() {
  if (document.getElementById(HUD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HUD_STYLE_ID;
  style.textContent = `
    .vhud-root {
      position: absolute;
      inset: 0;
      pointer-events: none;
      font-family: var(--font-sans, system-ui, sans-serif);
    }
    .vhud-root.hidden {
      display: none;
    }
    .vhud-leader-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    .vhud-stack {
      position: absolute;
      top: 66px;
      right: 12px;
      width: 312px;
      max-width: calc(100vw - 24px);
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 2;
      pointer-events: none;
    }
    .vhud-card {
      position: relative;
      pointer-events: auto;
      background: rgba(9, 14, 24, 0.82);
      backdrop-filter: blur(14px) saturate(140%);
      -webkit-backdrop-filter: blur(14px) saturate(140%);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 11px;
      box-shadow: 0 12px 32px rgba(2, 6, 23, 0.58);
      padding: 10px 11px;
      color: #f1f5f9;
    }
    /* Precision reticle corner ticks echoing the reference video overlay */
    .vhud-reticle::before,
    .vhud-reticle::after {
      content: "";
      position: absolute;
      width: 9px;
      height: 9px;
      pointer-events: none;
      border-color: rgba(250, 204, 21, 0.72);
      border-style: solid;
    }
    .vhud-reticle::before {
      top: -1px;
      left: -1px;
      border-width: 2px 0 0 2px;
      border-top-left-radius: 6px;
    }
    .vhud-reticle::after {
      bottom: -1px;
      right: -1px;
      border-width: 0 2px 2px 0;
      border-bottom-right-radius: 6px;
    }
    .vhud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 6px;
    }
    .vhud-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
      font-weight: 600;
      font-size: 12.5px;
      letter-spacing: 0.01em;
    }
    .vhud-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22ff88;
      box-shadow: 0 0 8px #22ff88;
      flex-shrink: 0;
    }
    .vhud-dot.warn {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }
    .vhud-dot.err {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }
    .vhud-dot.noir {
      background: #a855f7;
      box-shadow: 0 0 8px #a855f7;
    }
    .vhud-subrow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 11px;
      color: #cbd5e1;
      margin-bottom: 7px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.14);
    }
    .vhud-chart-label {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 4px 0 3px;
    }
    .vhud-canvas-box {
      position: relative;
      width: 100%;
      background: rgba(5, 9, 17, 0.86);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 7px;
      overflow: hidden;
    }
    .vhud-canvas-box canvas {
      display: block;
      width: 100%;
      height: auto;
    }
    .vhud-pip-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background: #050911;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 8px;
      overflow: hidden;
    }
    .vhud-pip-wrap canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
    .vhud-pip-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .vhud-mini-btn {
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 5px;
      border: 1px solid rgba(148, 163, 184, 0.26);
      background: rgba(30, 41, 59, 0.72);
      color: #cbd5e1;
      cursor: pointer;
    }
    .vhud-mini-btn.active {
      border-color: #38bdf8;
      background: rgba(14, 116, 144, 0.55);
      color: #e0f2fe;
    }
    .vhud-pip-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-top: 6px;
      font-size: 10.5px;
      color: #cbd5e1;
    }
    .vhud-tooltip {
      position: absolute;
      left: 50%;
      bottom: var(--bottom-bar-clear, 82px);
      transform: translateX(-50%);
      width: min(380px, calc(100vw - 32px));
      pointer-events: auto;
      z-index: 4;
      background: rgba(10, 15, 28, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 12px;
      box-shadow: 0 16px 38px rgba(0, 0, 0, 0.65);
      padding: 11px 13px;
      color: #f8fafc;
    }
    .vhud-tooltip.hidden {
      display: none;
    }
    .vhud-tip-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      margin-top: 7px;
      font-size: 11px;
    }
    .vhud-tip-k {
      color: #94a3b8;
      font-weight: 600;
    }
    .vhud-tip-v {
      color: #e2e8f0;
      word-break: break-word;
    }
    @media (max-width: 960px) {
      .vhud-stack {
        width: 262px;
      }
    }
    @media (max-width: 720px) {
      .vhud-stack {
        top: 108px;
        width: 224px;
      }
    }
  `;
  document.head.appendChild(style);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function velocityColor(speedNorm) {
  // cyan (#22d3ee) -> yellow (#facc15) -> red (#ef4444)
  const t = clamp(speedNorm, 0, 1);
  if (t < 0.5) {
    const u = t * 2;
    const r = Math.round(34 + (250 - 34) * u);
    const g = Math.round(211 + (204 - 211) * u);
    const b = Math.round(238 + (21 - 238) * u);
    return `rgb(${r},${g},${b})`;
  }
  const u = (t - 0.5) * 2;
  const r = Math.round(250 + (239 - 250) * u);
  const g = Math.round(204 + (68 - 204) * u);
  const b = Math.round(21 + (68 - 21) * u);
  return `rgb(${r},${g},${b})`;
}

const YOLO_COLORS = {
  bottle: '#38bdf8',
  branch: '#f59e0b',
  foam: '#10b981',
  tracer: '#22d3ee',
  debris: '#a855f7',
  plastic_bag: '#ec4899',
  leaf: '#84cc16',
  glare_fp: '#ef4444',
  foam_fp: '#f97316',
};

function createVideoHud(containerEl) {
  ensureHudStyles();

  const root = document.createElement('div');
  root.className = 'vhud-root';
  root.innerHTML = `
    <svg class="vhud-leader-svg" aria-hidden="true">
      <line class="vhud-line-lidar" x1="0" y1="0" x2="0" y2="0" stroke="rgba(250,204,21,0.72)" stroke-width="1.15" stroke-dasharray="3 2" visibility="hidden" />
      <circle class="vhud-dot-lidar" cx="0" cy="0" r="4" fill="none" stroke="#22ff88" stroke-width="1.5" visibility="hidden" />
      <line class="vhud-line-cam" x1="0" y1="0" x2="0" y2="0" stroke="rgba(250,204,21,0.65)" stroke-width="1.1" stroke-dasharray="3 2" visibility="hidden" />
      <circle class="vhud-dot-cam" cx="0" cy="0" r="4" fill="none" stroke="#ff2e55" stroke-width="1.5" visibility="hidden" />
    </svg>

    <div class="vhud-stack">
      <!-- Top-Right TF-Luna LiDAR Floating Card (Video Replica) -->
      <section class="vhud-card vhud-reticle" data-hud-card="lidar">
        <div class="vhud-header">
          <div class="vhud-title-wrap">
            <span class="vhud-dot" data-el="lidar-dot"></span>
            <span class="mono" data-el="lidar-headline">TF-Luna LiDAR: 35.8 cm</span>
          </div>
          <span class="badge badge-ok mono" data-el="lidar-badge">LOCKED</span>
        </div>
        <div class="vhud-subrow mono">
          <span data-el="wl-readout">WL: 0.335 m</span>
          <span data-el="snr-readout">SNR: 78%</span>
          <span data-el="tablex-readout">TX: PASS</span>
        </div>
        <div class="vhud-subrow mono" data-el="mount-row" style="display:none;color:#7dd3fc;font-size:10px;border-top:1px solid rgba(148,163,184,0.12);padding-top:3px;">
          <span data-el="mount-readout">Bridge (4.50m) | θL: 0.0° | θC: 7.2°</span>
        </div>
        <div class="vhud-chart-label">
          <span>Waveform (Signal Strength)</span>
          <span class="mono" data-el="hist-peak">Peak: 78%</span>
        </div>
        <div class="vhud-canvas-box">
          <canvas width="288" height="58" data-el="hist-canvas"></canvas>
        </div>
        <div class="vhud-chart-label">
          <span>Oscilloscope (Distance)</span>
          <span class="mono" data-el="wave-bounds">34.5–37.0 cm</span>
        </div>
        <div class="vhud-canvas-box">
          <canvas width="288" height="62" data-el="wave-canvas"></canvas>
        </div>
      </section>

      <!-- Secondary Live Camera NoIR PIP Card -->
      <section class="vhud-card vhud-reticle" data-hud-card="noir">
        <div class="vhud-header">
          <div class="vhud-title-wrap">
            <span class="vhud-dot" data-el="cam-dot"></span>
            <span class="mono" data-el="cam-title">Camera NoIR: STREAMING</span>
          </div>
          <div class="vhud-pip-controls">
            <button type="button" class="vhud-mini-btn active" data-toggle="piv" title="Toggle PyORC/LSPIV Velocity Vectors">LSPIV</button>
            <button type="button" class="vhud-mini-btn active" data-toggle="yolo" title="Toggle YOLOv8 Bounding Boxes">YOLO</button>
            <button type="button" class="vhud-mini-btn" data-toggle="collapse" title="Collapse/Expand PIP Feed">_</button>
          </div>
        </div>
        <div class="vhud-pip-wrap" data-el="pip-wrap">
          <canvas width="320" height="240" data-el="pip-video-canvas"></canvas>
          <canvas width="320" height="240" data-el="pip-overlay-canvas"></canvas>
        </div>
        <div class="vhud-pip-footer mono">
          <span data-el="piv-summary">Vs: 0.24 m/s | Q: 0.0012 m³/s</span>
          <span data-el="yolo-summary">Ns: 0 | F1: 100%</span>
        </div>
      </section>
    </div>

    <!-- Interactive Exploded IP65 Component Tooltip -->
    <div class="vhud-tooltip hidden" data-el="tooltip">
      <div class="vhud-header" style="margin-bottom:4px;">
        <div class="vhud-title-wrap">
          <span class="badge badge-ok mono" data-el="tip-desig">U1</span>
          <span data-el="tip-title">Component</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge mono" data-el="tip-group">Edge</span>
          <button type="button" class="vhud-mini-btn" data-el="tip-close" title="Close Tooltip">×</button>
        </div>
      </div>
      <div style="font-size:11.5px;color:#7dd3fc;" data-el="tip-role"></div>
      <div class="vhud-tip-meta">
        <span class="vhud-tip-k">Pinout</span><span class="vhud-tip-v mono" data-el="tip-pinout"></span>
        <span class="vhud-tip-k">Power</span><span class="vhud-tip-v mono" data-el="tip-power"></span>
        <span class="vhud-tip-k">Specs</span><span class="vhud-tip-v" data-el="tip-specs"></span>
      </div>
    </div>
  `;

  if (containerEl) {
    containerEl.appendChild(root);
  }

  const q = (sel) => root.querySelector(sel);
  const lidarCard = q('[data-hud-card="lidar"]');
  const camCard = q('[data-hud-card="noir"]');
  const lidarDot = q('[data-el="lidar-dot"]');
  const lidarHeadline = q('[data-el="lidar-headline"]');
  const lidarBadge = q('[data-el="lidar-badge"]');
  const wlReadout = q('[data-el="wl-readout"]');
  const snrReadout = q('[data-el="snr-readout"]');
  const tableXReadout = q('[data-el="tablex-readout"]');
  const mountRow = q('[data-el="mount-row"]');
  const mountReadout = q('[data-el="mount-readout"]');
  const histPeak = q('[data-el="hist-peak"]');
  const waveBounds = q('[data-el="wave-bounds"]');
  const histCanvas = q('[data-el="hist-canvas"]');
  const waveCanvas = q('[data-el="wave-canvas"]');
  const histCtx = histCanvas.getContext('2d');
  const waveCtx = waveCanvas.getContext('2d');

  function syncHiDpiCanvas(canvasEl, ctx, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
      canvasEl.style.width = `${cssW}px`;
      canvasEl.style.height = `${cssH}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  syncHiDpiCanvas(histCanvas, histCtx, 288, 58);
  syncHiDpiCanvas(waveCanvas, waveCtx, 288, 62);

  const camDot = q('[data-el="cam-dot"]');
  const camTitle = q('[data-el="cam-title"]');
  const pipWrap = q('[data-el="pip-wrap"]');
  const pipVideoCanvas = q('[data-el="pip-video-canvas"]');
  const pipOverlayCanvas = q('[data-el="pip-overlay-canvas"]');
  const pipVideoCtx = pipVideoCanvas.getContext('2d');
  const pipOverlayCtx = pipOverlayCanvas.getContext('2d');
  const pivSummary = q('[data-el="piv-summary"]');
  const yoloSummary = q('[data-el="yolo-summary"]');

  const btnPiv = q('[data-toggle="piv"]');
  const btnYolo = q('[data-toggle="yolo"]');
  const btnCollapse = q('[data-toggle="collapse"]');

  const tooltipEl = q('[data-el="tooltip"]');
  const tipDesig = q('[data-el="tip-desig"]');
  const tipTitle = q('[data-el="tip-title"]');
  const tipGroup = q('[data-el="tip-group"]');
  const tipRole = q('[data-el="tip-role"]');
  const tipPinout = q('[data-el="tip-pinout"]');
  const tipPower = q('[data-el="tip-power"]');
  const tipSpecs = q('[data-el="tip-specs"]');
  const tipCloseBtn = q('[data-el="tip-close"]');

  const lineLidar = q('.vhud-line-lidar');
  const dotLidar = q('.vhud-dot-lidar');
  const lineCam = q('.vhud-line-cam');
  const dotCam = q('.vhud-dot-cam');

  let stateRef = null;
  let pipCollapsed = false;
  let lastPipRefreshMs = 0;
  let pixelBuf = null;
  let imgData = null;
  let bufW = 0;
  let bufH = 0;
  let pinnedComponent = null;
  let hoveredComponent = null;
  let waveGrad = null;
  let waveGradHeight = 0;
  let lastLidarSeqTick = -1;
  let lastOverlaySig = '';
  let lastTooltipKey = null;
  let projVecScratch = null;
  let lidarCardRect = { left: 0, top: 0, width: 0, height: 0 };
  let camCardRect = { left: 0, top: 0, width: 0, height: 0 };

  function measureCardRects() {
    const lr = lidarCard.getBoundingClientRect();
    lidarCardRect = { left: lr.left, top: lr.top, width: lr.width, height: lr.height };
    const cr = camCard.getBoundingClientRect();
    camCardRect = { left: cr.left, top: cr.top, width: cr.width, height: cr.height };
  }

  measureCardRects();
  window.addEventListener('resize', measureCardRects);
  if (typeof ResizeObserver === 'function') {
    const cardRo = new ResizeObserver(measureCardRects);
    cardRo.observe(lidarCard);
    cardRo.observe(camCard);
  }

  btnPiv.addEventListener('click', () => {
    if (!stateRef) return;
    stateRef.showPivVectors = stateRef.showPivVectors === false;
    btnPiv.classList.toggle('active', stateRef.showPivVectors !== false);
  });

  btnYolo.addEventListener('click', () => {
    if (!stateRef) return;
    stateRef.showYoloBoxes = stateRef.showYoloBoxes === false;
    btnYolo.classList.toggle('active', stateRef.showYoloBoxes !== false);
  });

  btnCollapse.addEventListener('click', () => {
    pipCollapsed = !pipCollapsed;
    pipWrap.style.display = pipCollapsed ? 'none' : '';
    btnCollapse.textContent = pipCollapsed ? '+' : '_';
    requestAnimationFrame(measureCardRects);
  });

  tipCloseBtn.addEventListener('click', () => {
    pinnedComponent = null;
    hoveredComponent = null;
    if (stateRef) {
      stateRef.selectedComponent = null;
      stateRef.hoveredComponent = null;
    }
    tooltipEl.classList.add('hidden');
  });

  function renderHistogram(bins = []) {
    syncHiDpiCanvas(histCanvas, histCtx, 288, 58);
    const w = 288;
    const h = 58;
    histCtx.clearRect(0, 0, w, h);

    // Grid
    histCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    histCtx.lineWidth = 1;
    for (let y = 14; y < h; y += 15) {
      histCtx.beginPath();
      histCtx.moveTo(0, y);
      histCtx.lineTo(w, y);
      histCtx.stroke();
    }

    const n = bins.length || 24;
    const barGap = 2;
    const barW = Math.max(2, (w - 12 - barGap * (n - 1)) / n);
    let maxVal = 0.01;
    for (let i = 0; i < n; i++) {
      if ((bins[i] || 0) > maxVal) maxVal = bins[i];
    }

    for (let i = 0; i < n; i++) {
      const val = clamp(bins[i] ?? 0.08, 0.02, 1.0);
      const barH = Math.max(3, val * (h - 10));
      const x = 6 + i * (barW + barGap);
      const y = h - 4 - barH;
      const isPeak = val >= maxVal * 0.85;
      histCtx.fillStyle = isPeak ? '#22ff88' : val > 0.45 ? '#38bdf8' : 'rgba(148, 163, 184, 0.55)';
      histCtx.fillRect(x, y, barW, barH);
    }
  }

  function renderDistanceWaveform(waveformCm = []) {
    syncHiDpiCanvas(waveCanvas, waveCtx, 288, 62);
    const w = 288;
    const h = 62;
    waveCtx.clearRect(0, 0, w, h);

    waveCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    waveCtx.lineWidth = 1;
    for (let y = 15; y < h; y += 16) {
      waveCtx.beginPath();
      waveCtx.moveTo(0, y);
      waveCtx.lineTo(w, y);
      waveCtx.stroke();
    }

    if (!waveformCm.length) return;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const val of waveformCm) {
      if (val < minV) minV = val;
      if (val > maxV) maxV = val;
    }
    const mid = 0.5 * (minV + maxV);
    const halfSpan = Math.max(1.2, (maxV - minV) * 0.7);
    const lo = mid - halfSpan;
    const hi = mid + halfSpan;
    waveBounds.textContent = `${lo.toFixed(1)}–${hi.toFixed(1)} cm`;

    waveCtx.beginPath();
    const count = waveformCm.length;
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? w * 0.5 : (i / (count - 1)) * (w - 10) + 5;
      const norm = clamp((waveformCm[i] - lo) / (hi - lo), 0, 1);
      const y = h - 6 - norm * (h - 14);
      if (i === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.strokeStyle = '#38bdf8';
    waveCtx.lineWidth = 1.8;
    waveCtx.stroke();

    // Soft area fill below trace (cached gradient)
    waveCtx.lineTo(w - 5, h - 4);
    waveCtx.lineTo(5, h - 4);
    waveCtx.closePath();
    if (!waveGrad || waveGradHeight !== h) {
      waveGrad = waveCtx.createLinearGradient(0, 0, 0, h);
      waveGrad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      waveGrad.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
      waveGradHeight = h;
    }
    waveCtx.fillStyle = waveGrad;
    waveCtx.fill();
  }

  function copyPipRenderTarget(sensorOptics, renderer, scene, nightMode) {
    const rt = sensorOptics?.pipRenderTarget;
    if (!rt || !renderer) {
      pipVideoCtx.fillStyle = '#07111e';
      pipVideoCtx.fillRect(0, 0, pipVideoCanvas.width, pipVideoCanvas.height);
      pipVideoCtx.fillStyle = '#64748b';
      pipVideoCtx.font = '12px monospace';
      pipVideoCtx.textAlign = 'center';
      pipVideoCtx.fillText('Camera NoIR Standby', 160, 120);
      return true;
    }

    const nowMs = performance.now();
    if (nowMs - lastPipRefreshMs < 66) return false; // ~15 Hz PIP capture matching edge camera
    lastPipRefreshMs = nowMs;

    if (scene && typeof sensorOptics.renderPip === 'function') {
      sensorOptics.renderPip(scene);
    }

    const w = rt.width;
    const h = rt.height;
    if (w !== bufW || h !== bufH) {
      bufW = w;
      bufH = h;
      pixelBuf = new Uint8Array(w * h * 4);
      imgData = pipVideoCtx.createImageData(w, h);
      if (pipVideoCanvas.width !== w || pipVideoCanvas.height !== h) {
        pipVideoCanvas.width = w;
        pipVideoCanvas.height = h;
        pipOverlayCanvas.width = w;
        pipOverlayCanvas.height = h;
      }
    }

    renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixelBuf);

    const dst = imgData.data;
    const rowStride = w * 4;
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * rowStride;
      const dstRow = y * rowStride;
      for (let x = 0; x < w; x++) {
        const sIdx = srcRow + x * 4;
        const dIdx = dstRow + x * 4;
        let r = pixelBuf[sIdx];
        let g = pixelBuf[sIdx + 1];
        let b = pixelBuf[sIdx + 2];

        if (nightMode) {
          // 850 nm Night IR monochrome + subtle NoIR violet response
          const lum = clamp((0.299 * r + 0.587 * g + 0.114 * b - 12) * 1.42 + 18, 0, 255);
          r = clamp(Math.round(lum * 0.90), 0, 255);
          g = clamp(Math.round(lum * 0.72), 0, 255);
          b = clamp(Math.round(lum * 1.08 + 14), 0, 255);
        }

        dst[dIdx] = r;
        dst[dIdx + 1] = g;
        dst[dIdx + 2] = b;
        dst[dIdx + 3] = 255;
      }
    }

    pipVideoCtx.putImageData(imgData, 0, 0);

    // Subtle NoIR night timestamp watermark
    if (nightMode) {
      pipVideoCtx.fillStyle = 'rgba(168, 85, 247, 0.08)';
      pipVideoCtx.fillRect(0, 0, w, h);
    }
    return true;
  }

  function approxRiverBedY(z, hydraulicsRef = null) {
    if (typeof hydraulicsRef?.getBedY === 'function') {
      const val = hydraulicsRef.getBedY(z);
      if (Number.isFinite(val)) return val;
    }
    const az = Math.abs(z);
    if (az >= 6.0) return 3.20;
    const shifted = z - 0.25;
    const innerBowl = 0.92 * Math.pow(clamp(Math.abs(shifted) / 5.45, 0, 1.05), 1.95);
    const cobbleBar =
      z < -1.5 && z > -5.1 ? 0.11 * Math.exp(-Math.pow((z + 3.4) / 1.1, 2)) : 0;
    const wallT = clamp((az - 5.42) / (6.0 - 5.42), 0, 1);
    const wallSmooth = wallT * wallT * (3 - 2 * wallT);
    const floor = innerBowl + cobbleBar;
    return clamp(floor + (3.20 - floor) * wallSmooth, 0.0, 3.20);
  }

  function drawPipOverlays(state, snapshot, sensorOptics) {
    const w = pipOverlayCanvas.width;
    const h = pipOverlayCanvas.height;
    pipOverlayCtx.clearRect(0, 0, w, h);

    if (!sensorOptics || typeof sensorOptics.projectWorldToPip !== 'function') return;

    const isRiver = state?.mode === 'river';
    const isLabPole = isRiver && state?.riverMountMode === 'lab_pole';
    const isSidePole = isRiver && state?.riverMountMode === 'side_pole';
    const isAnySidePole = isLabPole || isSidePole;
    const hyd = state?._hydraulics || null;
    const hydMetrics = typeof hyd?.getMetrics === 'function' ? hyd.getMetrics() : null;
    const waterY = snapshot?.waterLevel?.referenceM ?? hydMetrics?.waterLevelM ?? (isRiver ? 1.15 : 0.335);
    const vs = snapshot?.velocity?.estimatedVs ?? (isRiver ? 1.2 : 0.09);

    // 1. Optional GCP ortho-rectification grid lines (Bridge 3D coords vs Side-Pole Trapezoidal H_gcp)
    if (state?.showGcpGrid !== false && isRiver) {
      pipOverlayCtx.strokeStyle = isAnySidePole ? 'rgba(56, 189, 248, 0.45)' : 'rgba(250, 204, 21, 0.36)';
      pipOverlayCtx.lineWidth = 1;
      const gcpCorners = Array.isArray(state?._gcpCorners) && state._gcpCorners.length === 4 ? state._gcpCorners : null;
      if (isAnySidePole || gcpCorners) {
        const c1 = gcpCorners
          ? gcpCorners[0]
          : isLabPole ? { x: 0.20, z: -3.55, id: 'GCP-1' } : { x: -0.30, z: -4.6, id: 'GCP-1' };
        const c2 = gcpCorners
          ? gcpCorners[1]
          : isLabPole ? { x: 4.10, z: -3.55, id: 'GCP-2' } : { x: 4.50, z: -4.6, id: 'GCP-2' };
        const c3 = gcpCorners
          ? gcpCorners[2]
          : isLabPole ? { x: -1.60, z: 4.80, id: 'GCP-3' } : { x: -1.90, z: 4.6, id: 'GCP-3' };
        const c4 = gcpCorners
          ? gcpCorners[3]
          : isLabPole ? { x: 5.90, z: 4.80, id: 'GCP-4' } : { x: 6.10, z: 4.6, id: 'GCP-4' };
        const interp = (u, v) => ({
          x: (1 - v) * ((1 - u) * c1.x + u * c2.x) + v * ((1 - u) * c3.x + u * c4.x),
          z: (1 - v) * ((1 - u) * c1.z + u * c2.z) + v * ((1 - u) * c3.z + u * c4.z),
        });
        for (let i = 0; i <= 4; i++) {
          const u = i / 4;
          pipOverlayCtx.beginPath();
          for (let j = 0; j <= 6; j++) {
            const ptW = interp(u, j / 6);
            const p = sensorOptics.projectWorldToPip({ x: ptW.x, y: waterY + 0.02, z: ptW.z });
            if (j === 0) pipOverlayCtx.moveTo(p.x, p.y);
            else pipOverlayCtx.lineTo(p.x, p.y);
          }
          pipOverlayCtx.stroke();
        }
        for (let j = 0; j <= 6; j++) {
          const v = j / 6;
          pipOverlayCtx.beginPath();
          for (let i = 0; i <= 4; i++) {
            const ptW = interp(i / 4, v);
            const p = sensorOptics.projectWorldToPip({ x: ptW.x, y: waterY + 0.02, z: ptW.z });
            if (i === 0) pipOverlayCtx.moveTo(p.x, p.y);
            else pipOverlayCtx.lineTo(p.x, p.y);
          }
          pipOverlayCtx.stroke();
        }
        // Highlight GCP-1..4 corner markers inside PIP
        pipOverlayCtx.font = 'bold 8.5px monospace';
        for (const corner of [c1, c2, c3, c4]) {
          const wy = Math.max(waterY + 0.04, approxRiverBedY(corner.z, hyd) + 0.14);
          const p = sensorOptics.projectWorldToPip({ x: corner.x, y: wy, z: corner.z });
          if (p.visible) {
            pipOverlayCtx.fillStyle = '#fb923c';
            pipOverlayCtx.beginPath();
            pipOverlayCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            pipOverlayCtx.fill();
            pipOverlayCtx.fillText(corner.id, clamp(p.x + 4, 4, w - 34), clamp(p.y - 3, 12, h - 4));
          }
        }
      } else {
        const xs = [-2.2, -0.75, 0.7, 2.15, 3.6];
        const zs = [-4.8, -2.4, 0.0, 2.4, 4.8];
        for (const gx of xs) {
          pipOverlayCtx.beginPath();
          let started = false;
          for (const gz of zs) {
            const p = sensorOptics.projectWorldToPip({ x: gx, y: waterY + 0.02, z: gz });
            if (!started) {
              pipOverlayCtx.moveTo(p.x, p.y);
              started = true;
            } else {
              pipOverlayCtx.lineTo(p.x, p.y);
            }
          }
          pipOverlayCtx.stroke();
        }
        for (const gz of zs) {
          pipOverlayCtx.beginPath();
          let started = false;
          for (const gx of xs) {
            const p = sensorOptics.projectWorldToPip({ x: gx, y: waterY + 0.02, z: gz });
            if (!started) {
              pipOverlayCtx.moveTo(p.x, p.y);
              started = true;
            } else {
              pipOverlayCtx.lineTo(p.x, p.y);
            }
          }
          pipOverlayCtx.stroke();
        }
      }
    }

    // 2. Toggleable PyORC / LSPIV velocity vector arrows (cyan -> yellow -> red)
    if (state?.showPivVectors !== false && vs > 0.01) {
      const gxList = isLabPole
        ? [0.2, 1.15, 2.1, 3.05, 4.0]
        : isSidePole
          ? [0.1, 1.1, 2.1, 3.1, 4.1]
          : isRiver
            ? [-0.6, 0.2, 1.0, 1.8, 2.6]
            : [-0.20, -0.10, 0.0, 0.10, 0.20];
      const gzList = isLabPole
        ? [-3.0, -1.7, -0.4, 0.9, 2.2, 3.6]
        : isSidePole
          ? [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0]
          : isRiver
            ? [-4.2, -2.4, -1.2, 0.0, 1.2, 2.4]
            : [-0.10, -0.03, 0.04, 0.11];
      const vecDt = isRiver ? 0.42 : 0.48;
      const maxSpeedRef = isRiver ? Math.max(1.8, vs * 1.35) : Math.max(0.14, vs * 1.45);
      const yW1Live = hydMetrics?.y_w1 ?? waterY;
      const yW2Live = hydMetrics?.y_w2 ?? 0.270;
      const yW3Live = hydMetrics?.y_w3 ?? 0.205;
      const velScale = isRiver && hydMetrics?.trueSurfaceVelocity > 1e-4 ? vs / hydMetrics.trueSurfaceVelocity : 1.0;

      for (const gx of gxList) {
        for (const gz of gzList) {
          if (isRiver && approxRiverBedY(gz, hyd) >= waterY - 0.06) continue;
          let localSpeed;
          if (isRiver && typeof hyd?.getVelocityAtZ === 'function') {
            localSpeed = hyd.getVelocityAtZ(gz, gx) * velScale;
          } else {
            const zNorm = isRiver ? Math.abs(gz) / (isAnySidePole ? 4.2 : 3.2) : Math.abs(gz) / 0.18;
            const profileFactor = clamp(1.12 - 0.35 * zNorm * zNorm, 0.35, 1.15);
            localSpeed = vs * profileFactor;
          }
          if (localSpeed < 0.01) continue;
          const localY = !isRiver
            ? gx > 0.11
              ? yW3Live
              : gx > -0.08
                ? yW2Live
                : yW1Live
            : waterY;

          const p0 = sensorOptics.projectWorldToPip({ x: gx, y: localY + 0.005, z: gz });
          const p1 = sensorOptics.projectWorldToPip({
            x: gx + localSpeed * vecDt,
            y: localY + 0.005,
            z: gz,
          });
          if (!p0.visible && !p1.visible) continue;

          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const len = Math.hypot(dx, dy);
          if (len < 3) continue;

          const color = velocityColor(localSpeed / maxSpeedRef);
          pipOverlayCtx.strokeStyle = color;
          pipOverlayCtx.fillStyle = color;
          pipOverlayCtx.lineWidth = 1.6;

          pipOverlayCtx.beginPath();
          pipOverlayCtx.moveTo(p0.x, p0.y);
          pipOverlayCtx.lineTo(p1.x, p1.y);
          pipOverlayCtx.stroke();

          // Arrowhead
          const ang = Math.atan2(dy, dx);
          const headLen = 5;
          pipOverlayCtx.beginPath();
          pipOverlayCtx.moveTo(p1.x, p1.y);
          pipOverlayCtx.lineTo(
            p1.x - headLen * Math.cos(ang - 0.48),
            p1.y - headLen * Math.sin(ang - 0.48)
          );
          pipOverlayCtx.lineTo(
            p1.x - headLen * Math.cos(ang + 0.48),
            p1.y - headLen * Math.sin(ang + 0.48)
          );
          pipOverlayCtx.closePath();
          pipOverlayCtx.fill();
        }
      }
    }

    // 3. Toggleable YOLOv8 bounding boxes
    if (state?.showYoloBoxes !== false && snapshot?.debris?.detections) {
      pipOverlayCtx.font = 'bold 9.5px monospace';
      for (const det of snapshot.debris.detections) {
        const center = sensorOptics.projectWorldToPip({ x: det.x, y: det.y, z: det.z });
        if (!center.visible) continue;

        const halfSpan = isRiver ? Math.max(0.16, (det.size || 0.25) * 0.75) : Math.max(0.012, (det.size || 0.01) * 1.4);
        const edge = sensorOptics.projectWorldToPip({
          x: det.x + halfSpan,
          y: det.y,
          z: det.z + halfSpan,
        });
        const estW = Math.abs(edge.x - center.x) * 2.1;
        const estH = Math.abs(edge.y - center.y) * 2.1;
        const boxW = clamp(estW || 24, 18, 68);
        const boxH = clamp(estH || 20, 16, 56);

        const bx = clamp(center.x - boxW * 0.5, 2, w - boxW - 2);
        const by = clamp(center.y - boxH * 0.5, 13, h - boxH - 2);
        const color = YOLO_COLORS[det.className] || '#38bdf8';
        const label = `${det.className} ${det.confidence.toFixed(2)}`;

        pipOverlayCtx.save();
        if (det.isFP) {
          pipOverlayCtx.setLineDash([3, 2]);
        }
        pipOverlayCtx.strokeStyle = color;
        pipOverlayCtx.lineWidth = 1.6;
        pipOverlayCtx.strokeRect(bx, by, boxW, boxH);

        const textW = pipOverlayCtx.measureText(label).width + 6;
        const labelX = clamp(bx, 2, w - textW - 2);
        const labelY = Math.max(12, by);
        pipOverlayCtx.fillStyle = color;
        pipOverlayCtx.fillRect(labelX, labelY - 11, textW, 11);
        pipOverlayCtx.fillStyle = '#040812';
        pipOverlayCtx.fillText(label, labelX + 3, labelY - 2.5);
        pipOverlayCtx.restore();
      }
    }

    // Corner REC / mode pill inside PIP
    const pipTag = isLabPole
      ? state?.nightMode
        ? '850nm IR • LAB-POLE H_gcp'
        : `NoIR • LAB-POLE ${snapshot?.mounting?.cameraIncidenceDeg ?? 42}°`
      : isSidePole
        ? state?.nightMode
          ? '850nm IR • SIDE-POLE H_gcp'
          : `NoIR • SIDE-POLE ${snapshot?.mounting?.cameraIncidenceDeg ?? 41}°`
        : isRiver
          ? state?.nightMode
            ? '850nm IR • BRIDGE'
            : 'NoIR • BRIDGE NADIR'
          : state?.nightMode
            ? '850nm IR ACTIVE'
            : 'NoIR RGB LIVE';
    pipOverlayCtx.font = 'bold 9.5px monospace';
    const tagW = pipOverlayCtx.measureText(pipTag).width + 12;
    pipOverlayCtx.fillStyle = 'rgba(6, 10, 18, 0.72)';
    pipOverlayCtx.fillRect(6, 6, tagW, 16);
    pipOverlayCtx.fillStyle = state?.nightMode ? '#d8b4fe' : '#6ee7b7';
    pipOverlayCtx.fillText(pipTag, 11, 17);
  }

  function updateLeaderLines(state, snapshot, scene, sensorOptics) {
    const cam = state?.mainCamera || state?._mainCamera || scene?.userData?.mainCamera;
    if (!cam || typeof cam.updateMatrixWorld !== 'function' || root.classList.contains('hidden')) {
      lineLidar.setAttribute('visibility', 'hidden');
      dotLidar.setAttribute('visibility', 'hidden');
      lineCam.setAttribute('visibility', 'hidden');
      dotCam.setAttribute('visibility', 'hidden');
      return;
    }

    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    const isRiver = state?.mode === 'river';
    const waterY = snapshot?.waterLevel?.referenceM ?? (isRiver ? 1.15 : 0.335);
    const liveReading = typeof sensorOptics?.getLidarReading === 'function' ? sensorOptics.getLidarReading() : null;

    const projectToScreen = (wx, wy, wz) => {
      if (!projVecScratch) projVecScratch = cam.position.clone();
      const v = projVecScratch.set(wx, wy, wz).project(cam);
      const visible = v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
      return {
        x: (v.x * 0.5 + 0.5) * vw,
        y: (-v.y * 0.5 + 0.5) * vh,
        visible,
      };
    };

    const lidarRect = lidarCardRect;
    const camRect = camCardRect;

    if (state?.showOptics !== false && state?.showLidarBeam !== false) {
      const imp = liveReading?.impactPoint;
      const lx = imp?.x ?? (isRiver ? 0.8 : -0.17);
      const ly = imp?.y ?? waterY;
      const lz = imp?.z ?? 0.0;
      const pt = projectToScreen(lx, ly, lz);
      if (pt.visible && lidarRect.width > 0) {
        lineLidar.setAttribute('x1', (lidarRect.left + 4).toFixed(1));
        lineLidar.setAttribute('y1', (lidarRect.top + 18).toFixed(1));
        lineLidar.setAttribute('x2', pt.x.toFixed(1));
        lineLidar.setAttribute('y2', pt.y.toFixed(1));
        dotLidar.setAttribute('cx', pt.x.toFixed(1));
        dotLidar.setAttribute('cy', pt.y.toFixed(1));
        lineLidar.setAttribute('visibility', 'visible');
        dotLidar.setAttribute('visibility', 'visible');
      } else {
        lineLidar.setAttribute('visibility', 'hidden');
        dotLidar.setAttribute('visibility', 'hidden');
      }
    } else {
      lineLidar.setAttribute('visibility', 'hidden');
      dotLidar.setAttribute('visibility', 'hidden');
    }

    if (state?.showOptics !== false && state?.showCameraFov !== false) {
      const fovC = liveReading?.fovCenterPoint;
      const cx = fovC?.x ?? (isRiver ? 0.72 : 0.02);
      const cy = fovC?.y ?? waterY;
      const cz = fovC?.z ?? 0.0;
      const pt = projectToScreen(cx, cy, cz);
      if (pt.visible && camRect.width > 0) {
        lineCam.setAttribute('x1', (camRect.left + 4).toFixed(1));
        lineCam.setAttribute('y1', (camRect.top + 18).toFixed(1));
        lineCam.setAttribute('x2', pt.x.toFixed(1));
        lineCam.setAttribute('y2', pt.y.toFixed(1));
        dotCam.setAttribute('cx', pt.x.toFixed(1));
        dotCam.setAttribute('cy', pt.y.toFixed(1));
        lineCam.setAttribute('visibility', 'visible');
        dotCam.setAttribute('visibility', 'visible');
      } else {
        lineCam.setAttribute('visibility', 'hidden');
        dotCam.setAttribute('visibility', 'hidden');
      }
    } else {
      lineCam.setAttribute('visibility', 'hidden');
      dotCam.setAttribute('visibility', 'hidden');
    }
  }

  function renderTooltip(info) {
    const key = info ? (info.id || info.designator || info.title || 'HW') : '';
    if (key === lastTooltipKey) return;
    lastTooltipKey = key;
    if (!info) {
      tooltipEl.classList.add('hidden');
      return;
    }
    tooltipEl.classList.remove('hidden');
    tipDesig.textContent = info.designator || info.id || 'HW';
    tipTitle.textContent = info.title || 'Hardware Component';
    tipGroup.textContent = info.group || 'Prototype';
    tipRole.textContent = info.role || '';
    tipPinout.textContent = info.pinout || '—';
    tipPower.textContent = info.power || '—';
    tipSpecs.textContent = info.specs || '';
  }

  function setHoveredComponent(info) {
    hoveredComponent = info || null;
    renderTooltip(pinnedComponent || hoveredComponent);
  }

  function setSelectedComponent(info) {
    pinnedComponent = info || null;
    renderTooltip(pinnedComponent || hoveredComponent);
  }

  function update(state, snapshot, sensorOptics, renderer, scene, _particles) {
    stateRef = state;
    if (!snapshot) return;

    // Sync button active states with external state changes
    btnPiv.classList.toggle('active', state?.showPivVectors !== false);
    btnYolo.classList.toggle('active', state?.showYoloBoxes !== false);

    // 1. TF-Luna LiDAR Card
    const lidar = snapshot.lidar;
    const wl = snapshot.waterLevel;
    const distCm = lidar.distanceCm ?? 35.8;
    const distLabel =
      distCm >= 100
        ? `TF-Luna LiDAR: ${(distCm / 100).toFixed(2)} m (${distCm.toFixed(1)} cm)`
        : `TF-Luna LiDAR: ${distCm.toFixed(1)} cm`;
    lidarHeadline.textContent = distLabel;

    lidarBadge.textContent = lidar.statusLabel || 'LOCKED';
    lidarDot.className = 'vhud-dot';
    lidarBadge.className = 'badge mono';
    if (lidar.statusLabel === 'LOCKED') {
      lidarBadge.classList.add('badge-ok');
    } else if (lidar.statusLabel === 'LOW SNR') {
      lidarDot.classList.add('warn');
      lidarBadge.classList.add('badge-warn');
    } else {
      lidarDot.classList.add('err');
      lidarBadge.classList.add('badge-alert');
    }

    wlReadout.textContent = `WL: ${wl.calculatedM.toFixed(3)} m`;
    snrReadout.textContent = `SNR: ${lidar.signalStrengthPct}%`;
    tableXReadout.textContent = `TX: ${wl.tableXPass ? 'PASS' : 'FAIL'}`;
    tableXReadout.style.color = wl.tableXPass ? '#6ee7b7' : '#fca5a5';

    const mnt = snapshot.mounting;
    if (state?.mode === 'river' && mnt) {
      mountRow.style.display = '';
      const compTag = mnt.lidarIncidenceDeg > 0.2 ? (mnt.slantCompEnabled ? ' cosθ' : ' RAW') : '';
      const shortName = mnt.mode === 'lab_pole' ? 'Lab-Pole' : mnt.mode === 'side_pole' ? 'Side-Pole' : 'Bridge';
      mountReadout.textContent = `${shortName} (${mnt.heightM.toFixed(2)}m) • θL:${mnt.lidarIncidenceDeg.toFixed(0)}°${compTag} θC:${mnt.cameraIncidenceDeg.toFixed(0)}°`;
    } else {
      mountRow.style.display = 'none';
    }

    histPeak.textContent = `Peak: ${lidar.signalStrengthPct}%`;

    const seqTick = lidar.seqTick;
    if (seqTick === undefined || seqTick !== lastLidarSeqTick) {
      if (seqTick !== undefined) lastLidarSeqTick = seqTick;
      renderHistogram(lidar.histogramBins || []);
      renderDistanceWaveform(lidar.waveformCm || []);
    }

    // 2. Camera NoIR PIP Card
    const isNight = Boolean(state?.nightMode);
    camTitle.textContent = isNight ? 'Camera NoIR: 850nm IR' : 'Camera NoIR: STREAMING';
    camDot.className = isNight ? 'vhud-dot noir' : 'vhud-dot';

    if (!pipCollapsed) {
      const pipUpdated = copyPipRenderTarget(sensorOptics, renderer, scene, isNight);
      const overlaySig = `${state?.showGcpGrid !== false ? 1 : 0}:${state?.showPivVectors !== false ? 1 : 0}:${state?.showYoloBoxes !== false ? 1 : 0}:${isNight ? 1 : 0}:${state?.mode || 'lab'}:${state?.riverMountMode || 'bridge'}`;
      if (pipUpdated || overlaySig !== lastOverlaySig) {
        lastOverlaySig = overlaySig;
        drawPipOverlays(state, snapshot, sensorOptics);
      }
    }

    const vs = snapshot.velocity.estimatedVs;
    const q = snapshot.discharge.estimatedQ;
    const qStr = q < 0.05 ? q.toFixed(4) : q.toFixed(2);
    pivSummary.textContent = `Vs: ${vs.toFixed(2)} m/s | Q: ${qStr} m³/s`;
    const hiTag = snapshot.edgeStorage?.architectureProfile === 'edge_lora'
      ? ` | HI:${Number(snapshot.debris.hazardIndex ?? 0).toFixed(0)}`
      : '';
    yoloSummary.textContent = `Ns: ${snapshot.debris.systemCountNs}/${snapshot.debris.manualCountNr} | F1: ${snapshot.debris.f1Pct.toFixed(0)}%${hiTag}`;

    // 3. Leader lines & interactive component tooltip
    updateLeaderLines(state, snapshot, scene, sensorOptics);
    const externalComp = state?.selectedComponent || state?.hoveredComponent;
    if (externalComp !== undefined) {
      renderTooltip(externalComp || pinnedComponent || hoveredComponent);
    }
  }

  function setVisible(visible) {
    root.classList.toggle('hidden', !visible);
  }

  return {
    update,
    setVisible,
    setHoveredComponent,
    setSelectedComponent,
  };
}

export { createVideoHud };
