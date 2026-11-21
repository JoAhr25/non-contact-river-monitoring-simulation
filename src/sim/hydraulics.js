/**
 * Phase 1: Controlled Laboratory Stepped-Weir Flume Hydraulics
 * Coordinates: 1 unit = 1 meter, Y-up, +X downstream.
 * Matches flumeTank.js & gantryFrame.js geometry contracts.
 */

const G = 9.81;

const LAB_GEOMETRY = {
  tankXMin: -0.48,
  tankXMax: 0.48,
  tankZMin: -0.175,
  tankZMax: 0.175,
  channelWidth: 0.35,
  floorY: 0.012,
  shelfY: 0.085,
  returnTopY: 0.08,

  headbox: { xMin: -0.474, xMax: -0.273, topY: 0.51 },
  step1: { xMin: -0.268, xMax: -0.082, weirY: 0.32, foamY: 0.29 },
  step2: { xMin: -0.078, xMax: 0.108, weirY: 0.255, foamY: 0.225 },
  step3: { xMin: 0.112, xMax: 0.298, weirY: 0.19, foamY: 0.16 },
  basin: { xMin: 0.302, xMax: 0.474, floorY: 0.012 },

  nozzlePos: { x: -0.21, y: 0.43, z: -0.02 },
  waveMakers: [
    { x: -0.23, y: 0.24, z: -0.14 },
    { x: 0.26, y: 0.24, z: -0.14 },
  ],
};

// Nominal operating point at valveOpening = 0.75 gives Step 1 WL = 0.335 m
// so gantry LiDAR at y = 0.693 m reads D = 0.358 m (35.8 cm), matching the lab video,
// while full valve surge (1.0) reaches WL = 0.345 m & Q = 0.00253 m^3/s.
const WEIR_COEFF = 0.62 * (2 / 3) * Math.sqrt(2 * G) * LAB_GEOMETRY.channelWidth; // ~0.6409
const Q_PUMP_MAX = 0.00253; // m^3/s (~152 L/min max pump capacity)

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function weirDischarge(levelY, weirY) {
  const head = levelY - weirY;
  if (head <= 1e-5) return 0;
  return WEIR_COEFF * Math.pow(head, 1.5);
}

function createSeededRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createLabHydraulics() {
  const rng = createSeededRng(4207);

  // Chamber plan areas (m^2)
  const A_HEADBOX = (LAB_GEOMETRY.headbox.xMax - LAB_GEOMETRY.headbox.xMin) * LAB_GEOMETRY.channelWidth;
  const A_STEP1 = (LAB_GEOMETRY.step1.xMax - LAB_GEOMETRY.step1.xMin) * LAB_GEOMETRY.channelWidth;
  const A_STEP2 = (LAB_GEOMETRY.step2.xMax - LAB_GEOMETRY.step2.xMin) * LAB_GEOMETRY.channelWidth;
  const A_STEP3 = (LAB_GEOMETRY.step3.xMax - LAB_GEOMETRY.step3.xMin) * LAB_GEOMETRY.channelWidth;
  const A_BASIN = (LAB_GEOMETRY.basin.xMax - LAB_GEOMETRY.basin.xMin) * LAB_GEOMETRY.channelWidth;
  const A_RETURN = LAB_GEOMETRY.channelWidth * (LAB_GEOMETRY.returnTopY - LAB_GEOMETRY.floorY);

  // Start primed in steady nominal operation so Lab Video mode works immediately
  let simTime = 0;
  let riserFill = 1.0;
  let yHeadbox = 0.146;
  let yW1 = 0.335;
  let yW2 = 0.270;
  let yW3 = 0.205;
  let yBasin = 0.150;

  let qPumpTarget = 0.00118;
  let qInflow = 0.00118;
  let qWeir1 = 0.00118;
  let qWeir2 = 0.00118;
  let qWeir3 = 0.00118;
  let qReturn = 0.00118;
  let returnVelocity = 0.048;
  let rippleAmp = 0.0032;
  let surfaceVelocity = 0.09;
  let turbidityMode = 'clear';
  let wavePowerSmooth = 0.25;
  let valveSmooth = 0.75;

  function computeAreaAtWaterLevel(wl) {
    return LAB_GEOMETRY.channelWidth * Math.max(0.005, (Number(wl) || 0) - LAB_GEOMETRY.step1.foamY);
  }

  // Particle pool for floating foam tracers & debris
  let nextParticleId = 1;
  const particles = [];
  const PARTICLE_TYPES = ['foam', 'foam', 'foam', 'tracer', 'debris_plastic', 'leaf'];

  const CASCADE_STEPS = [
    {
      zone: 'step1',
      fallZone: 'fall1',
      geom: LAB_GEOMETRY.step1,
      speedScale: 1.0,
      rotSign: 1,
    },
    {
      zone: 'step2',
      fallZone: 'fall2',
      geom: LAB_GEOMETRY.step2,
      speedScale: 1.05,
      rotSign: -1,
    },
    {
      zone: 'step3',
      fallZone: 'fall3',
      geom: LAB_GEOMETRY.step3,
      speedScale: 1.1,
      rotSign: 1,
    },
  ];

  function assignInflowSpawn(p) {
    const x = LAB_GEOMETRY.nozzlePos.x + (rng() - 0.5) * 0.035;
    const z = clamp(LAB_GEOMETRY.nozzlePos.z + (rng() - 0.5) * 0.20, -0.145, 0.145);
    p.x = x;
    p.z = z;
    p.y = sampleSurface(x, z) + p.size * 0.15;
    p.vx = qInflow > 1e-5 ? Math.max(0.04, surfaceVelocity * (0.88 + rng() * 0.24)) : 0;
    p.vy = 0;
    p.vz = (rng() - 0.5) * 0.03;
    p.rotZ = 0;
    p.age = 0;
    p.zone = 'step1';
    p.fallS = 0;
    p.fallYOffset = 0;
    p.inFov = p.x >= -0.265 && p.x <= 0.305 && p.y >= 0.15;
    return p;
  }

  function spawnParticle(initialStage = 'inflow') {
    const id = nextParticleId++;
    const type = PARTICLE_TYPES[Math.floor(rng() * PARTICLE_TYPES.length)];
    const size =
      type === 'foam'
        ? 0.007 + rng() * 0.006
        : type === 'tracer'
          ? 0.008 + rng() * 0.004
          : 0.011 + rng() * 0.007;

    const p = {
      id,
      type,
      size,
      x: 0,
      y: yW1,
      z: 0,
      vx: 0.16 + rng() * 0.06,
      vy: 0,
      vz: (rng() - 0.5) * 0.03,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.25,
      phase: rng() * Math.PI * 2,
      age: 0,
      zone: 'step1', // 'step1' | 'fall1' | 'step2' | 'fall2' | 'step3' | 'fall3'
      fallS: 0,
      fallYOffset: 0,
      inFov: true,
    };

    if (initialStage === 'distributed') {
      const pick = rng();
      let x;
      let zone;
      if (pick < 0.34) {
        x = -0.23 + rng() * 0.13;
        zone = 'step1';
      } else if (pick < 0.68) {
        x = -0.055 + rng() * 0.145;
        zone = 'step2';
      } else {
        x = 0.135 + rng() * 0.145;
        zone = 'step3';
      }
      const z = (rng() - 0.5) * 0.26;
      p.x = x;
      p.z = z;
      p.y = sampleSurface(x, z) + size * 0.15;
      p.zone = zone;
      return p;
    }

    return assignInflowSpawn(p);
  }

  // Seed initial tracers across the cascade
  for (let i = 0; i < 6; i++) {
    particles.push(spawnParticle('distributed'));
  }

  function reset(primed = false) {
    riserFill = primed ? 1.0 : 0.0;
    yW1 = primed ? 0.335 : LAB_GEOMETRY.step1.weirY;
    yW2 = primed ? 0.270 : LAB_GEOMETRY.step2.weirY;
    yW3 = primed ? 0.205 : LAB_GEOMETRY.step3.weirY;
    yBasin = primed ? 0.150 : 0.148;
    yHeadbox = primed ? 0.146 : 0.148;
    qInflow = primed ? 0.00118 : 0.0;
    qWeir1 = qInflow;
    qWeir2 = qInflow;
    qWeir3 = qInflow;
    qReturn = qInflow;
  }

  function sampleSurface(x, z) {
    const t = simTime;
    const waveP = wavePowerSmooth;
    const flowNorm = clamp(qInflow / 0.0012, 0, 1.6);

    let baseY = yBasin;
    let localRippleScale = 0.6;

    if (x < LAB_GEOMETRY.headbox.xMax) {
      return yHeadbox + Math.sin(x * 30.0 - t * 4.5) * 0.0008 * flowNorm;
    } else if (x <= LAB_GEOMETRY.step1.xMax) {
      baseY = yW1;
      // Radial jet impact ripples from drop pipe at (-0.21, -0.02)
      const dxJ = x - LAB_GEOMETRY.nozzlePos.x;
      const dzJ = z - LAB_GEOMETRY.nozzlePos.z;
      const dJet = Math.hypot(dxJ, dzJ);
      const jetWave =
        Math.sin(dJet * 62.0 - t * 14.0) *
        Math.exp(-dJet * 9.0) *
        0.0028 *
        flowNorm;
      const wmWave = sampleWaveMakerWave(x, z, t, waveP);
      const chop =
        Math.sin(x * 42.0 - t * 6.5) * Math.cos(z * 35.0 + t * 4.2) * 0.0012 * (0.35 + waveP);
      return baseY + jetWave + wmWave + chop;
    } else if (x <= LAB_GEOMETRY.step2.xMax) {
      baseY = yW2;
      localRippleScale = 1.05;
    } else if (x <= LAB_GEOMETRY.step3.xMax) {
      baseY = yW3;
      localRippleScale = 1.1;
    } else {
      baseY = yBasin;
      localRippleScale = 1.2;
    }

    const plungeDist =
      x <= LAB_GEOMETRY.step2.xMax
        ? Math.abs(x - (-0.072))
        : x <= LAB_GEOMETRY.step3.xMax
          ? Math.abs(x - 0.118)
          : Math.abs(x - 0.308);
    const plungeWave =
      Math.sin(plungeDist * 54.0 - t * 13.0) *
      Math.exp(-plungeDist * 8.5) *
      0.0026 *
      flowNorm *
      localRippleScale;
    const wmWave = sampleWaveMakerWave(x, z, t, waveP);
    const baseChop =
      Math.sin(x * 38.0 - t * 5.8) * Math.cos(z * 32.0 - t * 3.9) * 0.001 * (0.25 + waveP);

    return baseY + plungeWave + wmWave + baseChop;
  }

  function sampleWaveMakerWave(x, z, t, waveP) {
    if (waveP <= 0.01) return 0;
    let sum = 0;
    for (let i = 0; i < LAB_GEOMETRY.waveMakers.length; i++) {
      const wm = LAB_GEOMETRY.waveMakers[i];
      const d = Math.hypot(x - wm.x, z - wm.z);
      sum += Math.sin(d * 46.0 - t * 12.0 + i * 1.3) * Math.exp(-d * 3.2);
    }
    return sum * 0.0024 * waveP;
  }

  function getWaterfallParams(stepGeom, upperY, lowerY) {
    const head = Math.max(0.001, upperY - stepGeom.weirY);
    const drop = Math.max(0.015, upperY - lowerY + 0.004);
    const throwDist = 0.022 + clamp(head / 0.02, 0, 1.4) * 0.024;
    const crestY = stepGeom.weirY + head * 0.65;
    // Matches wf.weirX - 0.004 (= step.xMax - 0.002) in waterShader.js
    const sheetStartX = stepGeom.xMax - 0.002;
    return { drop, throwDist, crestY, sheetStartX };
  }

  function updateParticles(dt, pumpActive, targetCount) {
    // Adjust particle count toward target
    const desired = Math.round(clamp(targetCount, 0, 15));
    while (particles.length < desired) {
      // Stagger spawns near inflow if pump active, otherwise distribute across Steps 1..3
      const p = spawnParticle(particles.length < 2 && pumpActive ? 'inflow' : 'distributed');
      particles.push(p);
    }
    if (particles.length > desired) {
      particles.length = desired;
    }

    const waveDrift = wavePowerSmooth * 0.025;
    const activeCascadeSpeed = qInflow > 1e-5 ? Math.max(0.045, surfaceVelocity) : waveDrift;
    const stepLevels = [yW1, yW2, yW3, yBasin];
    const stepDischarges = [qWeir1, qWeir2, qWeir3];
    const zMin = LAB_GEOMETRY.tankZMin + 0.018;
    const zMax = LAB_GEOMETRY.tankZMax - 0.018;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age += dt;

      // Subtle lateral wave-maker circulation & turbulence
      const swirlFlow = clamp(qInflow / 0.00118, 0.08, 1.65);
      const swirlZ =
        Math.sin(simTime * 2.3 + p.phase + p.x * 11.0) * (0.015 + 0.035 * wavePowerSmooth) * swirlFlow;

      let handled = false;
      for (let idx = 0; idx < CASCADE_STEPS.length; idx++) {
        const cfg = CASCADE_STEPS[idx];
        const upperY = stepLevels[idx];
        const lowerY = stepLevels[idx + 1];
        const qWeir = stepDischarges[idx];

        if (p.zone === cfg.zone) {
          const canOverflow = qWeir > 1e-5 && upperY > cfg.geom.weirY + 0.0005;
          const stepFlowSpeed =
            qInflow > 1e-5
              ? activeCascadeSpeed
              : canOverflow
                ? 0.08 * clamp((upperY - cfg.geom.weirY) / 0.01, 0.25, 1.0) + wavePowerSmooth * 0.05
                : wavePowerSmooth * 0.05;
          const jetBoost =
            idx === 0
              ? 0.95 + 0.25 * Math.exp(-Math.abs(p.x - LAB_GEOMETRY.nozzlePos.x) * 14)
              : cfg.speedScale;
          const distToWeir = Math.max(0, cfg.geom.xMax - p.x);
          const crestBoost = canOverflow ? 1.0 + 0.25 * Math.exp(-distToWeir * 45.0) : 1.0;
          const surfSpeed = stepFlowSpeed * jetBoost * crestBoost;

          p.vx += (surfSpeed - p.vx) * Math.min(1, dt * 6);
          p.vz += (swirlZ - p.vz) * Math.min(1, dt * 4);
          p.x = Math.max(cfg.geom.xMin + 0.01, p.x + p.vx * dt);
          p.z += p.vz * dt;
          if (p.z < zMin) {
            p.z = zMin;
            if (p.vz < 0) p.vz *= -0.3;
          } else if (p.z > zMax) {
            p.z = zMax;
            if (p.vz > 0) p.vz *= -0.3;
          }
          p.vy = 0;
          p.rotY += (p.vx * (1.4 + idx * 0.1) + cfg.rotSign * p.vz * 2.2) * dt;

          if (canOverflow && p.x >= cfg.geom.xMax) {
            const prevSurfaceY = sampleSurface(cfg.geom.xMax, p.z) + p.size * 0.15;
            const wf = getWaterfallParams(cfg.geom, upperY, lowerY);
            const sInit = Math.pow(
              clamp((p.x - wf.sheetStartX) / wf.throwDist, 0.01, 0.65),
              1 / 0.72
            );
            const sheetYInit = wf.crestY - wf.drop * Math.pow(sInit, 1.58);
            p.zone = cfg.fallZone;
            p.fallS = sInit;
            p.fallYOffset = prevSurfaceY - (sheetYInit + p.size * 0.10);
            p.y = prevSurfaceY;
            p.vx = Math.max(0.18 + idx * 0.01, p.vx * 1.12);
            p.vy = -0.05;
          } else {
            if (!canOverflow && p.x >= cfg.geom.xMax - 0.01) {
              p.x = cfg.geom.xMax - 0.01;
              p.vx *= -0.2;
            }
            p.y = sampleSurface(Math.min(p.x, cfg.geom.xMax), p.z) + p.size * 0.15;
          }
          handled = true;
          break;
        }

        if (p.zone === cfg.fallZone) {
          const wf = getWaterfallParams(cfg.geom, upperY, lowerY);
          const fallRate = (4.2 + 5.6 * p.fallS) * Math.sqrt(0.065 / wf.drop);
          p.fallS = Math.min(1.0, p.fallS + fallRate * dt);

          const s = p.fallS;
          const sheetX = wf.sheetStartX + wf.throwDist * Math.pow(s, 0.72);
          const sheetY = wf.crestY - wf.drop * Math.pow(s, 1.58);
          const entryBlend = Math.max(0, 1.0 - s / 0.35);

          p.x = sheetX + 0.0015 * Math.sin(s * Math.PI);
          p.y = sheetY + p.size * 0.10 + (p.fallYOffset || 0) * entryBlend;
          p.z = clamp(p.z + p.vz * 0.5 * dt, zMin, zMax);

          const dxDs = 0.72 * wf.throwDist * Math.pow(Math.max(0.05, s), -0.28);
          const dyDs = -1.58 * wf.drop * Math.pow(Math.max(0.05, s), 0.58);
          p.vx = dxDs * fallRate;
          p.vy = dyDs * fallRate;
          p.rotZ = Math.atan2(dyDs, Math.max(0.005, dxDs)) * 0.75;

          if (sheetY <= lowerY || p.fallS >= 1.0) {
            if (idx === CASCADE_STEPS.length - 1) {
              // Finished plunging down Weir 3 into bottom basin:
              // disappear instead of lingering/returning and immediately respawn at Step 1 inflow (nozzlePos)
              assignInflowSpawn(p);
            } else {
              const nextCfg = CASCADE_STEPS[idx + 1];
              p.zone = nextCfg.zone;
              p.x = Math.max(nextCfg.geom.xMin + 0.01, sheetX);
              p.y = sampleSurface(p.x, p.z) + p.size * 0.15;
              p.vx = Math.max(0.06, activeCascadeSpeed * nextCfg.speedScale);
              p.vy = 0;
              p.rotZ = 0;
              p.fallS = 0;
              p.fallYOffset = 0;
            }
          }
          handled = true;
          break;
        }
      }

      if (!handled) {
        assignInflowSpawn(p);
      }

      // Check approximate visibility within camera FOV over Steps 1..3
      p.inFov = p.x >= -0.265 && p.x <= 0.305 && p.y >= 0.15;
    }
  }

  function update(dt, state = {}) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    simTime += clampedDt;

    if (state.resetHydraulics) {
      reset(false);
    }

    const pumpActive = state.pumpActive !== undefined ? Boolean(state.pumpActive) : true;
    const valveTarget = clamp(state.valveOpening !== undefined ? Number(state.valveOpening) : 0.75, 0, 1);
    const waveTarget = clamp(state.waveMakerPower !== undefined ? Number(state.waveMakerPower) : 0.25, 0, 1);
    const debrisTarget = state.debrisCountTarget !== undefined ? Number(state.debrisCountTarget) : 6;
    turbidityMode = state.turbidityMode || 'clear';

    valveSmooth += (valveTarget - valveSmooth) * Math.min(1, clampedDt * 8);
    wavePowerSmooth += (waveTarget - wavePowerSmooth) * Math.min(1, clampedDt * 5);

    // Equal-percentage ball valve curve so 0.75 opening yields ~0.00118 m^3/s -> y_w1 = 0.335 m
    // and full opening (1.0) yields ~0.00253 m^3/s -> y_w1 = 0.345 m
    const valveFactor = Math.pow(valveSmooth, 2.65);
    const hasHeadboxWater = yHeadbox > 0.045;
    qPumpTarget = pumpActive && hasHeadboxWater ? Q_PUMP_MAX * Math.max(0.06, valveFactor) : 0;

    // Riser priming dynamics: pump primes vertical riser quickly, passes valve to fill drop pipe
    const targetRiser =
      !pumpActive || !hasHeadboxWater
        ? 0.0
        : valveSmooth > 0.03
          ? 1.0
          : 0.56; // stops just before valve if valve is shut
    const riserRate = targetRiser > riserFill ? 0.85 : 1.15;
    if (riserFill < targetRiser) {
      riserFill = Math.min(targetRiser, riserFill + riserRate * clampedDt);
    } else if (riserFill > targetRiser) {
      riserFill = Math.max(targetRiser, riserFill - riserRate * clampedDt);
    }

    // Nozzle discharges into Step 1 once riser primes past the top elbow (> 0.86)
    const nozzleGate = clamp((riserFill - 0.84) / 0.14, 0, 1);
    const targetInflow = pumpActive && hasHeadboxWater ? Q_PUMP_MAX * valveFactor * nozzleGate : 0;

    // Sub-step coupled weir + closed-loop return ODEs for rock-solid stability
    const subSteps = 4;
    const hDt = clampedDt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      qInflow += (targetInflow - qInflow) * Math.min(1, hDt * 10);

      qWeir1 = weirDischarge(yW1, LAB_GEOMETRY.step1.weirY);
      qWeir2 = weirDischarge(yW2, LAB_GEOMETRY.step2.weirY);
      qWeir3 = weirDischarge(yW3, LAB_GEOMETRY.step3.weirY);

      // Under-shelf return channel driven by head difference (yBasin - yHeadbox)
      const dhRet = yBasin - yHeadbox;
      const absDh = Math.abs(dhRet);
      const signDh = dhRet >= 0 ? 1 : -1;
      // Smooth Darcy-orifice transition so zero head gradient stays stable
      const sqrtDh = absDh < 0.0004 ? absDh / Math.sqrt(0.0004) : Math.sqrt(absDh);
      qReturn = signDh * 0.58 * A_RETURN * Math.sqrt(2 * G) * sqrtDh;

      yW1 = clamp(yW1 + ((qInflow - qWeir1) / A_STEP1) * hDt, LAB_GEOMETRY.step1.foamY + 0.005, 0.405);
      yW2 = clamp(yW2 + ((qWeir1 - qWeir2) / A_STEP2) * hDt, LAB_GEOMETRY.step2.foamY + 0.005, 0.36);
      yW3 = clamp(yW3 + ((qWeir2 - qWeir3) / A_STEP3) * hDt, LAB_GEOMETRY.step3.foamY + 0.005, 0.30);

      const qPumpDraw = pumpActive && hasHeadboxWater ? qInflow : 0;
      yBasin = clamp(yBasin + ((qWeir3 - qReturn) / A_BASIN) * hDt, 0.04, 0.28);
      yHeadbox = clamp(yHeadbox + ((qReturn - qPumpDraw) / A_HEADBOX) * hDt, 0.035, 0.48);

      // Headbox top overflow notch (0.18 m wide) into Step 1 if headbox ever exceeds y=0.45
      if (yHeadbox > 0.45) {
        const qNotch = weirDischarge(yHeadbox, 0.45) * (0.18 / LAB_GEOMETRY.channelWidth);
        yHeadbox -= (qNotch / A_HEADBOX) * hDt;
        yW1 += (qNotch / A_STEP1) * hDt;
      }
    }

    returnVelocity = qReturn / A_RETURN;
    const flowNorm = clamp(qInflow / 0.0012, 0, 1.6);
    rippleAmp = 0.0005 + 0.0022 * flowNorm + 0.0038 * wavePowerSmooth;

    const step1Depth = Math.max(0.015, yW1 - LAB_GEOMETRY.step1.foamY);
    const step1BulkV = qInflow / (LAB_GEOMETRY.channelWidth * step1Depth);
    // Surface continuity Vs = Vbulk / k_true (0.85) with bounded wave-maker surface agitation
    const waveSurfaceFactor = 1.0 + 0.08 * wavePowerSmooth;
    surfaceVelocity =
      qInflow > 1e-5
        ? (step1BulkV / 0.85) * waveSurfaceFactor
        : wavePowerSmooth * 0.03;

    updateParticles(clampedDt, pumpActive, debrisTarget);
  }

  function getMetrics() {
    const step1DepthAboveFoamM = Math.max(0.005, yW1 - LAB_GEOMETRY.step1.foamY);
    const wettedAreaM2 = LAB_GEOMETRY.channelWidth * step1DepthAboveFoamM;
    return {
      phase: 'lab',
      simTime,
      riserFill,
      inflowActive: riserFill >= 0.85 && qInflow > 1e-5,
      inflowRate: qInflow,
      y_w1: yW1,
      y_w2: yW2,
      y_w3: yW3,
      y_basin: yBasin,
      y_headbox: yHeadbox,
      qFlow: qWeir1,
      qWeir1,
      qWeir2,
      qWeir3,
      qReturn,
      underShelfVelocity: returnVelocity,
      rippleAmp,
      waveMakerPower: wavePowerSmooth,
      valveOpening: valveSmooth,
      turbidityMode,
      // Canonical telemetry fields consumed by pipelineModel.js & dashboardPanel.js
      waterLevelM: yW1, // Measured above bench datum y=0 (matching H - D = 0.693 - 0.358 = 0.335 m)
      step1DepthAboveFoamM,
      topWidthM: LAB_GEOMETRY.channelWidth,
      wettedAreaM2,
      trueSurfaceVelocity: surfaceVelocity,
      trueVolumetricQ: qInflow,
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
      zone: p.zone,
      inFov: p.inFov,
    }));
  }

  return {
    update,
    getMetrics,
    getParticles,
    sampleSurface,
    computeAreaAtWaterLevel,
    reset,
  };
}

export { LAB_GEOMETRY, createLabHydraulics };
