/**
 * Phase 2: Guimbal River, Iloilo Open-Channel Hydraulics Twin
 * Coordinates: 1 unit = 1 meter, Y-up, +X downstream, Z cross-section [-10, +10].
 * Pier at (x = 0, z = -4.2), Sensor transect at x = 0.8, Staff Gauge at (1.5, -5.4).
 */

const PRESET_STAGE_M = {
  baseflow: 0.55,
  normal: 1.15,
  monsoon: 1.95,
  flood: 2.65,
};

const PIER_POS = { x: 0.0, z: -4.2, halfWidth: 0.42 };
const HYDROGRAPH_PERIOD_S = 36.0;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function createSeededRng(seed = 8080) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Default asymmetric surveyed bathymetry fallback if riverField.getBedHeightAtZ is not supplied
function defaultGuimbalBedHeight(z) {
  const az = Math.abs(z);
  if (az >= 6.0) return 3.20;
  const shifted = z - 0.25;
  const innerBowl = 0.92 * Math.pow(clamp(Math.abs(shifted) / 5.45, 0, 1.05), 1.95);
  const cobbleBar =
    z < -1.5 && z > -5.1 ? 0.11 * Math.exp(-Math.pow((z + 3.4) / 1.1, 2)) : 0;
  const wallT = clamp((az - 5.42) / (6.0 - 5.42), 0, 1);
  const wallSmooth = wallT * wallT * (3 - 2 * wallT);
  const microBed = (0.024 * Math.sin(az * 2.0) + 0.012 * Math.cos(z * 3.1)) * (1 - wallSmooth);
  const bedFloor = innerBowl + cobbleBar + microBed;
  return clamp(bedFloor + (3.20 - bedFloor) * wallSmooth, 0.0, 3.20);
}

/**
 * Skewed storm hydrograph pulse (rising limb -> flood peak -> exponential recession).
 * Returns { stageM, dhDtNorm } where dhDtNorm > 0 during rising limb.
 */
function evaluateHydrograph(tSec) {
  const phase = ((tSec % HYDROGRAPH_PERIOD_S) + HYDROGRAPH_PERIOD_S) % HYDROGRAPH_PERIOD_S;
  const u = phase / HYDROGRAPH_PERIOD_S; // 0..1
  // Continuous skewed storm hydrograph pulse (pulse(0) == pulse(1) == 0, peak at u = 0.34)
  let pulse = 0;
  let dPulse = 0;
  if (u < 0.06) {
    const s = u / 0.06;
    pulse = 0.03 * (s * s * (3 - 2 * s));
    dPulse = 0.12 * s;
  } else if (u < 0.34) {
    const s = (u - 0.06) / 0.28;
    pulse = 0.03 + 0.97 * (s * s * (3 - 2 * s));
    dPulse = 6 * s * (1 - s);
  } else {
    const s = (u - 0.34) / 0.66;
    const decay = Math.exp(-3.4 * s);
    const tail = Math.exp(-3.4);
    const taper = (decay - tail) / (1 - tail);
    pulse = Math.max(0, taper * (1 - 0.08 * s * s));
    dPulse = -0.85 * Math.sin(Math.PI * clamp(s, 0, 1)) * (0.35 + 0.65 * (1 - s));
  }
  const stageM = 0.62 + 2.13 * clamp(pulse, 0, 1);
  return { stageM, dhDtNorm: clamp(dPulse, -1, 1), hydroPhase: u };
}

