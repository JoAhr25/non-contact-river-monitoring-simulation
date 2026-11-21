/**
 * Scientific Computation & Telemetry Pipeline Engine
 * Implements equations, acceptance criteria (Table X), accuracy statistics (Tables 1-9),
 * YOLOv8 debris detection metrics, PyORC/LSPIV & discharge sensitivity (Objective 5A / Table 7),
 * DS3231 RTC buffering, TSR% upload recovery, and threshold email alerting from FINAL PAPER_RIVER.docx.
 */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function hash01(a, b = 0) {
  let x = ((a * 374761393 + b * 668265263) ^ 0x5bf03635) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function medianOf(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? 0.5 * (sorted[mid - 1] + sorted[mid]) : sorted[mid];
}

function getDefaultThresholds(mode = 'lab') {
  if (mode === 'river' || mode === 'phase2') {
    return {
      waterLevelM: 2.20,
      surfaceVelocityMs: 2.35,
      dischargeM3s: 28.0,
      debrisCount: 14,
    };
  }
  return {
    waterLevelM: 0.343,
    surfaceVelocityMs: 0.145,
    dischargeM3s: 0.00160,
    debrisCount: 8,
  };
}

const YOLO_CLASS_MAP = {
  foam: 'foam',
  tracer: 'tracer',
  debris_plastic: 'debris',
  bottle: 'bottle',
  bag: 'plastic_bag',
  branch: 'branch',
  leaf: 'leaf',
};

const YOLO_BASE_RECALL = {
  bottle: 0.96,
  branch: 0.95,
  foam: 0.94,
  tracer: 0.93,
  debris_plastic: 0.87,
  leaf: 0.85,
  bag: 0.80,
};

function createLightingBucket() {
  return {
    frames: 0,
    exactFrames: 0,
    tp: 0,
    fp: 0,
    fn: 0,
  };
}

function createPhaseAccumulator() {
  return {
    samples: 0,
    wlSumAbsErr: 0,
    wlSumSqErr: 0,
    wlSumBias: 0,
    wlMaxAbsErrM: 0,
    wlMaxPctErr: 0,
    wlPassCount: 0,

    vSumAbsErr: 0,
    vSumSqErr: 0,
    vSumBias: 0,
    vSumRef: 0,

    qSumAbsErr: 0,
    qSumPctErr: 0,
    qCount: 0,

    debrisFrames: 0,
    debrisExactFrames: 0,
    debrisSumAbsErr: 0,
    tpTotal: 0,
    fpTotal: 0,
    fnTotal: 0,
    day: createLightingBucket(),
    nightIr: createLightingBucket(),

    nExp: 0,
    nRec: 0,
    lidarExp: 0,
    lidarRec: 0,
    videoExp: 0,
    videoRec: 0,
    invalidCount: 0,
  };
}

function crc16Ccitt(bytes, init = 0xffff) {
  let crc = init & 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 0xff) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xffff) : ((crc << 1) & 0xffff);
    }
  }
  return crc & 0xffff;
}

function computeHazardIndex(count, coverageRatio, vSurfaceMs) {
  const hi = Math.min(
    100.0,
    (Number(count) || 0) * 8.5 + (Number(coverageRatio) || 0) * 250.0 + Math.max(0.0, Number(vSurfaceMs) || 0) * 6.0
  );
  const alertLevel = hi >= 70.0 ? 'CRITICAL' : hi >= 40.0 ? 'WARNING' : 'NORMAL';
  return { hazardIndex: Number(hi.toFixed(2)), alertLevel };
}

function encodeLoRa12BytePayload({
  nodeId = 1,
  waterLevelM = 0,
  velocityMs = 0,
  dischargeM3s = 0,
  hazardIndex = 0,
  debrisCount = 0,
}) {
  const wlMm = clamp(Math.round((Number(waterLevelM) || 0) * 1000), 0, 65535);
  const velMms = clamp(Math.round((Number(velocityMs) || 0) * 1000), 0, 65535);
  // Matches edge_node/esp32_uart_bridge.py '>BHHHHBH' (discharge in L/s = m3/s * 1000)
  const qLs = clamp(Math.round((Number(dischargeM3s) || 0) * 1000), 0, 65535);
  const hiX100 = clamp(Math.round((Number(hazardIndex) || 0) * 100), 0, 10000);
  const nsByte = clamp(Math.trunc(Number(debrisCount) || 0), 0, 255);

  const buf = new Uint8Array(12);
  buf[0] = (Number(nodeId) || 1) & 0xff;
  buf[1] = (wlMm >> 8) & 0xff;
  buf[2] = wlMm & 0xff;
  buf[3] = (velMms >> 8) & 0xff;
  buf[4] = velMms & 0xff;
  buf[5] = (qLs >> 8) & 0xff;
  buf[6] = qLs & 0xff;
  buf[7] = (hiX100 >> 8) & 0xff;
  buf[8] = hiX100 & 0xff;
  buf[9] = nsByte;

  const crc = crc16Ccitt(buf.subarray(0, 10), 0xffff);
  buf[10] = (crc >> 8) & 0xff;
  buf[11] = crc & 0xff;

  const hexParts = Array.from(buf, (b) => b.toString(16).toUpperCase().padStart(2, '0'));
  return {
    bytes: Array.from(buf),
    byteLength: 12,
    hex: hexParts.join(' '),
    compactHex: hexParts.join(''),
    crc16Hex: `${hexParts[10]}${hexParts[11]}`,
    nodeId: buf[0],
    waterMm: wlMm,
    velocityMms: velMms,
    dischargeLs: qLs,
    hazardIndexX100: hiX100,
    debrisCount: nsByte,
  };
}

