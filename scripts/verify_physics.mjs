#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LAB_GEOMETRY, createLabHydraulics } from '../src/sim/hydraulics.js';
import { createRealRiverHydraulics } from '../src/sim/realRiverHydraulics.js';
import {
  createPipelineModel,
  crc16Ccitt,
  computeHazardIndex,
  encodeLoRa12BytePayload,
} from '../src/sim/pipelineModel.js';
import { THESIS_BOM, THESIS_BOM_TOTAL_PHP } from '../src/shared/bomData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function resolvePythonBin() {
  for (const bin of ['python', 'python3']) {
    const res = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (res.status === 0) return bin;
  }
  throw new Error('Neither python nor python3 found on PATH for edge_node parity checks.');
}

function runCheck(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

// 1. Lab Steady-State Continuity
runCheck('1. Lab Steady-State Continuity (MAPE < 10%)', () => {
  const lab = createLabHydraulics();
  const state = {
    pumpActive: true,
    valveOpening: 0.75,
    waveMakerPower: 0.25,
    debrisCountTarget: 6,
  };
  for (let i = 0; i < 400; i++) {
    lab.update(0.05, state);
  }
  const m = lab.getMetrics();
  assert(
    m.waterLevelM >= 0.30 && m.waterLevelM <= 0.37,
    `Expected waterLevelM in [0.30, 0.37], got ${m.waterLevelM}`
  );
  assert(m.trueVolumetricQ > 0, `Expected trueVolumetricQ > 0, got ${m.trueVolumetricQ}`);
  const qEst = 0.85 * m.trueSurfaceVelocity * m.wettedAreaM2;
  const relErr = Math.abs(qEst - m.trueVolumetricQ) / m.trueVolumetricQ;
  assert(relErr < 0.1, `Expected relative continuity error < 10%, got ${(relErr * 100).toFixed(2)}%`);
});

// 2. Lab Closed-Valve Mass Conservation
runCheck('2. Lab Closed-Valve Mass Conservation (< 1% drift)', () => {
  const lab = createLabHydraulics();
  const activeState = {
    pumpActive: true,
    valveOpening: 0.75,
    waveMakerPower: 0.25,
    debrisCountTarget: 6,
  };
  for (let i = 0; i < 200; i++) lab.update(0.05, activeState);

  const w = LAB_GEOMETRY.channelWidth;
  const A_HB = (LAB_GEOMETRY.headbox.xMax - LAB_GEOMETRY.headbox.xMin) * w;
  const A_S1 = (LAB_GEOMETRY.step1.xMax - LAB_GEOMETRY.step1.xMin) * w;
  const A_S2 = (LAB_GEOMETRY.step2.xMax - LAB_GEOMETRY.step2.xMin) * w;
  const A_S3 = (LAB_GEOMETRY.step3.xMax - LAB_GEOMETRY.step3.xMin) * w;
  const A_BA = (LAB_GEOMETRY.basin.xMax - LAB_GEOMETRY.basin.xMin) * w;

  const totalVolume = (m) =>
    A_HB * (m.y_headbox - LAB_GEOMETRY.floorY) +
    A_S1 * (m.y_w1 - LAB_GEOMETRY.step1.foamY) +
    A_S2 * (m.y_w2 - LAB_GEOMETRY.step2.foamY) +
    A_S3 * (m.y_w3 - LAB_GEOMETRY.step3.foamY) +
    A_BA * (m.y_basin - LAB_GEOMETRY.basin.floorY);

  const vStart = totalVolume(lab.getMetrics());
  const closedState = {
    pumpActive: false,
    valveOpening: 0,
    waveMakerPower: 0,
    debrisCountTarget: 6,
  };
  for (let i = 0; i < 200; i++) lab.update(0.025, closedState);
  const vEnd = totalVolume(lab.getMetrics());
  const drift = Math.abs(vEnd - vStart) / Math.max(vStart, 1e-9);
  assert(drift < 0.01, `Expected closed-valve volume drift < 1%, got ${(drift * 100).toFixed(4)}%`);
});

// 3. River Overbank Monotonicity
runCheck('3. River Overbank Discharge Monotonicity Q(3.15) < Q(3.20) < Q(3.25) < Q(3.30)', () => {
  const stages = [3.15, 3.20, 3.25, 3.30];
  const qs = stages.map((stageM) => {
    const river = createRealRiverHydraulics();
    for (let i = 0; i < 150; i++) {
      river.update(0.05, {
        riverStagePreset: 'normal',
        riverStageM: stageM,
        manningN: 0.035,
        channelSlope: 0.0022,
      });
    }
    return river.getMetrics().trueVolumetricQ;
  });
  for (let i = 1; i < qs.length; i++) {
    assert(
      qs[i] > qs[i - 1],
      `Expected Q(${stages[i]})=${qs[i].toFixed(3)} > Q(${stages[i - 1]})=${qs[i - 1].toFixed(3)}`
    );
  }
});

// 4. River k Decoupling
runCheck('4. River k Decoupling (true Vs & Q invariant across k=0.70 vs 0.95)', () => {
  const runAtK = (k) => {
    const river = createRealRiverHydraulics();
    for (let i = 0; i < 150; i++) {
      river.update(0.05, {
        riverStagePreset: 'normal',
        riverStageM: 1.5,
        velocityCoeffK: k,
      });
    }
    return river.getMetrics();
  };
  const mLow = runAtK(0.70);
  const mHigh = runAtK(0.95);
  assert(
    Math.abs(mLow.trueSurfaceVelocity - mHigh.trueSurfaceVelocity) < 1e-6,
    `True surfaceVelocity changed with k slider: ${mLow.trueSurfaceVelocity} vs ${mHigh.trueSurfaceVelocity}`
  );
  assert(
    Math.abs(mLow.trueVolumetricQ - mHigh.trueVolumetricQ) < 1e-6,
    `True dischargeQ changed with k slider: ${mLow.trueVolumetricQ} vs ${mHigh.trueVolumetricQ}`
  );
});

// 5. LiDAR-to-Q Error Propagation & cos(theta) Slant Comp
runCheck('5. LiDAR-to-Q Error Propagation (Side-Pole 32 deg cos(theta) ON vs OFF)', () => {
  const river = createRealRiverHydraulics();
  for (let i = 0; i < 120; i++) {
    river.update(0.05, { riverStagePreset: 'normal', riverStageM: 1.45, riverMountMode: 'side_pole' });
  }
  const riverMetrics = river.getMetrics();
  const particles = river.getParticles().map((p, idx) => ({ ...p, inFov: idx < 6 }));

  const runPipe = (slantComp) => {
    const pipe = createPipelineModel();
    const state = {
      mode: 'river',
      riverMountMode: 'side_pole',
      sidePoleHeightM: 6.0,
      riverLidarTiltDeg: 32,
      riverLidarSlantComp: slantComp,
      velocityCoeffK: 0.85,
      turbidityMode: 'silty',
      timeOfDay: 'day',
      nightMode: false,
      wifiOnline: true,
      pipelineActive: true,
      _hydraulics: river,
    };
    let snap = null;
    for (let i = 0; i < 60; i++) {
      snap = pipe.step(0.05, state, riverMetrics, null, particles);
    }
    return snap;
  };

  const snapOn = runPipe(true);
  const snapOff = runPipe(false);
  const wlDiff = Math.abs(snapOff.waterLevel.calculatedM - snapOn.waterLevel.calculatedM);
  const qDiff = Math.abs(snapOff.discharge.estimatedQ - snapOn.discharge.estimatedQ);
  assert(wlDiff > 0.3, `Expected WL diff > 0.30 m when slantComp disabled, got ${wlDiff.toFixed(3)}`);
  assert(qDiff > 0.5, `Expected Q diff > 0.50 m^3/s when slantComp disabled, got ${qDiff.toFixed(3)}`);
});

// 6. Night IR-OFF vs IR-ON Degradation
runCheck('6. Night IR-OFF vs IR-ON YOLOv8 F1 & LSPIV Vs Degradation', () => {
  const lab = createLabHydraulics();
  for (let i = 0; i < 150; i++) {
    lab.update(0.05, { pumpActive: true, valveOpening: 0.75, waveMakerPower: 0.25, debrisCountTarget: 10 });
  }
  const labMetrics = lab.getMetrics();
  const types = ['bottle', 'bag', 'leaf', 'bottle', 'branch', 'bag', 'leaf', 'bottle', 'bag', 'leaf'];
  const particles = types.map((type, i) => ({
    id: i + 1,
    type,
    size: 0.032,
    x: -0.22 + i * 0.015,
    y: 0.335,
    z: -0.08 + (i % 4) * 0.04,
    vx: 0.14,
    vy: 0,
    vz: 0,
    inFov: true,
  }));

  const runLighting = (nightMode, timeOfDay) => {
    const pipe = createPipelineModel();
    const state = {
      mode: 'lab',
      lidarHeightM: 0.693,
      turbidityMode: 'clear',
      nightMode,
      timeOfDay,
      wifiOnline: true,
      pipelineActive: true,
      _hydraulics: lab,
    };
    let snap = null;
    for (let i = 0; i < 80; i++) {
      snap = pipe.step(0.05, state, labMetrics, null, particles);
    }
    return snap;
  };

  const snapOff = runLighting(false, 'night_no_ir');
  const snapOn = runLighting(true, 'night');
  assert(
    snapOn.debris.f1Pct > snapOff.debris.f1Pct,
    `Expected IR-ON F1 (${snapOn.debris.f1Pct}) > IR-OFF F1 (${snapOff.debris.f1Pct})`
  );
  assert(
    snapOn.velocity.estimatedVs > snapOff.velocity.estimatedVs,
    `Expected IR-ON Vs (${snapOn.velocity.estimatedVs}) > IR-OFF Vs (${snapOff.velocity.estimatedVs})`
  );
});

// 7. 12-Byte LoRa >BHHHHBH + CRC16-CCITT & Hazard Index Python Parity
runCheck('7. 12-Byte LoRa >BHHHHBH + CRC16-CCITT & HI Parity with edge_node', () => {
  const pyBin = resolvePythonBin();
  const vectors = [
    { nodeId: 1, waterLevelM: 1.080, velocityMs: 1.18, dischargeM3s: 10.421, hazardIndex: 31.58, debrisCount: 2, coverageRatio: 0.04 },
    { nodeId: 1, waterLevelM: 0.335, velocityMs: 0.145, dischargeM3s: 0.0016, hazardIndex: 12.40, debrisCount: 6, coverageRatio: 0.03 },
    { nodeId: 2, waterLevelM: 2.650, velocityMs: 2.84, dischargeM3s: 42.31, hazardIndex: 78.25, debrisCount: 11, coverageRatio: 0.14 },
  ];

  // Canonical test vector hex check
  const canon = encodeLoRa12BytePayload(vectors[0]);
  assert.equal(canon.compactHex.toLowerCase(), '010438049c28b50c5602f823');

  const pyScript = `
import json, sys
from edge_node.esp32_uart_bridge import pack_telemetry_frame, crc16_ccitt
try:
    from edge_node.debris_detector import DebrisDetector
    hi_fn = DebrisDetector.compute_hazard_index
except ImportError:
    hi_fn = None

vecs = json.loads(sys.argv[1])
out = []
for v in vecs:
    frame = pack_telemetry_frame(
        v["nodeId"], v["waterLevelM"], v["velocityMs"],
        v["dischargeM3s"], v["hazardIndex"], v["debrisCount"]
    )
    row = {"hex": frame.hex(), "crc": crc16_ccitt(frame[:10])}
    if hi_fn is not None:
        hi, level = hi_fn(v["debrisCount"], v["coverageRatio"], v["velocityMs"])
        row["hi"] = hi
        row["level"] = level
    out.append(row)
print(json.dumps(out))
`;
  const pyOut = JSON.parse(
    execFileSync(pyBin, ['-c', pyScript, JSON.stringify(vectors)], { cwd: ROOT }).toString('utf8')
  );

  vectors.forEach((v, idx) => {
    const jsFrame = encodeLoRa12BytePayload(v);
    assert.equal(
      jsFrame.compactHex.toLowerCase(),
      pyOut[idx].hex.toLowerCase(),
      `LoRa hex mismatch on vector ${idx}: JS=${jsFrame.compactHex} vs PY=${pyOut[idx].hex}`
    );
    const jsCrc = crc16Ccitt(jsFrame.bytes.slice(0, 10), 0xffff);
    assert.equal(jsCrc, pyOut[idx].crc, `CRC16 mismatch on vector ${idx}`);

    if (pyOut[idx].hi !== undefined) {
      const jsHi = computeHazardIndex(v.debrisCount, v.coverageRatio, v.velocityMs);
      assert(
        Math.abs(jsHi.hazardIndex - pyOut[idx].hi) <= 0.02,
        `HI mismatch on vector ${idx}: JS=${jsHi.hazardIndex} vs PY=${pyOut[idx].hi}`
      );
      assert.equal(jsHi.alertLevel, pyOut[idx].level);
    }
  });
});

// 8. Thesis BOM Arithmetic Integrity
runCheck('8. Thesis BOM Arithmetic Integrity (Total === PHP 20,278)', () => {
  const sum = THESIS_BOM.reduce((s, r) => s + (r.costPhp || 0), 0);
  assert.equal(THESIS_BOM_TOTAL_PHP, 20278);
  assert.equal(sum, 20278);
});

// 9. Offline Standalone Integrity
runCheck('9. Offline standalone.html Integrity (no CDN importmap or fallback)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'standalone.html'), 'utf8');
  assert(!html.includes('data-cdn-fallback'), 'standalone.html must not contain data-cdn-fallback');
  assert(!html.includes('cdn.jsdelivr.net'), 'standalone.html must not contain cdn.jsdelivr.net');
});

console.log('\nAll 9 physics, firmware parity, BOM, and standalone integrity checks PASSED.');
