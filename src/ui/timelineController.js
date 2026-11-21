/**
 * 7-Stage Start-to-End Storytelling Timeline Controller (~75s continuous workflow)
 * Orchestrates Phase 1 Controlled Lab Testing -> Phase 2 Guimbal River Field Twin.
 */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const TIMELINE_STAGES = [
  {
    index: 0,
    startSec: 0,
    endSec: 10,
    shortLabel: '0. Power & RTC',
    title: 'Hardware Power-Up & DS3231 RTC Init',
    subtitle: 'Exploded IP65 CAD: 11.1V 3S2P Li-ion -> 5A Fuse -> 5.1V/12V Buck -> Pi 3B & DS3231',
    equation: '12V Bus -> 5.1V (Pi/LiDAR) + 12.0V (IR) • DS3231 ±2 ppm',
    cameraPreset: 'exploded_cad',
  },
  {
    index: 1,
    startSec: 10,
    endSec: 22,
    shortLabel: '1. Pump & Weir',
    title: 'Pump Startup & Stepped Weir Cascade',
    subtitle: 'Submersible pump primes blue PVC riser -> red valve opens -> Steps 1->2->3->Basin',
    equation: 'Q_weir = Cd · (2/3) · b · √(2g) · H^(3/2)',
    cameraPreset: 'video_replica',
  },
  {
    index: 2,
    startSec: 22,
    endSec: 33,
    shortLabel: '2. LiDAR Range',
    title: 'TF-Luna LiDAR Ranging (WL = H - D)',
    subtitle: 'False-color 850nm NIR ToF locks onto Step 1 at 35.8 cm with live histogram & waveform',
    equation: 'WL = H_mount - D_laser · cos(θ)',
    cameraPreset: 'video_replica',
  },
  {
    index: 3,
    startSec: 33,
    endSec: 44,
    shortLabel: '3. NoIR + 850nm IR',
    title: 'NoIR Camera + 850 nm IR & Debris Injection',
    subtitle: 'Crimson FOV frustum & foam tracers cascade across Day -> Night 850 nm IR sweep',
    equation: 'F1 = 2·P·R/(P+R) • 850nm NIR Night Illumination',
    cameraPreset: 'video_replica',
  },
  {
    index: 4,
    startSec: 44,
    endSec: 53,
    shortLabel: '4. Buffer & Sync',
    title: 'Local SQLite/SSD Buffering & Wi-Fi Upload',
    subtitle: 'Simulated Wi-Fi outage queues RTC-stamped records, then reconnects & recovers TSR%',
    equation: 'TSR% = (N_rec / N_exp) × 100 >= 90%',
    cameraPreset: 'exploded_cad',
  },
  {
    index: 5,
    startSec: 53,
    endSec: 63,
    shortLabel: '5. Analytics & Alert',
    title: 'PyORC/LSPIV + YOLOv8 & Threshold Email Alert',
    subtitle: 'High-flow valve surge breaches Q & debris thresholds -> automated Email Alert toast',
    equation: 'Q = k · Vs · A(WL) • Email Breach <= 5 s',
    cameraPreset: 'video_replica',
  },
  {
    index: 6,
    startSec: 63,
    endSec: 75,
    shortLabel: '6. Guimbal River',
    title: 'Phase 2 Real River Twin (Guimbal River, Iloilo)',
    subtitle: 'Bridge-mounted station over surveyed bathymetry A(WL), Monsoon Hydrograph & GCP grid',
    equation: 'K = Σ(1/n_i)·A_i·R_hi^(2/3) • Q = K·√S₀',
    cameraPreset: 'river_cross_section',
  },
];

const TOTAL_TIMELINE_DURATION_S = 75.0;