function createPipelineModel() {
  let simClock = 0;
  let waveformClock = 0;
  let statsClock = 0;
  let uploadClock = 0;
  let trialCaptureClock = 0;
  let frameTick = 0;
  let lidarSeqTick = 0;

  // 10-reading median window (per Kupper et al. 2026 in Table 1)
  const lidarWindow = [];
  const distanceWaveform = []; // Last 96 readings in cm for HUD Oscilloscope
  const signalHistogram = new Array(24).fill(0);

  let smoothedWL = null;
  let smoothedVs = null;
  let lastValidLidarM = 0.358;
  let lastMode = 'lab';
  let lastMountSig = 'lab';

  // Edge storage & Cloud Sync (DS3231 RTC + microSD + SATA SSD + SQLite queue)
  const offlineQueue = [];
  let ssdUsedMB = 42.6;
  let microSdRecords = 0;
  let cloudSyncedRecords = 0;
  let lastPersistSimTime = -10;
  let lastUploadOk = true;
  let processingLatencyMs = 185;
  let rtcDriftMs = 0.7;

  // Trial logs (separated by Phase 1 Controlled & Phase 2 Field)
  const trialLogs = {
    phase1: [],
    phase2: [],
  };
  const trialCounters = {
    phase1: 0,
    phase2: 0,
  };

  // Running statistical accumulators
  let accumulators = {
    phase1: createPhaseAccumulator(),
    phase2: createPhaseAccumulator(),
  };

  // Threshold monitoring & Email Alert state
  const alertLog = [];
  const lastAlertTimeByParam = {
    waterLevelM: -999,
    surfaceVelocityMs: -999,
    dischargeM3s: -999,
    debrisCount: -999,
  };
  let alertSeq = 1;
  let pendingNewAlerts = [];

  // Hydrate persisted browser logs/statistics from localStorage if present
  (function hydrateFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem('river_sim_v1_records');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.trialLogs?.phase1)) {
        trialLogs.phase1.push(...saved.trialLogs.phase1.slice(-40));
      }
      if (Array.isArray(saved.trialLogs?.phase2)) {
        trialLogs.phase2.push(...saved.trialLogs.phase2.slice(-40));
      }
      trialCounters.phase1 = Math.max(
        trialLogs.phase1.length,
        Number(saved.trialCounters?.phase1) || 0
      );
      trialCounters.phase2 = Math.max(
        trialLogs.phase2.length,
        Number(saved.trialCounters?.phase2) || 0
      );
      for (const pk of ['phase1', 'phase2']) {
        const srcAcc = saved.accumulators?.[pk];
        if (srcAcc && typeof srcAcc === 'object') {
          const dst = accumulators[pk];
          for (const k of Object.keys(dst)) {
            if (typeof dst[k] === 'object' && dst[k] !== null && typeof srcAcc[k] === 'object' && srcAcc[k] !== null) {
              for (const sk of Object.keys(dst[k])) {
                const sval = Number(srcAcc[k][sk]);
                if (Number.isFinite(sval) && sval >= 0) dst[k][sk] = sval;
              }
              continue;
            }
            const val = Number(srcAcc[k]);
            if (Number.isFinite(val) && val >= 0) dst[k] = val;
          }
          if (Number.isFinite(Number(srcAcc.wlSumBias))) dst.wlSumBias = Number(srcAcc.wlSumBias);
          if (Number.isFinite(Number(srcAcc.vSumBias))) dst.vSumBias = Number(srcAcc.vSumBias);
        }
      }
      if (Array.isArray(saved.alertLog)) {
        alertLog.push(...saved.alertLog.slice(0, 50));
      }
      alertSeq = Math.max(alertLog.length + 1, Number(saved.alertSeq) || 1);
      if (Number.isFinite(Number(saved.microSdRecords))) {
        microSdRecords = Math.max(0, Number(saved.microSdRecords));
      }
      if (Number.isFinite(Number(saved.cloudSyncedRecords))) {
        cloudSyncedRecords = Math.max(0, Number(saved.cloudSyncedRecords));
      }
      if (Number.isFinite(Number(saved.ssdUsedMB))) {
        ssdUsedMB = Math.max(42.6, Number(saved.ssdUsedMB));
      }
    } catch (_) {
      // Ignore corrupt or restricted storage and run cleanly in memory
    }
  })();

  // Latest computed snapshot & sensitivity curve
  let latestSnapshot = buildInitialSnapshot();
  let latestSensitivity = {
    phase: 'phase1',
    waterLevelM: 0.335,
    surfaceVelocityMs: 0.24,
    wettedAreaM2: 0.01575,
    currentK: 0.85,
    currentQ: 0.0032,
    deltaWL: 0.05,
    points: [],
    deltaQOverK: 0,
    deltaQOverWL: 0,
    uncertaintyBandPct: 0,
  };

  function buildInitialSnapshot() {
    return {
      phase: 'phase1',
      mode: 'lab',
      rtcTimestamp: new Date().toISOString(),
      rtcLocalLabel: formatRtcLabel(new Date()),
      rtcDriftMs: 0.7,
      pipelineActive: true,
      wifiOnline: true,
      mounting: {
        mode: 'lab_gantry',
        label: 'Lab PVC Gantry',
        heightM: 0.693,
        lidarIncidenceDeg: 0,
        cameraIncidenceDeg: 0,
        rawLaserDistanceM: 0.358,
        slantCompEnabled: true,
        gcpLayout: 'Fixed Frame',
        hitDryBank: false,
      },
      lidar: {
        heightM: 0.693,
        distanceM: 0.358,
        distanceCm: 35.8,
        rawDistanceCm: 35.8,
        signalStrengthPct: 78,
        valid: true,
        inRange: true,
        statusLabel: 'LOCKED',
        waveformCm: [35.8],
        histogramBins: new Array(24).fill(0.1),
      },
      waterLevel: {
        calculatedM: 0.335,
        referenceM: 0.335,
        errorM: 0,
        absErrorCm: 0,
        percentError: 0,
        maeCm: 0,
        rmseCm: 0,
        meanBiasCm: 0,
        tableXPass: true,
        tableXRule: '<= 6.0 cm (0.2-3 m)',
      },
      velocity: {
        estimatedVs: 0.09,
        referenceVr: 0.09,
        errorMs: 0,
        percentError: 0,
        maeMs: 0,
        rmseMs: 0,
        rRmsePct: 0,
        tableXPass: true,
        tableXRule: 'rRMSE <= 20%',
      },
      discharge: {
        estimatedQ: 0.00118,
        referenceQ: 0.00118,
        wettedAreaM2: 0.01575,
        velocityCoeffK: 0.85,
        errorM3s: 0,
        percentError: 0,
        mapePct: 0,
        tableXPass: true,
        tableXRule: 'MAPE <= 10%',
        independentRefAvailable: true,
      },
      debris: {
        systemCountNs: 0,
        manualCountNr: 0,
        countError: 0,
        tp: 0,
        fp: 0,
        fn: 0,
        precisionPct: 100,
        recallPct: 100,
        f1Pct: 100,
        exactMatchFrame: true,
        exactMatchPct: 100,
        hazardIndex: 0.54,
        alertLevel: 'NORMAL',
        tableXPass: true,
        tableXRule: '>= 90% exact match',
        detections: [],
        missed: [],
      },
      edgeStorage: {
        architectureProfile: 'proposal',
        wifiOnline: true,
        queuedCount: 0,
        microSdRecords: 0,
        ssdUsedMB: 42.6,
        expectedRecords: 0,
        receivedRecords: 0,
        missingOrInvalid: 0,
        tsrPct: 100,
        lidarTsrPct: 100,
        videoTsrPct: 100,
        tableXPass: true,
        tableXRule: 'TSR >= 90%',
        processingLatencyMs: 185,
        processingMode: 'Real-Time (Lab)',
        edgeStageLabel: 'LiDAR + Wi-Fi Sync',
        ramUsedMb: 420,
        loraRssiDbm: -74,
        loraSnrDb: 9.2,
        uploadStatus: 'SYNCED',
      },
      functionalityChecks: [
        { name: 'Data acquisition', criterion: 'Reading & video logged on schedule', status: 'PASS', tested: 1, passed: 1 },
        { name: 'Timestamping', criterion: 'DS3231 RTC drift < 100 ms', status: 'PASS', tested: 1, passed: 1 },
        { name: 'Server-side processing', criterion: 'WL, Vs, Q & YOLOv8 outputs ready', status: 'PASS', tested: 1, passed: 1 },
        { name: 'Database storage', criterion: 'Local SQLite & remote sync match', status: 'PASS', tested: 1, passed: 1 },
        { name: 'Dashboard display', criterion: 'HUD values match stored telemetry', status: 'PASS', tested: 1, passed: 1 },
      ],
      loraPayload: encodeLoRa12BytePayload({
        nodeId: 1,
        waterLevelM: 0.335,
        velocityMs: 0.09,
        dischargeM3s: 0.00118,
        hazardIndex: 0.54,
        debrisCount: 0,
      }),
      alertsMeta: {
        total: 0,
        delivered: 0,
        deliveryRatePct: 100,
        meanDelayMs: 0,
        tableXPass: true,
      },
      alerts: [],
      newAlerts: [],
    };
  }

  function formatRtcLabel(dateObj) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = dateObj.getUTCFullYear();
    const m = pad(dateObj.getUTCMonth() + 1);
    const d = pad(dateObj.getUTCDate());
    const hh = pad(dateObj.getUTCHours());
    const mm = pad(dateObj.getUTCMinutes());
    const ss = pad(dateObj.getUTCSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss} UTC`;
  }

  function resolveSensorHeight(state, isRiver) {
    const rawH = state?.lidarHeightM;
    if (isRiver) {
      if (state?.riverMountMode === 'side_pole' || state?.riverMountMode === 'lab_pole') {
        const rawSide = state?.sidePoleHeightM;
        if (rawSide !== undefined && Number.isFinite(Number(rawSide))) {
          return clamp(Number(rawSide), 4.5, 7.5);
        }
        return 6.0;
      }
      if (state?.riverLidarHeightM !== undefined && Number.isFinite(Number(state.riverLidarHeightM))) {
        return clamp(Number(state.riverLidarHeightM), 2.5, 9.5);
      }
      if (rawH !== undefined && Number.isFinite(Number(rawH)) && Number(rawH) >= 1.8) {
        return clamp(Number(rawH), 2.5, 9.5);
      }
      return 4.5;
    }
    if (rawH !== undefined && Number.isFinite(Number(rawH)) && Number(rawH) <= 2.2) {
      return clamp(Number(rawH), 0.45, 1.45);
    }
    return 0.693;
  }

  function updateSignalHistogram(distanceM, signalStrengthPct, valid, sunGlare) {
    // Model 24-bin ToF phase correlation / return histogram peaking at target bin
    const peakBin = clamp(Math.round((distanceM / (distanceM > 1.5 ? 8.0 : 1.0)) * 18) + 2, 2, 21);
    const snrNorm = clamp(signalStrengthPct / 100, 0.08, 1.0);
    for (let i = 0; i < 24; i++) {
      const distBins = Math.abs(i - peakBin);
      const lobe = valid
        ? snrNorm * Math.exp(-(distBins * distBins) / (1.8 + sunGlare * 1.4))
        : 0.12 * Math.exp(-(distBins * distBins) / 6.0);
      const ambientNoise = (0.04 + sunGlare * 0.14) * hash01(lidarSeqTick + 17, i);
      const targetVal = clamp(lobe + ambientNoise, 0.02, 1.0);
      signalHistogram[i] = signalHistogram[i] * 0.45 + targetVal * 0.55;
    }
  }

  function computeSensitivitySweep(isRiver, wlRef, vsEst, areaBase, topWidthM, currentK, hydraulicsRef = null, vRrmsePct = 6.0) {
    const ks = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
    const deltaWL = 0.05;
    const widthEff = Math.max(0.2, topWidthM || (isRiver ? 7.5 : 0.35));
    const areaLow =
      typeof hydraulicsRef?.computeAreaAtWaterLevel === 'function'
        ? Math.max(0.002, hydraulicsRef.computeAreaAtWaterLevel(Math.max(0, wlRef - deltaWL)))
        : Math.max(0.002, areaBase - widthEff * deltaWL);
    const areaHigh =
      typeof hydraulicsRef?.computeAreaAtWaterLevel === 'function'
        ? Math.max(0.002, hydraulicsRef.computeAreaAtWaterLevel(wlRef + deltaWL))
        : areaBase + widthEff * deltaWL;

    const points = ks.map((kVal) => ({
      k: kVal,
      qNominal: kVal * vsEst * areaBase,
      qLowWL: kVal * vsEst * areaLow,
      qHighWL: kVal * vsEst * areaHigh,
    }));

    const qAt70 = points[0].qNominal;
    const qAt95 = points[points.length - 1].qNominal;
    const midIdx = 3; // k = 0.85
    const deltaQOverK = qAt95 - qAt70;
    const deltaQOverWL = points[midIdx].qHighWL - points[midIdx].qLowWL;
    const currentQ = currentK * vsEst * areaBase;

    // JCGM GUM-1:2023 RSS combined relative uncertainty (%) across k, Vs, and A(WL +- 0.05 m)
    const relUk = (0.125 / Math.sqrt(3)) / Math.max(0.5, currentK);
    const relUv = Math.max(0.03, (Number(vRrmsePct) || 6.0) / 100);
    const relUa = areaBase > 1e-6 ? Math.abs(areaHigh - areaLow) / (2 * Math.sqrt(3) * areaBase) : 0;
    const uncertaintyBandPct = Math.sqrt(relUk * relUk + relUv * relUv + relUa * relUa) * 100;

    return {
      phase: isRiver ? 'phase2' : 'phase1',
      waterLevelM: wlRef,
      surfaceVelocityMs: vsEst,
      wettedAreaM2: areaBase,
      areaLowM2: areaLow,
      areaHighM2: areaHigh,
      currentK,
      currentQ,
      deltaWL,
      points,
      deltaQOverK,
      deltaQOverWL,
      uncertaintyBandPct,
    };
  }

  function evaluateYoloFrame(visibleParticles, state, isRiver) {
    const turbidity = state?.turbidityMode || (isRiver ? 'silty' : 'clear');
    const glare = clamp(Number(state?.sunGlare ?? 0), 0, 1);
    const rain = clamp(Number(state?.rainIntensity ?? 0), 0, 1);
    const wavePower = clamp(Number(state?.waveMakerPower ?? state?.windChop ?? 0.2), 0, 1);
    const isNightScene = state?.timeOfDay === 'night' || state?.timeOfDay === 'night_no_ir';
    const irActive = Boolean(state?.nightMode);

    // Filter ground truth debris inside camera FOV (natural river foam in Phase 2 is not anthropogenic debris)
    const fovParticles = (visibleParticles || []).filter(
      (p) => p && p.inFov !== false && !(isRiver && p.type === 'foam')
    );
    const epoch = Math.floor(frameTick / 5);

    const detections = [];
    const missed = [];
    let tp = 0;

    for (let i = 0; i < fovParticles.length; i++) {
      const p = fovParticles[i];
      const pid = p.id || i + 1;
      const baseRecall = YOLO_BASE_RECALL[p.type] ?? 0.88;

      // Size factor: smaller items harder to resolve (Tomas et al. 2024)
      const normSize = isRiver ? clamp((p.size || 0.25) / 0.35, 0.4, 1.2) : clamp((p.size || 0.009) / 0.011, 0.5, 1.2);
      let detectProb = baseRecall - (1.0 - Math.min(1.0, normSize)) * 0.14;

      // Glare reduces contrast on shiny/clear surfaces
      detectProb -= glare * (turbidity === 'clear' ? 0.22 : 0.14);
      // Rain drops & splashes partially obscure small targets
      detectProb -= rain * 0.10;

      // Nighttime / dark condition: NoIR camera needs 850 nm IR illuminator!
      if (isNightScene && !irActive) {
        detectProb -= 0.46;
      } else if (irActive) {
        // 850 nm IR produces crisp retro-reflective contrast on foam/plastics
        detectProb += 0.04;
      }

      detectProb = clamp(detectProb, 0.22, 0.985);
      const roll = hash01(pid * 31, epoch);

      if (roll <= detectProb) {
        tp++;
        const confJitter = (hash01(pid * 17, epoch + 3) - 0.5) * 0.10;
        const confidence = clamp(detectProb * 0.96 + confJitter, 0.52, 0.97);
        detections.push({
          id: `det-${pid}`,
          particleId: pid,
          className: YOLO_CLASS_MAP[p.type] || 'debris',
          confidence,
          x: p.x,
          y: p.y,
          z: p.z,
          size: p.size || (isRiver ? 0.24 : 0.01),
          isTP: true,
          isFP: false,
        });
      } else {
        missed.push({
          particleId: pid,
          className: YOLO_CLASS_MAP[p.type] || 'debris',
          x: p.x,
          y: p.y,
          z: p.z,
          reason: isNightScene && !irActive ? 'Low-light (IR off)' : glare > 0.5 ? 'Specular glare' : 'Small/submerged',
        });
      }
    }

    // Wave-glare / whitecap false positives (FP)
    let fp = 0;
    const fpHazard = glare * 0.48 + wavePower * 0.22 + rain * 0.18 - (irActive && !glare ? 0.08 : 0);
    if (fpHazard > 0.34) {
      const fpEpoch = Math.floor(frameTick / 9);
      const maxFpCandidates = fpHazard > 0.65 ? 2 : 1;
      for (let k = 0; k < maxFpCandidates; k++) {
        if (hash01(900 + k * 41, fpEpoch) < (fpHazard - 0.28) * 0.72) {
          fp++;
          const isSidePole = isRiver && (state?.riverMountMode === 'side_pole' || state?.riverMountMode === 'lab_pole');
          const rx = isSidePole
            ? -0.2 + hash01(k + 11, fpEpoch) * 4.6
            : isRiver
              ? -0.9 + hash01(k + 11, fpEpoch) * 3.1
              : -0.22 + hash01(k + 11, fpEpoch) * 0.44;
          const rz = isSidePole
            ? -3.4 + hash01(k + 23, fpEpoch) * 6.8
            : isRiver
              ? -1.4 + hash01(k + 23, fpEpoch) * 2.8
              : -0.11 + hash01(k + 23, fpEpoch) * 0.22;
          const ry = isRiver ? (state?.riverStageM ?? 1.15) : 0.27;
          detections.push({
            id: `fp-${fpEpoch}-${k}`,
            particleId: null,
            className: glare > 0.45 ? 'glare_fp' : 'foam_fp',
            confidence: clamp(0.41 + hash01(k + 5, fpEpoch) * 0.21, 0.40, 0.65),
            x: rx,
            y: ry,
            z: rz,
            size: isRiver ? 0.18 : 0.012,
            isTP: false,
            isFP: true,
          });
        }
      }
    }

    const nr = fovParticles.length;
    const fn = Math.max(0, nr - tp);
    const ns = tp + fp;
    return { nr, ns, tp, fp, fn, detections, missed };
  }

  const STORAGE_KEY = 'river_sim_v1_records';

  function readPersistedStore() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writePersistedStore(payload) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearPersistedStore() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function persistStateToBrowser(force = false) {
    if (!force && simClock - lastPersistSimTime < 2.0) return;
    lastPersistSimTime = simClock;
    lastUploadOk = writePersistedStore({
      version: 1,
      savedAt: new Date().toISOString(),
      trialLogs: {
        phase1: trialLogs.phase1,
        phase2: trialLogs.phase2,
      },
      trialCounters,
      accumulators,
      alertLog,
      alertSeq,
      microSdRecords,
      cloudSyncedRecords,
      ssdUsedMB: Number(ssdUsedMB.toFixed(2)),
    });
  }

  function recordTrialRow(phaseKey, snap, state) {
    const list = trialLogs[phaseKey];
    trialCounters[phaseKey] = (trialCounters[phaseKey] || list.length) + 1;
    const indexNum = trialCounters[phaseKey];
    const prefix = phaseKey === 'phase1' ? 'T' : 'F';
    const trialId = `${prefix}${String(indexNum).padStart(2, '0')}`;
    const isNight = Boolean(state?.nightMode || state?.turbidityMode === 'dark');

    const row = {
      trialId,
      phase: phaseKey,
      timestamp: snap.rtcLocalLabel,
      isoTimestamp: snap.rtcTimestamp,
      lidarDistanceM: snap.lidar.distanceM,
      calculatedWlM: snap.waterLevel.calculatedM,
      referenceWlM: snap.waterLevel.referenceM,
      wlErrorM: snap.waterLevel.errorM,
      wlAbsErrorCm: snap.waterLevel.absErrorCm,
      wlPercentError: snap.waterLevel.percentError,
      estimatedVsMs: snap.velocity.estimatedVs,
      referenceVsMs: snap.velocity.referenceVr,
      velocityErrorMs: snap.velocity.errorMs,
      wettedAreaM2: snap.discharge.wettedAreaM2,
      velocityCoeffK: snap.discharge.velocityCoeffK,
      estimatedQM3s: snap.discharge.estimatedQ,
      referenceQM3s: snap.discharge.referenceQ,
      qErrorM3s: snap.discharge.errorM3s,
      qPercentError: snap.discharge.percentError,
      independentRefAvailable: phaseKey === 'phase1' || Boolean(state?.independentFieldRef),
      lightingCondition: state?.nightMode ? 'IR 850nm Night' : isNight ? 'Low-light (No IR)' : 'Daylight',
      framesEvaluated: accumulators[phaseKey].debrisFrames,
      systemDebrisNs: snap.debris.systemCountNs,
      manualDebrisNr: snap.debris.manualCountNr,
      tp: snap.debris.tp,
      fp: snap.debris.fp,
      fn: snap.debris.fn,
      precisionPct: snap.debris.precisionPct,
      recallPct: snap.debris.recallPct,
      f1Pct: snap.debris.f1Pct,
      expectedRecords: snap.edgeStorage.expectedRecords,
      validReceivedRecords: snap.edgeStorage.receivedRecords,
      missingOrInvalid: snap.edgeStorage.missingOrInvalid,
      tsrPct: snap.edgeStorage.tsrPct,
      flowStage: state?.riverStagePreset || (phaseKey === 'phase1' ? 'Lab Weir' : 'normal'),
      mountMode: snap.mounting?.label || (phaseKey === 'phase2' ? 'Overhead Bridge Mount' : 'Lab PVC Gantry'),
      mountHeightM: snap.mounting?.heightM ?? snap.lidar.heightM,
      lidarAngleDeg: snap.mounting?.lidarIncidenceDeg ?? 0,
      cameraAngleDeg: snap.mounting?.cameraIncidenceDeg ?? 0,
      slantCompEnabled: snap.mounting?.slantCompEnabled !== false,
      rainfall: (state?.rainIntensity ?? 0) > 0.5 ? 'Heavy' : (state?.rainIntensity ?? 0) > 0.1 ? 'Light' : 'None',
      turbidity: state?.turbidityMode || 'clear',
      glare: (state?.sunGlare ?? 0) > 0.5 ? 'High' : (state?.sunGlare ?? 0) > 0.15 ? 'Moderate' : 'Low',
      obstruction: phaseKey === 'phase2' && snap.mounting?.mode === 'bridge' ? 'Bridge Pier Wake' : 'None',
      tableXWaterLevelPass: snap.waterLevel.tableXPass,
      lidarTsrPct: snap.edgeStorage.lidarTsrPct,
      videoTsrPct: snap.edgeStorage.videoTsrPct,
      hazardIndex: snap.debris.hazardIndex,
      alertLevel: snap.debris.alertLevel,
      loraPayloadHex: snap.loraPayload?.compactHex || '',
      alertsCount: alertLog.length,
    };

    list.push(row);
    if (list.length > 40) {
      list.shift();
    }
    persistStateToBrowser(true);
    return row;
  }

  function evaluateThresholds(snap, state, isRiver, wifiOnline) {
    const defaults = getDefaultThresholds(isRiver ? 'river' : 'lab');
    const thresholds = state?.thresholds || defaults;
    const newlyTriggered = [];

    const checks = [
      {
        key: 'waterLevelM',
        label: 'Water Level (WL)',
        value: snap.waterLevel.calculatedM,
        threshold: Number(thresholds.waterLevelM ?? defaults.waterLevelM),
        unit: 'm',
        precision: 3,
      },
      {
        key: 'surfaceVelocityMs',
        label: 'Surface Velocity (Vs)',
        value: snap.velocity.estimatedVs,
        threshold: Number(thresholds.surfaceVelocityMs ?? defaults.surfaceVelocityMs),
        unit: 'm/s',
        precision: 2,
      },
      {
        key: 'dischargeM3s',
        label: 'Discharge (Q)',
        value: snap.discharge.estimatedQ,
        threshold: Number(thresholds.dischargeM3s ?? defaults.dischargeM3s),
        unit: 'm³/s',
        precision: isRiver ? 2 : 5,
      },
      {
        key: 'debrisCount',
        label: 'Floating Debris (Ns)',
        value: snap.debris.systemCountNs,
        threshold: Number(thresholds.debrisCount ?? defaults.debrisCount),
        unit: 'items',
        precision: 0,
      },
    ];

    for (const c of checks) {
      if (!Number.isFinite(c.threshold) || c.threshold <= 0) continue;
      if (c.value > c.threshold) {
        const cooldownElapsed = simClock - lastAlertTimeByParam[c.key];
        if (cooldownElapsed >= 8.0) {
          lastAlertTimeByParam[c.key] = simClock;
          const ratio = c.value / c.threshold;
          const severity = ratio >= 1.25 ? 'CRITICAL' : 'WARNING';
          const delayMs = wifiOnline ? Math.round(280 + hash01(alertSeq, 7) * 320) : 0;
          const alertObj = {
            id: `ALT-${String(alertSeq++).padStart(3, '0')}`,
            phase: snap.phase,
            timestamp: snap.rtcLocalLabel,
            isoTimestamp: snap.rtcTimestamp,
            parameterKey: c.key,
            parameter: c.label,
            value: Number(c.value.toFixed(c.precision)),
            threshold: Number(c.threshold.toFixed(c.precision)),
            unit: c.unit,
            severity,
            recipient: isRiver ? 'guimbal-drrmo@iloilo.gov.ph' : 'lab-monitor@usa.edu.ph',
            subject: `[${severity}] ${c.label} Exceeded Threshold (${c.value.toFixed(c.precision)} ${c.unit})`,
            message: `${c.label} reached ${c.value.toFixed(c.precision)} ${c.unit} (threshold ${c.threshold.toFixed(c.precision)} ${c.unit}) in ${isRiver ? 'Guimbal River, Iloilo' : 'Controlled Lab Tank'}.`,
            deliveryStatus: wifiOnline ? 'DELIVERED' : 'QUEUED (NO WIFI)',
            deliveryDelayMs: delayMs,
          };
          alertLog.unshift(alertObj);
          if (alertLog.length > 50) alertLog.length = 50;
          newlyTriggered.push(alertObj);
        }
      } else if (c.value < c.threshold * 0.92) {
        // Reset cooldown cleanly once value recovers well below threshold
        lastAlertTimeByParam[c.key] = Math.min(lastAlertTimeByParam[c.key], simClock - 6.5);
      }
    }

    // Deliver any previously queued email alerts once Wi-Fi reconnects
    if (wifiOnline) {
      for (const existing of alertLog) {
        if (existing.deliveryStatus === 'QUEUED (NO WIFI)') {
          existing.deliveryStatus = 'DELIVERED (SYNCED)';
          existing.deliveryDelayMs = Math.round(450 + hash01(alertSeq, 13) * 400);
        }
      }
    }

    return newlyTriggered;
  }

  function step(dt, state = {}, hydraulicsMetrics = {}, lidarReading = null, visibleParticles = []) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.1);
    simClock += safeDt;
    waveformClock += safeDt;
    statsClock += safeDt;
    uploadClock += safeDt;
    trialCaptureClock += safeDt;
    frameTick++;

    const mode = state?.mode === 'river' || hydraulicsMetrics?.phase === 'river' ? 'river' : 'lab';
    const isRiver = mode === 'river';
    const isLabPole = isRiver && state?.riverMountMode === 'lab_pole';
    const isSidePole = isRiver && state?.riverMountMode === 'side_pole';
    const isAnySidePole = isLabPole || isSidePole;
    const phaseKey = isRiver ? 'phase2' : 'phase1';
    const pipelineActive = state?.pipelineActive !== false;
    const wifiOnline = state?.wifiOnline !== false;

    const thetaDeg = isAnySidePole ? clamp(Number(lidarReading?.thetaDeg ?? state?.riverLidarTiltDeg ?? 32), 0, 45) : 0;
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const slantComp = isAnySidePole ? (lidarReading?.slantCompEnabled ?? (state?.riverLidarSlantComp !== false)) : true;
    const mountTag = isLabPole ? 'lp' : isSidePole ? 'sp' : 'br';
    const mountSig = `${mode}:${mountTag}:${thetaDeg.toFixed(1)}:${slantComp ? 1 : 0}`;

    // Reset short filter history on phase or mounting switch so transitions snap immediately
    if (mode !== lastMode || mountSig !== lastMountSig) {
      lidarWindow.length = 0;
      distanceWaveform.length = 0;
      smoothedWL = null;
      if (mode !== lastMode) smoothedVs = null;
      lastMode = mode;
      lastMountSig = mountSig;
    }

    const H = resolveSensorHeight(state, isRiver);
    const trueWL = Number(hydraulicsMetrics?.waterLevelM ?? hydraulicsMetrics?.y_w1 ?? (isRiver ? 1.15 : 0.335));
    const trueD = Math.max(0.05, H - trueWL);
    const trueSlantD = trueD / Math.max(0.2, Math.cos(thetaRad));
    const turbidity = state?.turbidityMode || (isRiver ? 'silty' : 'clear');
    const glare = clamp(Number(state?.sunGlare ?? 0), 0, 1);
    const rain = clamp(Number(state?.rainIntensity ?? 0), 0, 1);
    const rippleAmp = Number(hydraulicsMetrics?.rippleAmp ?? (isRiver ? 0.018 : 0.003));

    // 1. TF-Luna LiDAR Distance & H_water = H_mount - (D_laser * cos(theta))
    let rawDistanceM = slantComp ? trueD : trueSlantD;
    let rawLaserDistanceM = Number.isFinite(Number(lidarReading?.rawLaserDistanceM))
      ? Number(lidarReading.rawLaserDistanceM)
      : trueSlantD;
    let signalStrengthPct = 82;
    let readingValid = true;

    if (lidarReading && typeof lidarReading === 'object') {
      const distVal = lidarReading.lidarDistanceM ?? lidarReading.distanceM;
      if (Number.isFinite(Number(distVal))) {
        rawDistanceM = Number(distVal);
      }
      const snrVal = lidarReading.signalStrengthPct ?? lidarReading.snr;
      if (Number.isFinite(Number(snrVal))) {
        signalStrengthPct = clamp(Number(snrVal), 0, 100);
      }
      if (lidarReading.valid !== undefined) {
        readingValid = Boolean(lidarReading.valid);
      }
      if (lidarReading.dropout !== undefined && lidarReading.dropout) {
        readingValid = false;
      }
    } else if (typeof lidarReading === 'number' && Number.isFinite(lidarReading)) {
      rawLaserDistanceM = lidarReading;
      rawDistanceM = slantComp ? lidarReading * Math.cos(thetaRad) : lidarReading;
    } else {
      // Model realistic ToF distance + turbidity & glare physics (Jannata 2021; Kupper 2026)
      const turbSigma =
        turbidity === 'muddy'
          ? 0.0014
          : turbidity === 'silty'
            ? 0.0021
            : turbidity === 'dark'
              ? 0.0023
              : 0.0036;
      const turbBias = turbidity === 'clear' ? 0.0018 : turbidity === 'silty' ? 0.0006 : 0.0002;
      const scaleFactor = isRiver ? 2.8 : 1.0;
      const waveOsc = Math.sin(simClock * 7.4) * rippleAmp * 0.55;
      const jitter = (hash01(frameTick, 19) - 0.5) * 2.0 * turbSigma * scaleFactor;
      rawLaserDistanceM = Math.max(0.05, Math.round((trueSlantD + turbBias + waveOsc + jitter) * 100) / 100);
      rawDistanceM = slantComp ? rawLaserDistanceM * Math.cos(thetaRad) : rawLaserDistanceM;

      const baseSnr =
        turbidity === 'muddy'
          ? 91
          : turbidity === 'silty'
            ? 79
            : turbidity === 'dark'
              ? 64
              : 54;
      signalStrengthPct = clamp(
        baseSnr - glare * 36 - rain * 10 - (1 - Math.cos(thetaRad)) * 18 + (hash01(frameTick, 31) - 0.5) * 6,
        12,
        99
      );
      readingValid = !(glare > 0.78 && hash01(frameTick, 53) < (glare - 0.72) * 1.6);
    }

    const inRange =
      trueSlantD >= 0.20 &&
      trueSlantD <= 8.00 &&
      rawLaserDistanceM >= 0.20 &&
      rawLaserDistanceM <= 8.00;
    if (!inRange) {
      readingValid = false;
    }

    const archProfile = state?.architectureProfile === 'edge_lora' ? 'edge_lora' : 'proposal';
    const filterWindowSize = archProfile === 'edge_lora' ? 7 : 10;

    if (readingValid) {
      lastValidLidarM = rawDistanceM;
      lidarWindow.push(rawDistanceM);
    }
    while (lidarWindow.length > filterWindowSize) lidarWindow.shift();

    const filteredDistanceM = medianOf(lidarWindow.length ? lidarWindow : [lastValidLidarM]);
    const calcWlRaw = Math.max(0, H - filteredDistanceM);
    smoothedWL = smoothedWL === null ? calcWlRaw : smoothedWL + (calcWlRaw - smoothedWL) * Math.min(1, safeDt * 10);
    const calculatedWL = Math.max(0, smoothedWL);

    const wlErrorM = calculatedWL - trueWL;
    const wlAbsErrorM = Math.abs(wlErrorM);
    const wlAbsErrorCm = wlAbsErrorM * 100;
    const distPctError = trueD > 1e-6 ? (Math.abs(filteredDistanceM - trueD) / trueD) * 100 : 0;
    const tableXRule = trueSlantD <= 3.0 ? 'Max AE <= 6.0 cm (0.2-3 m)' : 'Max Err <= 2.0% (3-8 m)';
    const wlSamplePass = !inRange
      ? false
      : trueSlantD <= 3.0
        ? wlAbsErrorCm <= 6.0
        : distPctError <= 2.0;

    // Sample waveform & histogram at ~12 Hz for smooth video-authentic Oscilloscope scrolling
    if (waveformClock >= 0.085) {
      waveformClock = 0;
      lidarSeqTick++;
      const sampleCm = Number((rawDistanceM * 100).toFixed(2));
      distanceWaveform.push(sampleCm);
      if (distanceWaveform.length > 96) distanceWaveform.shift();
      updateSignalHistogram(filteredDistanceM, signalStrengthPct, readingValid, glare);
    }

    // 2. PyORC / LSPIV Surface Velocity Vs & Discharge Q = k * Vs * A(WL_calc)
    const trueVs = Number(hydraulicsMetrics?.trueSurfaceVelocity ?? (isRiver ? 1.2 : 0.09));
    const pivTracers = (visibleParticles || []).filter(
      (p) => p && p.inFov !== false && !String(p.zone || '').startsWith('fall')
    );
    const fovCount = pivTracers.length;
    const isNightScene = state?.timeOfDay === 'night' || state?.timeOfDay === 'night_no_ir';
    const irActive = Boolean(state?.nightMode);

    let tracerMeanVx = trueVs;
    if (fovCount > 0) {
      let sumVx = 0;
      for (let i = 0; i < fovCount; i++) {
        sumVx += Math.max(0, Number(pivTracers[i].vx) || 0);
      }
      tracerMeanVx = sumVx / fovCount;
    }

    let lspivRelBias = 0.0;
    if (fovCount < 2) lspivRelBias -= 0.065; // sparse tracers (Tlhomole et al. 2025)
    if (isNightScene && !irActive) lspivRelBias -= 0.45; // unlit night footage severely degrades PIV
    if (!isNightScene && glare > 0.45) lspivRelBias -= glare * 0.09;
    if (isAnySidePole && state?.showGcpGrid === false) lspivRelBias -= 0.14; // unrectified oblique perspective
    const gcpUncert = state?.showGcpGrid === false ? (isAnySidePole ? 0.065 : 0.042) : (isAnySidePole ? 0.028 : 0.024);
    const lspivNoise = (hash01(Math.floor(simClock * 4), 73) - 0.5) * 2.0 * (gcpUncert + rain * 0.03);
    const rawObservedVs =
      fovCount === 0
        ? 0.0
        : (fovCount === 1 ? tracerMeanVx * 0.85 : tracerMeanVx * 0.85 + trueVs * 0.15) *
          (1 + lspivRelBias + lspivNoise);
    const targetVs = Math.max(0, rawObservedVs);
    smoothedVs = smoothedVs === null ? targetVs : smoothedVs + (targetVs - smoothedVs) * Math.min(1, safeDt * 6);
    const estimatedVs = smoothedVs;

    const vErrorMs = estimatedVs - trueVs;
    const vPctError = trueVs > 1e-4 ? (Math.abs(vErrorMs) / trueVs) * 100 : 0;

    const wettedAreaTrueM2 = Number(hydraulicsMetrics?.wettedAreaM2 ?? (isRiver ? 10.5 : 0.01575));
    const areaFromLidar =
      typeof state?._hydraulics?.computeAreaAtWaterLevel === 'function'
        ? state._hydraulics.computeAreaAtWaterLevel(calculatedWL)
        : wettedAreaTrueM2;
    const wettedAreaM2 = Math.max(0.002, areaFromLidar);
    const k = clamp(Number(state?.velocityCoeffK ?? 0.85), 0.70, 0.95);
    const estimatedQ = k * estimatedVs * wettedAreaM2;
    const referenceQ = Number(hydraulicsMetrics?.trueVolumetricQ ?? (0.85 * trueVs * wettedAreaTrueM2));
    const qErrorM3s = estimatedQ - referenceQ;
    const qPctError = referenceQ > 1e-7 ? (Math.abs(qErrorM3s) / referenceQ) * 100 : 0;

    // 3. YOLOv8 Debris Detection, Classification & Hazard Index (edge_node/debris_detector.py)
    const yolo = evaluateYoloFrame(visibleParticles, state, isRiver);
    const coverageRatio = clamp(yolo.detections.length * (isRiver ? 0.012 : 0.014), 0, 1);
    const { hazardIndex, alertLevel } = computeHazardIndex(yolo.ns, coverageRatio, estimatedVs);

    // 4. Accumulate Phase & Day/Night Statistics (~4 Hz cadence, avoiding frame-rate bias)
    const acc = accumulators[phaseKey];
    const isNightIrBucket = isNightScene && irActive;
    if (statsClock >= 0.25) {
      statsClock = 0;
      acc.samples++;
      acc.wlSumAbsErr += wlAbsErrorM;
      acc.wlSumSqErr += wlErrorM * wlErrorM;
      acc.wlSumBias += wlErrorM;
      if (wlAbsErrorM > acc.wlMaxAbsErrM) acc.wlMaxAbsErrM = wlAbsErrorM;
      if (distPctError > acc.wlMaxPctErr) acc.wlMaxPctErr = distPctError;
      if (wlSamplePass) acc.wlPassCount++;

      acc.vSumAbsErr += Math.abs(vErrorMs);
      acc.vSumSqErr += vErrorMs * vErrorMs;
      acc.vSumBias += vErrorMs;
      acc.vSumRef += trueVs;

      if (referenceQ > 1e-6) {
        acc.qSumAbsErr += Math.abs(qErrorM3s);
        acc.qSumPctErr += qPctError;
        acc.qCount++;
      }

      acc.debrisFrames++;
      if (yolo.ns === yolo.nr) acc.debrisExactFrames++;
      acc.debrisSumAbsErr += Math.abs(yolo.ns - yolo.nr);
      acc.tpTotal += yolo.tp;
      acc.fpTotal += yolo.fp;
      acc.fnTotal += yolo.fn;

      const lightBucket = isNightIrBucket ? acc.nightIr : acc.day;
      lightBucket.frames++;
      if (yolo.ns === yolo.nr) lightBucket.exactFrames++;
      lightBucket.tp += yolo.tp;
      lightBucket.fp += yolo.fp;
      lightBucket.fn += yolo.fn;
    }

    const wlMaxAeCm = Math.max(wlAbsErrorCm, acc.wlMaxAbsErrM * 100);
    const wlMaxPct = Math.max(distPctError, acc.wlMaxPctErr);
    const wlTableXPass = !inRange
      ? false
      : trueSlantD <= 3.0
        ? wlMaxAeCm <= 6.0
        : wlMaxPct <= 2.0;

    const nSamples = Math.max(1, acc.samples);
    const wlMaeCm = (acc.wlSumAbsErr / nSamples) * 100;
    const wlRmseCm = Math.sqrt(acc.wlSumSqErr / nSamples) * 100;
    const wlBiasCm = (acc.wlSumBias / nSamples) * 100;

    const vMaeMs = acc.vSumAbsErr / nSamples;
    const vRmseMs = Math.sqrt(acc.vSumSqErr / nSamples);
    const vMeanRef = acc.vSumRef / nSamples;
    const vRrmsePct = vMeanRef > 1e-4 ? (vRmseMs / vMeanRef) * 100 : 0;

    const qMapePct = acc.qCount > 0 ? acc.qSumPctErr / acc.qCount : qPctError;

    const precisionPct =
      acc.tpTotal + acc.fpTotal > 0 ? (acc.tpTotal / (acc.tpTotal + acc.fpTotal)) * 100 : 100;
    const recallPct =
      acc.tpTotal + acc.fnTotal > 0 ? (acc.tpTotal / (acc.tpTotal + acc.fnTotal)) * 100 : 100;
    const f1Pct =
      2 * acc.tpTotal + acc.fpTotal + acc.fnTotal > 0
        ? ((2 * acc.tpTotal) / (2 * acc.tpTotal + acc.fpTotal + acc.fnTotal)) * 100
        : 100;
    const exactMatchPct = acc.debrisFrames > 0 ? (acc.debrisExactFrames / acc.debrisFrames) * 100 : 100;

    // 5. DS3231 RTC, Local SQLite/SSD Buffering & Upload / 5s Edge-LoRa Staggered Loop
    const nowDate = new Date();
    rtcDriftMs = 0.65 + 0.35 * Math.sin(simClock * 0.25);
    const rtcLabel = formatRtcLabel(nowDate);
    const rtcIso = nowDate.toISOString();

    const cycleMod = simClock % 5.0;
    const edgeStageLabel =
      archProfile === 'edge_lora'
        ? cycleMod < 1.0
          ? 'Stage 1: TF-Luna (7-Med)'
          : cycleMod < 2.5
            ? 'Stage 2: LSPIV Flow'
            : cycleMod < 4.2
              ? 'Stage 3: YOLOv8n + HI + gc()'
              : 'Stage 4: SQLite + Ra-02 TX'
        : isRiver
          ? 'Edge Capture -> Batch Post-Process'
          : 'Real-Time Server Pipeline';
    const ramUsedMb =
      archProfile === 'edge_lora'
        ? Math.round(
            cycleMod < 1.0
              ? 410
              : cycleMod < 2.5
                ? 560
                : cycleMod < 4.2
                  ? 765
                  : 445
          )
        : 390;
    const loraRssiDbm = Number((-68 - (isRiver ? 16 : 4) - rain * 6 - (H - 0.7) * 1.1).toFixed(1));
    const loraSnrDb = Number(clamp(9.8 - rain * 3.2 - (isRiver ? 1.8 : 0.0), 1.5, 11.5).toFixed(1));

    if (pipelineActive && uploadClock >= 1.0) {
      uploadClock = 0;
      acc.nExp++;
      acc.lidarExp++;
      acc.videoExp++;
      microSdRecords++;
      ssdUsedMB += isRiver ? 0.42 : 0.18;

      processingLatencyMs = Math.round(
        archProfile === 'edge_lora'
          ? 2450 + yolo.nr * 35 + hash01(acc.nExp, 11) * 180
          : isRiver
            ? 1850 + yolo.nr * 18 + hash01(acc.nExp, 11) * 160 // Obj 2B batch post-processing turnaround
            : 175 + yolo.nr * 9 + (wifiOnline ? 35 : 0) + hash01(acc.nExp, 11) * 45
      );

      const tsrPreview = acc.nExp > 0 ? (acc.nRec / acc.nExp) * 100 : 100;
      const telemetryPacket = {
        trialId: `${phaseKey === 'phase1' ? 'LAB' : 'GMB'}-${String(acc.nExp).padStart(4, '0')}`,
        phaseKey,
        timestamp: rtcIso,
        lidarDistanceM: Number(filteredDistanceM.toFixed(4)),
        waterLevelM: Number(calculatedWL.toFixed(4)),
        surfaceVelocityMs: Number(estimatedVs.toFixed(4)),
        dischargeM3s: Number(estimatedQ.toFixed(6)),
        debrisCount: yolo.ns,
        hazardIndex,
        lidarValid: readingValid,
        hasVideo: true,
        tsrPct: Number(tsrPreview.toFixed(2)),
        alerts: pendingNewAlerts,
        turbidityMode: turbidity,
        wifiOnline,
      };
      pendingNewAlerts = [];

      if (wifiOnline) {
        if (!readingValid) {
          acc.invalidCount++;
        } else {
          acc.nRec++;
          acc.lidarRec++;
          cloudSyncedRecords++;
        }
        acc.videoRec++;

        // Batch drain records buffered in SQLite/SSD crediting the phase that queued each item
        let drained = 0;
        while (offlineQueue.length > 0 && drained < 4) {
          const queuedItem = offlineQueue.shift();
          const targetAcc = accumulators[queuedItem.phaseKey] || acc;
          if (queuedItem.lidarValid !== false) {
            targetAcc.nRec++;
            targetAcc.lidarRec++;
          } else {
            targetAcc.invalidCount++;
          }
          if (queuedItem.hasVideo !== false) {
            targetAcc.videoRec++;
          }
          cloudSyncedRecords++;
          drained++;
        }
        persistStateToBrowser(false);
      } else {
        offlineQueue.push(telemetryPacket);
        if (offlineQueue.length > 200) offlineQueue.shift();
      }
    } else if (uploadClock >= 1.0) {
      uploadClock = 0;
    }

    const tsrPct = acc.nExp > 0 ? clamp((acc.nRec / acc.nExp) * 100, 0, 100) : 100;
    const lidarTsrPct = acc.lidarExp > 0 ? clamp((acc.lidarRec / acc.lidarExp) * 100, 0, 100) : 100;
    const videoTsrPct = acc.videoExp > 0 ? clamp((acc.videoRec / acc.videoExp) * 100, 0, 100) : 100;
    const missingOrInvalid = Math.max(0, acc.nExp - acc.nRec);

    // 6. Sensitivity Sweep & JCGM GUM-1:2023 RSS Uncertainty (Objective 5A / Table 7)
    latestSensitivity = computeSensitivitySweep(
      isRiver,
      trueWL,
      estimatedVs,
      wettedAreaM2,
      hydraulicsMetrics?.topWidthM,
      k,
      state?._hydraulics,
      vRrmsePct
    );

    const statusLabel = !inRange
      ? 'OUT OF RANGE'
      : lidarReading?.hitDryBank
        ? 'DRY MARGIN'
        : !readingValid
          ? 'GLARE DROPOUT'
          : signalStrengthPct < 45
            ? 'LOW SNR'
            : 'LOCKED';

    const camIncidenceDeg = Number(
      (lidarReading?.cameraIncidenceDeg ?? (isAnySidePole ? 41.0 : isRiver ? 7.2 : 0.0)).toFixed(1)
    );

    const activeMountModeKey = isRiver
      ? isLabPole
        ? 'lab_pole'
        : isSidePole
          ? 'side_pole'
          : 'bridge'
      : 'lab_gantry';

    const loraPayload = encodeLoRa12BytePayload({
      nodeId: 1,
      waterLevelM: calculatedWL,
      velocityMs: estimatedVs,
      dischargeM3s: estimatedQ,
      hazardIndex,
      debrisCount: yolo.ns,
    });

    // Compute Email Alert delivery metrics (Obj 4E)
    const deliveredAlerts = alertLog.filter((a) => String(a.deliveryStatus || '').includes('DELIVERED'));
    const alertDeliveryRatePct = alertLog.length > 0 ? (deliveredAlerts.length / alertLog.length) * 100 : 100;
    const alertMeanDelayMs = deliveredAlerts.length > 0
      ? Math.round(deliveredAlerts.reduce((s, a) => s + (Number(a.deliveryDelayMs) || 0), 0) / deliveredAlerts.length)
      : 0;

    const snapshot = {
      phase: phaseKey,
      mode,
      rtcTimestamp: rtcIso,
      rtcLocalLabel: rtcLabel,
      rtcDriftMs: Number(rtcDriftMs.toFixed(2)),
      pipelineActive,
      wifiOnline,
      mounting: {
        mode: activeMountModeKey,
        label: !isRiver
          ? 'Lab PVC Gantry'
          : isLabPole
            ? 'Lab-Style Side Pole'
            : isSidePole
              ? 'Riverbank Side-Pole'
              : 'Overhead Bridge Mount',
        heightM: Number(H.toFixed(2)),
        lidarIncidenceDeg: Number(thetaDeg.toFixed(1)),
        cameraIncidenceDeg: camIncidenceDeg,
        rawLaserDistanceM: Number(rawLaserDistanceM.toFixed(3)),
        compensatedDistanceM: Number(filteredDistanceM.toFixed(3)),
        slantCompEnabled: slantComp,
        gcpLayout: isRiver ? (isAnySidePole ? 'Trapezoidal (H_gcp)' : 'Symmetric Ortho') : 'Fixed Frame',
        hitDryBank: Boolean(lidarReading?.hitDryBank),
      },
      lidar: {
        seqTick: lidarSeqTick,
        heightM: H,
        distanceM: filteredDistanceM,
        rawLaserDistanceM,
        distanceCm: Number((filteredDistanceM * 100).toFixed(1)),
        rawDistanceCm: Number((rawDistanceM * 100).toFixed(1)),
        signalStrengthPct: Math.round(signalStrengthPct),
        valid: readingValid,
        inRange,
        statusLabel,
        waveformCm: distanceWaveform.slice(),
        histogramBins: signalHistogram.slice(),
      },
      waterLevel: {
        calculatedM: calculatedWL,
        referenceM: trueWL,
        errorM: wlErrorM,
        absErrorCm: wlAbsErrorCm,
        maxAbsErrorCm: wlMaxAeCm,
        percentError: distPctError,
        maeCm: wlMaeCm,
        rmseCm: wlRmseCm,
        meanBiasCm: wlBiasCm,
        tableXPass: wlTableXPass,
        tableXRule,
      },
      velocity: {
        estimatedVs,
        referenceVr: trueVs,
        errorMs: vErrorMs,
        percentError: vPctError,
        maeMs: vMaeMs,
        rmseMs: vRmseMs,
        rRrmsePct: vRrmsePct,
        tableXPass: vRrmsePct <= 20.0,
        tableXRule: 'rRMSE <= 20%',
      },
      discharge: {
        estimatedQ,
        referenceQ,
        wettedAreaM2,
        referenceAreaM2: wettedAreaTrueM2,
        velocityCoeffK: k,
        errorM3s: qErrorM3s,
        percentError: qPctError,
        mapePct: qMapePct,
        tableXPass: phaseKey === 'phase1' ? qMapePct <= 10.0 : true,
        tableXRule: phaseKey === 'phase1' ? 'MAPE <= 10%' : 'Sensitivity (Obj 5A)',
        independentRefAvailable: phaseKey === 'phase1' || Boolean(state?.independentFieldRef),
      },
      debris: {
        systemCountNs: yolo.ns,
        manualCountNr: yolo.nr,
        countError: Math.abs(yolo.ns - yolo.nr),
        tp: yolo.tp,
        fp: yolo.fp,
        fn: yolo.fn,
        precisionPct,
        recallPct,
        f1Pct,
        exactMatchFrame: yolo.ns === yolo.nr,
        exactMatchPct,
        hazardIndex,
        alertLevel,
        tableXPass: exactMatchPct >= 90.0,
        tableXRule: '>= 90% exact match',
        detections: yolo.detections,
        missed: yolo.missed,
      },
      edgeStorage: {
        architectureProfile: archProfile,
        wifiOnline,
        queuedCount: offlineQueue.length,
        microSdRecords,
        cloudSyncedRecords,
        ssdUsedMB: Number(ssdUsedMB.toFixed(1)),
        expectedRecords: acc.nExp,
        receivedRecords: acc.nRec,
        missingOrInvalid,
        tsrPct,
        lidarTsrPct,
        videoTsrPct,
        tableXPass: lidarTsrPct >= 90.0 && videoTsrPct >= 90.0,
        tableXRule: 'TSR >= 90% (LiDAR & Video)',
        processingLatencyMs,
        processingMode: archProfile === 'edge_lora' ? '5s Staggered 1GB Edge' : isRiver ? 'Batch Post-Process' : 'Real-Time (Lab)',
        edgeStageLabel,
        ramUsedMb,
        loraRssiDbm,
        loraSnrDb,
        uploadStatus: !wifiOnline
          ? `BUFFERING (${offlineQueue.length})`
          : offlineQueue.length > 0
            ? `SYNCING (${offlineQueue.length})`
            : lastUploadOk
              ? 'LOCAL SYNCED'
              : 'MEMORY SYNCED',
      },
      functionalityChecks: [
        {
          name: 'Data acquisition',
          criterion: 'Reading & video logged on schedule',
          status: pipelineActive ? 'PASS' : 'PAUSED',
          tested: Math.max(1, acc.nExp),
          passed: Math.max(1, acc.lidarRec),
        },
        {
          name: 'Timestamping',
          criterion: 'DS3231 RTC drift < 100 ms',
          status: Math.abs(rtcDriftMs) < 100 ? 'PASS' : 'FAIL',
          tested: Math.max(1, acc.nExp),
          passed: Math.max(1, acc.nExp),
        },
        {
          name: 'Server-side processing',
          criterion: 'WL, Vs, Q & YOLOv8 outputs ready',
          status: readingValid ? 'PASS' : 'DEGRADED',
          tested: Math.max(1, acc.samples),
          passed: Math.max(0, acc.samples - acc.invalidCount),
        },
        {
          name: 'Database storage',
          criterion: 'Local SQLite & remote sync match',
          status: wifiOnline ? 'PASS' : 'BUFFERED',
          tested: Math.max(1, acc.nExp),
          passed: Math.max(1, acc.nRec),
        },
        {
          name: 'Dashboard display',
          criterion: 'HUD metrics match telemetry store',
          status: 'PASS',
          tested: Math.max(1, acc.samples),
          passed: Math.max(1, acc.samples),
        },
      ],
      loraPayload,
      alertsMeta: {
        total: alertLog.length,
        delivered: deliveredAlerts.length,
        deliveryRatePct: Number(alertDeliveryRatePct.toFixed(1)),
        meanDelayMs: alertMeanDelayMs,
        tableXPass: alertDeliveryRatePct >= 90.0,
      },
      alerts: alertLog.slice(0, 20),
      newAlerts: [],
    };

    // 7. Threshold Monitoring & Email Alert Evaluation
    const newAlerts = pipelineActive ? evaluateThresholds(snapshot, state, isRiver, wifiOnline) : [];
    if (newAlerts.length > 0) {
      snapshot.newAlerts = newAlerts;
      snapshot.alerts = alertLog.slice(0, 20);
      pendingNewAlerts.push(...newAlerts);
      persistStateToBrowser(true);
    }

    // 8. Automatic Thesis Trial Logging (first settled reading + every ~4.5s)
    if (
      pipelineActive &&
      (trialLogs[phaseKey].length === 0 || trialCaptureClock >= 4.5)
    ) {
      trialCaptureClock = 0;
      recordTrialRow(phaseKey, snapshot, state);
    }

    latestSnapshot = snapshot;
    return snapshot;
  }

  function getSnapshot() {
    return latestSnapshot;
  }

  function getTrialLogs() {
    return {
      phase1: trialLogs.phase1.slice(),
      phase2: trialLogs.phase2.slice(),
      stats: {
        phase1: summarizeStats(accumulators.phase1),
        phase2: summarizeStats(accumulators.phase2),
      },
      alerts: alertLog.slice(),
    };
  }

  function summarizeLightBucket(b) {
    const tp = b?.tp || 0;
    const fp = b?.fp || 0;
    const fn = b?.fn || 0;
    const frames = b?.frames || 0;
    const exact = b?.exactFrames || 0;
    return {
      frames,
      exactMatchPct: frames > 0 ? (exact / frames) * 100 : 100,
      precisionPct: tp + fp > 0 ? (tp / (tp + fp)) * 100 : 100,
      recallPct: tp + fn > 0 ? (tp / (tp + fn)) * 100 : 100,
      f1Pct: 2 * tp + fp + fn > 0 ? ((2 * tp) / (2 * tp + fp + fn)) * 100 : 100,
    };
  }

  function summarizeStats(acc) {
    const n = Math.max(1, acc.samples);
    const vMean = acc.vSumRef / n;
    const vRmse = Math.sqrt(acc.vSumSqErr / n);
    return {
      samples: acc.samples,
      wlMaeCm: (acc.wlSumAbsErr / n) * 100,
      wlRmseCm: Math.sqrt(acc.wlSumSqErr / n) * 100,
      wlBiasCm: (acc.wlSumBias / n) * 100,
      wlMaxAeCm: acc.wlMaxAbsErrM * 100,
      wlMaxPctErr: acc.wlMaxPctErr || 0,
      vMaeMs: acc.vSumAbsErr / n,
      vRmseMs: vRmse,
      vRrmsePct: vMean > 1e-4 ? (vRmse / vMean) * 100 : 0,
      qMapePct: acc.qCount > 0 ? acc.qSumPctErr / acc.qCount : 0,
      precisionPct: acc.tpTotal + acc.fpTotal > 0 ? (acc.tpTotal / (acc.tpTotal + acc.fpTotal)) * 100 : 100,
      recallPct: acc.tpTotal + acc.fnTotal > 0 ? (acc.tpTotal / (acc.tpTotal + acc.fnTotal)) * 100 : 100,
      f1Pct:
        2 * acc.tpTotal + acc.fpTotal + acc.fnTotal > 0
          ? ((2 * acc.tpTotal) / (2 * acc.tpTotal + acc.fpTotal + acc.fnTotal)) * 100
          : 100,
      exactMatchPct: acc.debrisFrames > 0 ? (acc.debrisExactFrames / acc.debrisFrames) * 100 : 100,
      day: summarizeLightBucket(acc.day),
      nightIr: summarizeLightBucket(acc.nightIr),
      tsrPct: acc.nExp > 0 ? (acc.nRec / acc.nExp) * 100 : 100,
      lidarTsrPct: acc.lidarExp > 0 ? (acc.lidarRec / acc.lidarExp) * 100 : 100,
      videoTsrPct: acc.videoExp > 0 ? (acc.videoRec / acc.videoExp) * 100 : 100,
      nExp: acc.nExp || 0,
      lidarRec: acc.lidarRec || 0,
      videoRec: acc.videoRec || 0,
      invalidCount: acc.invalidCount || 0,
    };
  }

  function getSensitivityData() {
    return latestSensitivity;
  }

  function captureTrial(state = {}) {
    const phaseKey = latestSnapshot.phase || 'phase1';
    return recordTrialRow(phaseKey, latestSnapshot, state);
  }

  function resetLogs() {
    trialLogs.phase1.length = 0;
    trialLogs.phase2.length = 0;
    alertLog.length = 0;
    pendingNewAlerts.length = 0;
    offlineQueue.length = 0;
    accumulators = {
      phase1: createPhaseAccumulator(),
      phase2: createPhaseAccumulator(),
    };
    microSdRecords = 0;
    cloudSyncedRecords = 0;
    distanceWaveform.length = 0;
    lidarWindow.length = 0;
    trialCounters.phase1 = 0;
    trialCounters.phase2 = 0;
    alertSeq = 1;
    for (const k of Object.keys(lastAlertTimeByParam)) {
      lastAlertTimeByParam[k] = -999;
    }
    clearPersistedStore();
  }

  function triggerTestAlert(state = {}) {
    const isRiver = state?.mode === 'river';
    const snap = latestSnapshot || buildInitialSnapshot();
    const wifiOnline = state?.wifiOnline !== false;
    const defaults = getDefaultThresholds(isRiver ? 'river' : 'lab');
    const thresh = Number(state?.thresholds?.dischargeM3s ?? defaults.dischargeM3s);
    const testVal = isRiver ? Math.max(31.4, thresh * 1.15) : Math.max(0.00175, thresh * 1.12);
    const delayMs = wifiOnline ? Math.round(280 + hash01(alertSeq, 17) * 240) : 0;
    const alertObj = {
      id: `ALT-${String(alertSeq++).padStart(3, '0')}`,
      phase: isRiver ? 'phase2' : 'phase1',
      timestamp: snap.rtcLocalLabel || formatRtcLabel(new Date()),
      isoTimestamp: snap.rtcTimestamp || new Date().toISOString(),
      parameterKey: 'dischargeM3s',
      parameter: 'Discharge (Q)',
      value: Number(testVal.toFixed(isRiver ? 2 : 5)),
      threshold: Number(thresh.toFixed(isRiver ? 2 : 5)),
      unit: 'm³/s',
      severity: 'CRITICAL',
      recipient: isRiver ? 'guimbal-drrmo@iloilo.gov.ph' : 'lab-monitor@usa.edu.ph',
      subject: `[CRITICAL] Simulated Discharge Breach (${testVal.toFixed(isRiver ? 2 : 5)} m³/s)`,
      message: `Manual threshold verification alert triggered in ${isRiver ? 'Guimbal River, Iloilo' : 'Controlled Lab Tank'}.`,
      deliveryStatus: wifiOnline ? 'DELIVERED' : 'QUEUED (NO WIFI)',
      deliveryDelayMs: delayMs,
    };
    alertLog.unshift(alertObj);
    if (alertLog.length > 50) alertLog.length = 50;
    pendingNewAlerts.push(alertObj);
    persistStateToBrowser(true);
    return alertObj;
  }

  return {
    step,
    getSnapshot,
    getTrialLogs,
    getSensitivityData,
    captureTrial,
    triggerTestAlert,
    resetLogs,
  };
}

export { getDefaultThresholds, createPipelineModel, crc16Ccitt, computeHazardIndex, encodeLoRa12BytePayload };