function createRealRiverHydraulics(getBedHeightAtZ) {
  const bedFn = typeof getBedHeightAtZ === 'function' ? getBedHeightAtZ : defaultGuimbalBedHeight;
  const rng = createSeededRng(2026);

  const Z_MIN = -10.0;
  const Z_MAX = 10.0;
  const NUM_SLICES = 240;
  const DZ = (Z_MAX - Z_MIN) / NUM_SLICES;

  // Pre-sample bed profile across z in [-10, +10]
  const zGrid = new Float64Array(NUM_SLICES + 1);
  const bedGrid = new Float64Array(NUM_SLICES + 1);
  for (let i = 0; i <= NUM_SLICES; i++) {
    const z = Z_MIN + i * DZ;
    zGrid[i] = z;
    bedGrid[i] = bedFn(z);
  }

  let simTime = 0;
  let hydroClock = 0;
  let lastExternalHydroTime = null;
  let lastPreset = 'normal';
  let lastSliderStage = 1.15;

  const TRUE_RIVER_K = 0.85;
  const CHANNEL_HALF_W = 6.0;
  let currentWL = 1.15;
  let manningN = 0.035;
  let channelSlope = 0.0022;
  let rainIntensity = 0.0;
  let windChop = 0.15;
  let turbidityMode = 'silty';

  let wettedArea = 0;
  let wettedPerimeter = 0;
  let hydraulicRadius = 0;
  let topWidth = 0;
  let leftEdgeZ = -4.5;
  let rightEdgeZ = 4.5;
  let meanVelocityV = 0;
  let surfaceVelocityVs = 0;
  let dischargeQ = 0;
  let maxDepth = 0;
  let thalwegSurfaceVel = 0;
  let shapeNormFactor = 1.0;
  let hydroRisingBoost = 1.0;
  let hydroPhase = 0;
  let bridgeActive = true;

  // Riverine debris particles
  let nextDebrisId = 1;
  const particles = [];
  const DEBRIS_TYPES = ['bottle', 'bag', 'branch', 'leaf', 'foam'];

  function pickWettedZ() {
    // Rejection-sample z within wetted channel, preferring main central flow
    const span = Math.max(0.6, rightEdgeZ - leftEdgeZ - 0.35);
    const center = 0.5 * (leftEdgeZ + rightEdgeZ);
    for (let attempt = 0; attempt < 8; attempt++) {
      // Blend uniform + central thalweg bias
      const r = rng() < 0.65 ? (rng() + rng()) * 0.5 - 0.5 : rng() - 0.5;
      const z = center + r * span;
      if (currentWL - bedFn(z) > 0.09) {
        return z;
      }
    }
    return clamp(0.25 + (rng() - 0.5) * 1.2, leftEdgeZ + 0.2, rightEdgeZ - 0.2);
  }

  function spawnRiverDebris(distributeAlongX = false) {
    const id = nextDebrisId++;
    const type = DEBRIS_TYPES[Math.floor(rng() * DEBRIS_TYPES.length)];
    const size =
      type === 'branch'
        ? 0.45 + rng() * 0.45
        : type === 'foam'
          ? 0.22 + rng() * 0.20
          : type === 'bag'
            ? 0.24 + rng() * 0.14
            : type === 'leaf'
              ? 0.22 + rng() * 0.15
              : 0.19 + rng() * 0.08;

    const x = distributeAlongX ? -13.5 + rng() * 27.0 : -14.0 + rng() * 1.4;
    const z = pickWettedZ();
    const vx = Math.max(0.2, getVelocityAtZ(z, x));
    return {
      id,
      type,
      size,
      x,
      y: currentWL,
      z,
      vx,
      vy: 0,
      vz: (rng() - 0.5) * 0.04,
      rotY: rng() * Math.PI * 2,
      rotZ: 0,
      phase: rng() * Math.PI * 2,
      age: 0,
      inFov: false,
    };
  }

  function integrateZones(wl, includePier = bridgeActive) {
    let areaLeft = 0;
    let perimLeft = 0;
    let areaMain = 0;
    let perimMain = 0;
    let areaRight = 0;
    let perimRight = 0;
    let width = 0;
    let minSubZ = Z_MAX;
    let maxSubZ = Z_MIN;
    let deepMax = 0;

    const pierMinZ = PIER_POS.z - PIER_POS.halfWidth;
    const pierMaxZ = PIER_POS.z + PIER_POS.halfWidth;

    for (let i = 0; i < NUM_SLICES; i++) {
      const z0 = zGrid[i];
      const z1 = zGrid[i + 1];
      const b0 = bedGrid[i];
      const b1 = bedGrid[i + 1];
      const d0 = wl - b0;
      const d1 = wl - b1;

      if (d0 <= 0 && d1 <= 0) continue;

      if (d0 > deepMax) deepMax = d0;
      if (d1 > deepMax) deepMax = d1;

      let subArea = 0;
      let subPerim = 0;
      let subWidth = 0;
      let zLo = z0;
      let zHi = z1;

      if (d0 >= 0 && d1 >= 0) {
        subArea = 0.5 * (d0 + d1) * DZ;
        subPerim = Math.hypot(DZ, b1 - b0);
        subWidth = DZ;
      } else if (d0 > 0 && d1 <= 0) {
        const frac = d0 / (d0 - d1);
        const subDz = DZ * frac;
        subArea = 0.5 * d0 * subDz;
        subPerim = Math.hypot(subDz, wl - b0);
        subWidth = subDz;
        zHi = z0 + subDz;
      } else {
        const frac = d1 / (d1 - d0);
        const subDz = DZ * frac;
        subArea = 0.5 * d1 * subDz;
        subPerim = Math.hypot(subDz, b1 - wl);
        subWidth = subDz;
        zLo = z1 - subDz;
      }

      if (zLo < minSubZ) minSubZ = zLo;
      if (zHi > maxSubZ) maxSubZ = zHi;
      width += subWidth;

      const zMid = 0.5 * (z0 + z1);
      if (zMid < -CHANNEL_HALF_W) {
        areaLeft += subArea;
        perimLeft += subPerim;
      } else if (zMid > CHANNEL_HALF_W) {
        areaRight += subArea;
        perimRight += subPerim;
      } else {
        let keepFrac = 1.0;
        if (includePier) {
          const ov = Math.max(0, Math.min(zHi, pierMaxZ) - Math.max(zLo, pierMinZ));
          keepFrac = clamp(1.0 - ov / Math.max(1e-6, subWidth), 0, 1);
        }
        areaMain += subArea * keepFrac;
        perimMain += subPerim * keepFrac;
        if (includePier && keepFrac < 0.01) {
          width = Math.max(0.2, width - (subWidth - subWidth * keepFrac));
        }
      }
    }

    if (includePier) {
      const pierSubDepth = Math.max(0, wl - bedFn(PIER_POS.z));
      if (pierSubDepth > 0) {
        perimMain += 2.0 * pierSubDepth;
      }
    }

    const area = Math.max(0.05, areaLeft + areaMain + areaRight);
    const perimeter = Math.max(0.2, perimLeft + perimMain + perimRight);
    return {
      areaLeft,
      perimLeft,
      areaMain,
      perimMain,
      areaRight,
      perimRight,
      area,
      perimeter,
      width: Math.max(0.2, width),
      minSubZ,
      maxSubZ,
      deepMax: Math.max(0.05, deepMax),
    };
  }

  function computeAreaAtWaterLevel(wl) {
    return integrateZones(Number(wl) || 0, bridgeActive).area;
  }

  function integrateCrossSection(wl) {
    const zRes = integrateZones(wl, bridgeActive);
    wettedArea = zRes.area;
    wettedPerimeter = zRes.perimeter;
    hydraulicRadius = wettedArea / wettedPerimeter;
    topWidth = zRes.width;
    leftEdgeZ = zRes.minSubZ < zRes.maxSubZ ? zRes.minSubZ : -0.5;
    rightEdgeZ = zRes.minSubZ < zRes.maxSubZ ? zRes.maxSubZ : 0.5;
    maxDepth = zRes.deepMax;

    // 3-zone divided-channel Manning conveyance: K = K_main + K_left + K_right
    const nMain = manningN;
    const nOverbank = manningN * 1.45;
    const zoneConveyance = (a, p, n) => (a > 1e-5 && p > 1e-4 ? (1.0 / n) * a * Math.pow(a / p, 2 / 3) : 0);
    const kTotal =
      zoneConveyance(zRes.areaMain, zRes.perimMain, nMain) +
      zoneConveyance(zRes.areaLeft, zRes.perimLeft, nOverbank) +
      zoneConveyance(zRes.areaRight, zRes.perimRight, nOverbank);

    dischargeQ = kTotal * Math.sqrt(channelSlope) * hydroRisingBoost;
    meanVelocityV = dischargeQ / wettedArea;
    // Physical surface-to-mean factor fixed at TRUE_RIVER_K so slider k_est drives honest calibration sensitivity
    surfaceVelocityVs = meanVelocityV / TRUE_RIVER_K;

    // Normalize surface velocity profile at undisturbed upstream transect x = -2.0
    let sumWeight = 0;
    let sumRawWeighted = 0;
    let maxRaw = 0;
    for (let i = 0; i <= NUM_SLICES; i++) {
      const z = zGrid[i];
      const d = Math.max(0, wl - bedGrid[i]);
      if (d <= 0) continue;
      const raw = rawLateralShape(z, d, -2.0);
      sumWeight += d;
      sumRawWeighted += d * raw;
      if (raw > maxRaw) maxRaw = raw;
    }
    const meanRaw = sumWeight > 0 ? sumRawWeighted / sumWeight : 1.0;
    shapeNormFactor = meanRaw > 1e-4 ? surfaceVelocityVs / meanRaw : 1.0;
    thalwegSurfaceVel = maxRaw * shapeNormFactor;
  }

  function rawLateralShape(z, depth, x = 0.8) {
    if (depth <= 0.005) return 0;
    const wallFriction = 1.0 - Math.exp(-depth / 0.22);
    const depthProfile = Math.pow(depth, 0.55) * wallFriction;
    // Wake reduction downstream behind bridge pier at (x = 0, z = -4.2) when bridge is present
    let pierWake = 1.0;
    if (bridgeActive && x >= -0.4) {
      const dxDown = Math.max(0, x - PIER_POS.x);
      const decay = Math.exp(-dxDown * 0.14);
      const wakeWidth = 0.52 + 0.06 * dxDown;
      const dzPier = z - PIER_POS.z;
      pierWake = 1.0 - 0.62 * decay * Math.exp(-(dzPier * dzPier) / (wakeWidth * wakeWidth));
    }
    return depthProfile * pierWake;
  }

  function getVelocityAtZ(z, x = 0.8) {
    const bed = bedFn(z);
    const depth = currentWL - bed;
    if (depth <= 0.005) return 0;
    return rawLateralShape(z, depth, x) * shapeNormFactor;
  }

  function sampleSurface(x, z) {
    const depth = Math.max(0, currentWL - bedFn(z));
    const tDamp = clamp(depth / 0.45, 0, 1);
    const shallowDamp = tDamp * tDamp * (3 - 2 * tDamp);
    const chopAmp = (0.010 + 0.036 * windChop + 0.015 * rainIntensity) * shallowDamp;
    const w1 = Math.sin(x * 1.15 - simTime * 2.8 + z * 0.45);
    const w2 = Math.cos(z * 1.65 + simTime * 2.2 - x * 0.35);
    const w3 = Math.sin((x + z) * 2.4 - simTime * 3.9);
    return currentWL + (w1 * 0.5 + w2 * 0.32 + w3 * 0.18) * chopAmp;
  }

  function updateParticles(dt, targetCount, mountMode = 'bridge') {
    const desired = Math.round(clamp(targetCount, 0, 25));
    while (particles.length < desired) {
      particles.push(spawnRiverDebris(particles.length < desired * 0.7));
    }
    if (particles.length > desired) {
      particles.length = desired;
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age += dt;

      const localVel = Math.max(0.12, getVelocityAtZ(p.z, p.x));
      p.vx += (localVel - p.vx) * Math.min(1, dt * 4);

      // Gentle river turbulence meander + pull back from dry banks
      const centerZ = 0.5 * (leftEdgeZ + rightEdgeZ);
      const safeMargin = Math.max(0.35, p.size * 0.9);
      let lateralForce = Math.sin(simTime * 0.8 + p.phase + p.x * 0.35) * 0.06 * (0.5 + windChop);

      const dLocal = currentWL - bedFn(p.z);
      if (dLocal < 0.14) {
        lateralForce += Math.sign(centerZ - p.z) * 0.35;
      }

      // Hard streamline deflection + solid exclusion around bridge pier (x = 0, z = -4.2)
      if (mountMode === 'bridge') {
        const dxPier = p.x - PIER_POS.x;
        const dzPier = p.z - PIER_POS.z;
        const rMin = 0.48 + (p.size || 0.25) * 0.45;
        if (Math.abs(dxPier) < 1.35 && Math.abs(dzPier) < 1.15) {
          const dist = Math.hypot(dxPier, dzPier);
          if (dist < 1.08 && dist > 1e-4) {
            const pushZ = dzPier >= 0 ? 1 : -1;
            lateralForce += pushZ * (1.08 - dist) * 1.4;
          }
          if (dist < rMin && dist > 1e-4) {
            const nx = dxPier / dist;
            const nz = dzPier / dist;
            p.x = PIER_POS.x + nx * rMin;
            p.z = PIER_POS.z + nz * rMin;
            if (p.vx * nx + p.vz * nz < 0) {
              p.vz += Math.sign(nz || 1) * 0.45;
            }
          }
        }
      }

      p.vz += (lateralForce - p.vz) * Math.min(1, dt * 3);
      p.x += p.vx * dt;
      p.z = clamp(p.z + p.vz * dt, leftEdgeZ + safeMargin, rightEdgeZ - safeMargin);
      p.y = sampleSurface(p.x, p.z) + 0.015;
      const slopeY = (sampleSurface(p.x + 0.12, p.z) - sampleSurface(p.x - 0.12, p.z)) / 0.24;
      p.rotZ = Math.atan(slopeY) * 0.65;
      p.rotY += (0.25 * Math.sin(simTime * 1.3 + p.phase) + p.vz * 0.8) * dt;

      // Recycle downstream debris back upstream
      if (p.x > 14.2) {
        p.x = -14.0 - rng() * 0.8;
        p.z = pickWettedZ();
        p.vx = Math.max(0.18, getVelocityAtZ(p.z, p.x));
        p.vz = 0;
        p.age = 0;
      }

      // Active camera FOV footprint check (Bridge Nadir vs Side-Pole / Lab-Style Side Pole Oblique Trapezoid)
      if (mountMode === 'lab_pole') {
        const tZ = clamp((p.z - (-3.55)) / 8.35, 0, 1);
        const halfSpanX = 1.95 + tZ * 1.8;
        p.inFov = p.z >= -3.8 && p.z <= 5.4 && Math.abs(p.x - 2.145) <= halfSpanX;
      } else if (mountMode === 'side_pole') {
        const tZ = clamp((p.z - (-4.6)) / 9.2, 0, 1);
        const halfSpanX = 2.2 + tZ * 1.6;
        p.inFov = p.z >= -4.2 && p.z <= 4.6 && Math.abs(p.x - 2.10) <= halfSpanX;
      } else {
        p.inFov = p.x >= -1.4 && p.x <= 2.9 && p.z >= -2.1 && p.z <= 1.8;
      }
    }
  }

  function update(dt, state = {}) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    simTime += clampedDt;

    const preset = state.riverStagePreset || lastPreset;
    manningN = clamp(state.manningN !== undefined ? Number(state.manningN) : 0.035, 0.015, 0.09);
    channelSlope = clamp(
      state.channelSlope !== undefined ? Number(state.channelSlope) : 0.0022,
      0.0002,
      0.02
    );
    rainIntensity = clamp(state.rainIntensity !== undefined ? Number(state.rainIntensity) : 0, 0, 1);
    windChop = clamp(state.windChop !== undefined ? Number(state.windChop) : 0.15, 0, 1);
    turbidityMode = state.turbidityMode || 'silty';
    const debrisTarget = state.debrisCountTarget !== undefined ? Number(state.debrisCountTarget) : 12;

    let targetStageM = currentWL;

    if (preset === 'hydrograph') {
      // Support external hydrographTime if actively driven, else run internal clock
      if (
        state.hydrographTime !== undefined &&
        state.hydrographTime !== null &&
        Number.isFinite(Number(state.hydrographTime)) &&
        lastExternalHydroTime !== null &&
        Math.abs(Number(state.hydrographTime) - lastExternalHydroTime) > 1e-5
      ) {
        hydroClock = Number(state.hydrographTime);
      } else {
        hydroClock += clampedDt;
      }
      if (state.hydrographTime !== undefined && state.hydrographTime !== null) {
        lastExternalHydroTime = Number(state.hydrographTime);
      }
      const hydro = evaluateHydrograph(hydroClock);
      targetStageM = hydro.stageM;
      hydroPhase = hydro.hydroPhase;
      hydroRisingBoost = 1.0 + Math.max(0, hydro.dhDtNorm) * 0.08;
    } else {
      hydroRisingBoost = 1.0;
      const sliderStage =
        state.riverStageM !== undefined ? clamp(Number(state.riverStageM), 0.25, 3.3) : null;
      if (preset !== lastPreset && PRESET_STAGE_M[preset] !== undefined) {
        targetStageM = PRESET_STAGE_M[preset];
        state.riverStageM = targetStageM;
        lastSliderStage = targetStageM;
      } else if (sliderStage !== null && Math.abs(sliderStage - lastSliderStage) > 1e-4) {
        targetStageM = sliderStage;
        lastSliderStage = sliderStage;
      } else if (sliderStage !== null) {
        targetStageM = sliderStage;
      } else if (PRESET_STAGE_M[preset] !== undefined) {
        targetStageM = PRESET_STAGE_M[preset];
      }
    }

    lastPreset = preset;

    const mountMode =
      state.riverMountMode === 'lab_pole'
        ? 'lab_pole'
        : state.riverMountMode === 'side_pole'
          ? 'side_pole'
          : 'bridge';
    bridgeActive = mountMode === 'bridge';

    // Smooth hydraulic stage adjustment
    currentWL += (targetStageM - currentWL) * Math.min(1, clampedDt * 3.5);
    integrateCrossSection(currentWL);
    updateParticles(clampedDt, debrisTarget, mountMode);
  }

  // Initialize geometry metrics immediately before first update()
  integrateCrossSection(currentWL);
  for (let i = 0; i < 12; i++) {
    particles.push(spawnRiverDebris(true));
  }

  function getCrossSectionProfile() {
    const profile = [];
    for (let i = 0; i <= NUM_SLICES; i += 2) {
      const z = zGrid[i];
      const bedY = bedGrid[i];
      const depth = Math.max(0, currentWL - bedY);
      profile.push({
        z,
        bedY,
        waterY: currentWL,
        depth,
        velocityMs: getVelocityAtZ(z, 0.8),
        submerged: depth > 0.005,
      });
    }
    return {
      samples: profile,
      waterLevelM: currentWL,
      wettedAreaM2: wettedArea,
      wettedPerimeterM: wettedPerimeter,
      hydraulicRadiusM: hydraulicRadius,
      topWidthM: topWidth,
      leftEdgeZ,
      rightEdgeZ,
    };
  }

  function getMetrics() {
    return {
      phase: 'river',
      simTime,
      riverStagePreset: lastPreset,
      hydrographTime: hydroClock,
      hydroPhase,
      waterLevelM: currentWL,
      wettedAreaM2: wettedArea,
      wettedPerimeterM: wettedPerimeter,
      hydraulicRadiusM: hydraulicRadius,
      topWidthM: topWidth,
      leftEdgeZ,
      rightEdgeZ,
      maxDepthM: maxDepth,
      manningN,
      channelSlope,
      velocityCoeffK: TRUE_RIVER_K,
      meanVelocityV,
      thalwegSurfaceVel,
      trueSurfaceVelocity: surfaceVelocityVs,
      trueVolumetricQ: dischargeQ,
      rainIntensity,
      windChop,
      rippleAmp: 0.008 + 0.032 * windChop + 0.015 * rainIntensity,
      turbidityMode,
      debrisActiveCount: particles.filter((p) => p.inFov).length,
    };
  }

  function getParticles() {
    return particles.map((p) => ({
      id: p.id,
      type: p.type,
      size: p.size,
      x: p.x,
      y: p.y,
      z: p.z,
      vx: p.vx,
      vy: p.vy,
      vz: p.vz,
      rotY: p.rotY,
      rotZ: p.rotZ,
      inFov: p.inFov,
    }));
  }

  return {
    update,
    getMetrics,
    getParticles,
    getCrossSectionProfile,
    getVelocityAtZ,
    computeAreaAtWaterLevel,
    sampleSurface,
    getBedY: bedFn,
  };
}

export { defaultGuimbalBedHeight, createRealRiverHydraulics };