function createTimelineController(state, callbacks = {}) {
  let currentTime = 0;
  let playing = false;
  let holdAtStageEnd = false;
  let lastStageIndex = -1;
  let lastAppliedPreset = null;
  let lastSubPhaseCam = null;

  function findStageByTime(tSec) {
    const clampedT = clamp(tSec, 0, TOTAL_TIMELINE_DURATION_S);
    for (let i = TIMELINE_STAGES.length - 1; i >= 0; i--) {
      if (clampedT >= TIMELINE_STAGES[i].startSec) {
        return TIMELINE_STAGES[i];
      }
    }
    return TIMELINE_STAGES[0];
  }

  function applyStateAtTime(tSec, forcePreset = false) {
    const stage = findStageByTime(tSec);
    const localT = tSec - stage.startSec;
    const stageDur = Math.max(1e-4, stage.endSec - stage.startSec);
    const stageFrac = clamp(localT / stageDur, 0, 1);

    let desiredPreset = stage.cameraPreset;

    if (stage.index === 0) {
      // Stage 0: Hardware Power-Up & RTC Init
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = localT >= 0.8;
      state.explodeFactor = 0.25 + 0.75 * smoothstep(0.0, 3.0, localT);
      state.pumpActive = false;
      state.valveOpening = 0.0;
      state.waveMakerPower = 0.0;
      state.debrisCountTarget = 0;
      state.turbidityMode = 'clear';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.0;
      state.rainIntensity = 0.0;
      state.wifiOnline = true;
      state.pipelineActive = localT >= 1.8;
      state.showOptics = false;
      state.showLidarBeam = false;
      state.showCameraFov = false;
      state.showPivVectors = false;
      state.showYoloBoxes = false;
    } else if (stage.index === 1) {
      // Stage 1: Pump Startup & Stepped Weir Cascade
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = true;
      state.explodeFactor = 1.0 - smoothstep(0.0, 2.2, localT);
      state.pumpActive = true;
      state.valveOpening = 0.75 * smoothstep(0.6, 4.2, localT);
      state.waveMakerPower = 0.25 * smoothstep(2.0, 6.0, localT);
      state.debrisCountTarget = localT > 3.5 ? 4 : 0;
      state.turbidityMode = 'clear';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.0;
      state.wifiOnline = true;
      state.pipelineActive = true;
      state.showOptics = false;
      state.showLidarBeam = false;
      state.showCameraFov = false;
      state.showPivVectors = false;
      state.showYoloBoxes = false;
    } else if (stage.index === 2) {
      // Stage 2: TF-Luna LiDAR Ranging (35.8 cm HUD waveform & WL=H-D)
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = true;
      state.explodeFactor = 0.0;
      state.pumpActive = true;
      state.valveOpening = 0.75;
      state.waveMakerPower = 0.25;
      state.debrisCountTarget = 5;
      state.turbidityMode = 'clear';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.0;
      state.wifiOnline = true;
      state.pipelineActive = true;
      state.showOptics = true;
      state.showLidarBeam = true;
      state.showCameraFov = localT > 4.0;
      state.showPivVectors = false;
      state.showYoloBoxes = false;
    } else if (stage.index === 3) {
      // Stage 3: NoIR Camera + 850 nm IR & Debris Injection
      const nightSweep = localT >= 5.0;
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = true;
      state.explodeFactor = 0.0;
      state.pumpActive = true;
      state.valveOpening = 0.75;
      state.waveMakerPower = 0.32;
      state.debrisCountTarget = 8;
      state.turbidityMode = nightSweep ? 'dark' : 'clear';
      state.nightMode = nightSweep;
      state.timeOfDay = nightSweep ? 'night' : 'day';
      state.sunGlare = 0.0;
      state.wifiOnline = true;
      state.pipelineActive = true;
      state.showOptics = true;
      state.showLidarBeam = true;
      state.showCameraFov = true;
      state.showPivVectors = true;
      state.showYoloBoxes = true;
    } else if (stage.index === 4) {
      // Stage 4: Local Buffering & Wi-Fi Cloud Upload
      const reconnected = localT >= 5.0;
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = true;
      state.explodeFactor = 0.55;
      state.pumpActive = true;
      state.valveOpening = 0.75;
      state.waveMakerPower = 0.25;
      state.debrisCountTarget = 6;
      state.turbidityMode = 'silty';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.0;
      state.wifiOnline = reconnected;
      state.pipelineActive = true;
      state.showOptics = true;
      state.showLidarBeam = true;
      state.showCameraFov = true;
      state.showPivVectors = true;
      state.showYoloBoxes = true;
    } else if (stage.index === 5) {
      // Stage 5: Server PyORC/LSPIV + YOLOv8 & Threshold Email Alert
      state.mode = 'lab';
      state.lidarHeightM = 0.693;
      state.labLidarHeightM = 0.693;
      state.powerOn = true;
      state.explodeFactor = 0.0;
      state.pumpActive = true;
      state.valveOpening = 0.75 + 0.25 * smoothstep(0.4, 3.0, localT);
      state.waveMakerPower = 0.55;
      state.debrisCountTarget = 13;
      state.turbidityMode = 'silty';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.1;
      state.wifiOnline = true;
      state.pipelineActive = true;
      state.showOptics = true;
      state.showLidarBeam = true;
      state.showCameraFov = true;
      state.showPivVectors = true;
      state.showYoloBoxes = true;
      // Ensure lab thresholds allow the high-flow valve surge to fire a clear email alert
      state.thresholds = {
        waterLevelM: 0.342,
        surfaceVelocityMs: 0.140,
        dischargeM3s: 0.00160,
        debrisCount: 8,
      };
    } else if (stage.index === 6) {
      // Stage 6: Phase 2 Real River Twin (Guimbal River, Iloilo)
      state.mode = 'river';
      state.riverMountMode = 'bridge';
      state.powerOn = true;
      state.lidarHeightM = 4.5;
      state.riverLidarHeightM = 4.5;
      state.explodeFactor = 0.0;
      state.riverStagePreset = 'hydrograph';
      state.hydrographTime = localT * 2.8;
      state.manningN = 0.035;
      state.channelSlope = 0.0024;
      state.velocityCoeffK = 0.85;
      state.rainIntensity = 0.65;
      state.windChop = 0.42;
      state.debrisCountTarget = 20;
      state.turbidityMode = 'muddy';
      state.nightMode = false;
      state.timeOfDay = 'day';
      state.sunGlare = 0.15;
      state.wifiOnline = true;
      state.pipelineActive = true;
      state.showBathymetrySlice = true;
      state.showGcpGrid = true;
      state.showOptics = true;
      state.showLidarBeam = true;
      state.showCameraFov = true;
      state.showPivVectors = true;
      state.showYoloBoxes = true;
      state.thresholds = {
        waterLevelM: 2.15,
        surfaceVelocityMs: 2.35,
        dischargeM3s: 26.0,
        debrisCount: 14,
      };
      desiredPreset = localT < 6.0 ? 'river_cross_section' : 'gcp_aerial';
    }

    const stageChanged = stage.index !== lastStageIndex;
    if (stageChanged) {
      lastStageIndex = stage.index;
      if (stage.index === 1 && typeof callbacks.onResetHydraulics === 'function') {
        callbacks.onResetHydraulics();
      }
      if (typeof callbacks.onStageChange === 'function') {
        callbacks.onStageChange({
          ...stage,
          currentTime,
          totalDuration: TOTAL_TIMELINE_DURATION_S,
          progress: currentTime / TOTAL_TIMELINE_DURATION_S,
          stageProgress: stageFrac,
          playing,
          holdAtStageEnd,
        });
      }
    }

    if ((forcePreset || desiredPreset !== lastAppliedPreset || stageChanged) && desiredPreset !== lastSubPhaseCam) {
      lastAppliedPreset = desiredPreset;
      lastSubPhaseCam = desiredPreset;
      if (typeof callbacks.onCameraPreset === 'function') {
        callbacks.onCameraPreset(desiredPreset);
      }
    } else if (forcePreset) {
      lastAppliedPreset = desiredPreset;
      if (typeof callbacks.onCameraPreset === 'function') {
        callbacks.onCameraPreset(desiredPreset);
      }
    }
  }

  function getCurrentStageInfo() {
    const stage = findStageByTime(currentTime);
    const localT = currentTime - stage.startSec;
    const stageDur = Math.max(1e-4, stage.endSec - stage.startSec);
    return {
      ...stage,
      currentTime,
      totalDuration: TOTAL_TIMELINE_DURATION_S,
      progress: clamp(currentTime / TOTAL_TIMELINE_DURATION_S, 0, 1),
      stageProgress: clamp(localT / stageDur, 0, 1),
      playing,
      holdAtStageEnd,
    };
  }

  function play() {
    if (currentTime >= TOTAL_TIMELINE_DURATION_S - 0.05) {
      currentTime = 0;
      lastStageIndex = -1;
      lastSubPhaseCam = null;
    } else if (holdAtStageEnd) {
      const st = findStageByTime(currentTime);
      if (st && currentTime >= st.endSec - 0.05 && st.index < TIMELINE_STAGES.length - 1) {
        currentTime = st.endSec + 0.05;
      }
    }
    playing = true;
    applyStateAtTime(currentTime, lastStageIndex < 0);
    callbacks.onPlayStateChange?.(true);
  }

  function pause() {
    playing = false;
    callbacks.onPlayStateChange?.(false);
  }

  function seekStage(stageIndex) {
    const idx = clamp(Math.round(Number(stageIndex) || 0), 0, TIMELINE_STAGES.length - 1);
    const targetStage = TIMELINE_STAGES[idx];
    // Seek slightly into the stage (or exact start) so transition state is immediately clear
    currentTime = targetStage.startSec + (idx === 0 ? 0.5 : 0.25);
    lastStageIndex = -1;
    lastSubPhaseCam = null;
    applyStateAtTime(currentTime, true);
    callbacks.onProgress?.(getCurrentStageInfo());
  }

  function setProgress(progress01) {
    const p = clamp(Number(progress01) || 0, 0, 1);
    currentTime = p * TOTAL_TIMELINE_DURATION_S;
    lastSubPhaseCam = null;
    applyStateAtTime(currentTime, true);
    callbacks.onProgress?.(getCurrentStageInfo());
  }

  function setHoldAtStageEnd(enabled) {
    holdAtStageEnd = Boolean(enabled);
  }

  function update(dt) {
    if (!playing) {
      return getCurrentStageInfo();
    }
    const prevStage = findStageByTime(currentTime);
    const safeDt = clamp(dt || 0.016, 0, 0.2);
    const nextTime = currentTime + safeDt;
    if (holdAtStageEnd && prevStage && nextTime >= prevStage.endSec - 0.02 && prevStage.index < TIMELINE_STAGES.length - 1) {
      currentTime = prevStage.endSec - 0.02;
      applyStateAtTime(currentTime, false);
      pause();
    } else if (nextTime >= TOTAL_TIMELINE_DURATION_S) {
      currentTime = TOTAL_TIMELINE_DURATION_S;
      applyStateAtTime(currentTime, false);
      pause();
    } else {
      currentTime = nextTime;
      applyStateAtTime(currentTime, false);
    }
    const info = getCurrentStageInfo();
    callbacks.onProgress?.(info);
    return info;
  }

  return {
    update,
    play,
    pause,
    seekStage,
    setProgress,
    setHoldAtStageEnd,
    isHoldAtStageEnd: () => holdAtStageEnd,
    getCurrentStageInfo,
    getStages: () => TIMELINE_STAGES.map((s) => ({ ...s })),
    isPlaying: () => playing,
  };
}

export { TIMELINE_STAGES, TOTAL_TIMELINE_DURATION_S, createTimelineController };
