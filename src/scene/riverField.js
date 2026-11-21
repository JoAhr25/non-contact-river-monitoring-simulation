import * as THREE from 'three';
import { createGantryFrame } from './gantryFrame.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const CHANNEL_HALF_W = 6.0; // 12.0 m Field River Reach channel top width (z in [-6.0, +6.0])
const BANK_TOP_Y = 3.20;    // Flat grassy ground plane elevation flush with top edge of channel walls

/**
 * Surveyed asymmetric natural cross-section profile of Guimbal River, Iloilo (12.0 m channel),
 * bounded by crisp channel walls rising to a flat level grassy ground plane at y = 3.20 m.
 */
function guimbalBedHeightAtZ(z) {
  const az = Math.abs(z);
  if (az >= CHANNEL_HALF_W) return BANK_TOP_Y;

  const shifted = z - 0.25;
  const innerBowl = 0.92 * Math.pow(clamp(Math.abs(shifted) / 5.45, 0, 1.05), 1.95);
  // Subtle natural gravel/cobble bar shelf on left bank (-Z) around pier z = -4.2
  const cobbleBar =
    z < -1.5 && z > -5.1 ? 0.11 * Math.exp(-Math.pow((z + 3.4) / 1.1, 2)) : 0;
  // Micro bed roughness vanishing at thalweg and channel walls
  const thalwegMask = smoothstep(0.0, 1.2, Math.abs(shifted));
  const wallMask = 1.0 - smoothstep(4.9, 5.45, az);
  const microBed = (0.024 * Math.sin(az * 2.0) + 0.012 * Math.cos(z * 3.1)) * thalwegMask * wallMask;
  const bedFloor = innerBowl + cobbleBar + microBed;
  const wallT = smoothstep(5.42, CHANNEL_HALF_W, az);
  return clamp(bedFloor + (BANK_TOP_Y - bedFloor) * wallT, 0.0, BANK_TOP_Y);
}

/**
 * Procedural cobble/gravel/silt ground texture for the Guimbal River channel bed & walls.
 */
function createRiverTerrainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c8c5bc';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 3200; i++) {
    const x = (i * 97 + (i % 13) * 19) % 512;
    const y = (i * 173 + (i % 7) * 23) % 512;
    const rx = 2 + (i % 6);
    const ry = 1.6 + ((i * 3) % 5);
    const shade = 140 + ((i * 29) % 85);
    ctx.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade - 10}, 0.45)`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (i * 0.7) % Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 5);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Procedural realistic green grass field texture for the flat grassy riverbanks.
 */
function createGrassFieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Rich meadow turf base
  ctx.fillStyle = '#3f6e2d';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle organic turf color mottling (tiled softly)
  for (let i = 0; i < 360; i++) {
    const x = (i * 137 + 19) % 512;
    const y = (i * 223 + 41) % 512;
    const r = 14 + (i % 26);
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(78, 128, 52, 0.14)'
        : i % 3 === 1
          ? 'rgba(42, 82, 30, 0.14)'
          : 'rgba(96, 144, 62, 0.10)';
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        if (x + ox + r < 0 || x + ox - r > 512 || y + oy + r < 0 || y + oy - r > 512) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Fine directional grass blades & clover speckles
  const greens = ['#4e8537', '#5d9642', '#356125', '#6aa34c', '#2e5520'];
  for (let i = 0; i < 6200; i++) {
    const x = (i * 193 + (i % 17) * 29) % 512;
    const y = (i * 271 + (i % 11) * 31) % 512;
    const len = 4 + (i % 7);
    const tilt = (((i * 37) % 100) / 100 - 0.5) * 4.2;
    ctx.strokeStyle = greens[i % greens.length];
    ctx.lineWidth = 1.0 + (i % 2) * 0.5;
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tilt, y - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 3);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates graduated DPWH/PAGASA style metric staff gauge plate texture.
 * Plate covers elevation y = 0.80 m to y = 3.80 m (3.00 m tall).
 */
function createStaffGaugeTexture(yBottom, yTop) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Enamel white plate
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, 256, 1024);

  // Outer blue border
  ctx.strokeStyle = '#15437c';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 1014);

  const totalM = yTop - yBottom;
  const pxPerMeter = 1024 / totalM;

  // Draw 2 cm alternating black/blue E-blocks and 10 cm ticks
  const totalCm = Math.round(totalM * 100);
  for (let cm = 0; cm < totalCm; cm += 2) {
    const elevM = yBottom + cm * 0.01;
    const pyBottom = 1024 - (elevM - yBottom) * pxPerMeter;
    const pyTop = 1024 - (elevM + 0.02 - yBottom) * pxPerMeter;
    const h = Math.max(1, pyBottom - pyTop);

    const isMeterExact = Math.round(elevM * 100) % 100 === 0;
    const col = cm % 100 < 50 ? '#11161d' : '#184b8c';

    if ((cm / 2) % 2 === 0) {
      ctx.fillStyle = col;
      ctx.fillRect(16, pyTop, 62, h);
    }

    if (cm % 10 === 0) {
      ctx.fillStyle = isMeterExact ? '#b81f1f' : col;
      ctx.fillRect(16, pyBottom - 3, isMeterExact ? 112 : 98, isMeterExact ? 5 : 4);
      const valLabel = elevM.toFixed(1);
      ctx.font = cm % 50 === 0 ? 'bold 34px monospace' : 'bold 24px monospace';
      ctx.fillStyle = isMeterExact ? '#b81f1f' : '#11161d';
      ctx.fillText(valLabel, 122, pyBottom - 6);
    }
  }

  ctx.fillStyle = '#15437c';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('GUIMBAL WL (m)', 42, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates high-contrast PyORC Ground Control Point (GCP) checkerboard marker texture.
 */
function createGcpTargetTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // High-vis orange survey frame
  ctx.fillStyle = '#ff6a1a';
  ctx.fillRect(0, 0, 256, 256);

  // Inner checkerboard quadrants
  const pad = 22;
  const half = (256 - pad * 2) * 0.5;
  ctx.fillStyle = '#0d1014';
  ctx.fillRect(pad, pad, half, half);
  ctx.fillRect(pad + half, pad + half, half, half);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(pad + half, pad, half, half);
  ctx.fillRect(pad, pad + half, half, half);

  // Center crosshair
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128 - 22, 128);
  ctx.lineTo(128 + 22, 128);
  ctx.moveTo(128, 128 - 22);
  ctx.lineTo(128, 128 + 22);
  ctx.stroke();

  // Label pill at bottom
  ctx.fillStyle = 'rgba(13, 16, 20, 0.88)';
  ctx.fillRect(58, 206, 140, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 231);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSolarPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0c1c36';
  ctx.fillRect(0, 0, 256, 192);

  const cols = 6;
  const rows = 4;
  const pad = 6;
  const cw = (256 - pad * 2) / cols;
  const ch = (192 - pad * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * cw;
      const y = pad + r * ch;
      ctx.fillStyle = (r + c) % 2 === 0 ? '#11294f' : '#142f59';
      ctx.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
      ctx.strokeStyle = 'rgba(191, 219, 254, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + cw * 0.5, y + 2);
      ctx.lineTo(x + cw * 0.5, y + ch - 2);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 188);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Phase 2: Guimbal River, Iloilo Field Twin (1 unit = 1 m, +X downstream, Z cross-section)
 */
function createRiverField() {
  const group = new THREE.Group();
  group.name = 'GuimbalRiverField';

  const terrainTex = createRiverTerrainTexture();
  const grassTex = createGrassFieldTexture();

  /* -------------------- 1. River Channel Bathymetry + Flat Grassy Land Surface -------------------- */

  const LEN_X = 28.0; // x in [-14, +14]
  const SEG_X = 112;

  // Non-uniform Z samples across [-6.0, +6.0] concentrated along the steep channel walls
  const zChanList = [];
  for (let z = -6.00; z < -5.40; z += 0.06) zChanList.push(Number(z.toFixed(4)));
  for (let z = -5.40; z < 5.40; z += 0.24) zChanList.push(Number(z.toFixed(4)));
  for (let z = 5.40; z <= 6.0001; z += 0.06) zChanList.push(Number(Math.min(6.0, z).toFixed(4)));

  const colsX = SEG_X + 1;
  const rowsZ = zChanList.length;
  const chanVertCount = colsX * rowsZ;
  const chanPos = new Float32Array(chanVertCount * 3);
  const chanUv = new Float32Array(chanVertCount * 2);
  const chanColors = new Float32Array(chanVertCount * 3);
  const chanIndices = [];

  const cWetCobble = new THREE.Color('#3b362e');
  const cGravel = new THREE.Color('#867b67');
  const cWallStone = new THREE.Color('#6b665d');
  const cBankRim = new THREE.Color('#4a6e32');
  const tmpColor = new THREE.Color();

  for (let r = 0; r < rowsZ; r++) {
    const z = zChanList[r];
    const baseY = guimbalBedHeightAtZ(z);
    for (let c = 0; c < colsX; c++) {
      const u = c / SEG_X;
      const x = -LEN_X * 0.5 + u * LEN_X;
      const idx = r * colsX + c;

      chanPos[idx * 3] = x;
      chanPos[idx * 3 + 1] = baseY;
      chanPos[idx * 3 + 2] = z;

      chanUv[idx * 2] = u;
      chanUv[idx * 2 + 1] = (z + CHANNEL_HALF_W) / (CHANNEL_HALF_W * 2);

      const az = Math.abs(z);
      if (baseY < 0.72) {
        tmpColor.lerpColors(cWetCobble, cGravel, smoothstep(0.05, 0.72, baseY));
      } else if (az < 5.55) {
        tmpColor.lerpColors(cGravel, cWallStone, smoothstep(0.72, 1.35, baseY));
      } else {
        tmpColor.lerpColors(cWallStone, cBankRim, smoothstep(5.78, CHANNEL_HALF_W, az));
      }

      const n = 0.94 + 0.10 * (0.5 + 0.5 * Math.sin(x * 1.7 + z * 2.3));
      chanColors[idx * 3] = tmpColor.r * n;
      chanColors[idx * 3 + 1] = tmpColor.g * n;
      chanColors[idx * 3 + 2] = tmpColor.b * n;
    }
  }

  for (let r = 0; r < rowsZ - 1; r++) {
    for (let c = 0; c < SEG_X; c++) {
      const a = r * colsX + c;
      const b = a + 1;
      const d = (r + 1) * colsX + c;
      const e = d + 1;
      chanIndices.push(a, d, b, b, d, e);
    }
  }

  const terrainGeom = new THREE.BufferGeometry();
  terrainGeom.setAttribute('position', new THREE.BufferAttribute(chanPos, 3));
  terrainGeom.setAttribute('uv', new THREE.BufferAttribute(chanUv, 2));
  const chanDryColors = new Float32Array(chanColors);
  const chanColorAttr = new THREE.BufferAttribute(chanColors, 3);
  terrainGeom.setAttribute('color', chanColorAttr);
  terrainGeom.setIndex(chanIndices);
  terrainGeom.computeVertexNormals();

  let lastWetWL = -99;
  function updateShorelineWetness(wl) {
    if (Math.abs(wl - lastWetWL) < 0.04) return;
    lastWetWL = wl;
    for (let r = 0; r < rowsZ; r++) {
      const baseY = guimbalBedHeightAtZ(zChanList[r]);
      const wetT = 1.0 - smoothstep(wl - 0.08, wl + 0.14, baseY);
      const shade = 1.0 - 0.44 * wetT;
      const rowOff = r * colsX * 3;
      for (let c = 0; c < colsX; c++) {
        const i3 = rowOff + c * 3;
        chanColors[i3] = chanDryColors[i3] * shade;
        chanColors[i3 + 1] = chanDryColors[i3 + 1] * shade * (1.0 - 0.04 * wetT);
        chanColors[i3 + 2] = chanDryColors[i3 + 2] * shade * (1.0 - 0.08 * wetT);
      }
    }
    chanColorAttr.needsUpdate = true;
  }

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });

  const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'GuimbalBathymetryTerrain';
  group.add(terrainMesh);

  // Flat, level green grassy ground planes on both sides of the river channel (flush at y = BANK_TOP_Y)
  const BANK_DEPTH_Z = 9.0; // spans |z| from 6.00 m to 15.00 m on both riverbanks
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0.01,
  });

  for (const side of [-1, 1]) {
    const bankGeom = new THREE.PlaneGeometry(LEN_X, BANK_DEPTH_Z, 32, 12);
    bankGeom.rotateX(-Math.PI / 2);
    const bankMesh = new THREE.Mesh(bankGeom, grassMat);
    bankMesh.position.set(0, BANK_TOP_Y, side * (CHANNEL_HALF_W + BANK_DEPTH_Z * 0.5));
    bankMesh.receiveShadow = true;
    bankMesh.name = side < 0 ? 'LeftFlatGrassyBank' : 'RightFlatGrassyBank';
    group.add(bankMesh);
  }

  // Subtle turf/earth shoulder trim flush along top edge of channel walls (|z| = 6.00, y = BANK_TOP_Y)
  const bankEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x4b5c34,
    roughness: 0.92,
    metalness: 0.02,
  });
  for (const side of [-1, 1]) {
    const edgeLip = new THREE.Mesh(new THREE.BoxGeometry(LEN_X, 0.04, 0.14), bankEdgeMat);
    edgeLip.position.set(0, BANK_TOP_Y - 0.018, side * CHANNEL_HALF_W);
    edgeLip.receiveShadow = true;
    group.add(edgeLip);
  }

  /* -------------------- 2. Instanced River Cobbles, Bank Grass Tufts & Shrubs -------------------- */

  const boulderGeom = new THREE.DodecahedronGeometry(1, 1);
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x797266,
    roughness: 0.86,
    metalness: 0.03,
  });
  const BOULDER_COUNT = 130;
  const boulders = new THREE.InstancedMesh(boulderGeom, boulderMat, BOULDER_COUNT);
  boulders.castShadow = true;
  boulders.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let bIdx = 0;
  for (let i = 0; i < 420 && bIdx < BOULDER_COUNT; i++) {
    // Keep boulders inside the river channel bed/toe (|z| in [2.6, 5.38])
    const rx = (((i * 137 + 29) % 1000) / 1000) * 26.0 - 13.0;
    const side = i % 2 === 0 ? -1 : 1;
    const rz = side * (2.6 + (((i * 211 + 53) % 1000) / 1000) * 2.75);

    // Keep central bridge/transect/GCP/staff gauge zones uncluttered
    if (Math.abs(rx - 0.8) < 2.2 && Math.abs(rz) < 5.5) continue;
    if (Math.hypot(rx - 1.5, rz + 5.4) < 1.1) continue;
    if (Math.hypot(rx, rz + 4.2) < 1.4) continue;

    const by = guimbalBedHeightAtZ(rz);
    const sx = 0.14 + ((i * 19) % 10) * 0.032;
    const sy = 0.08 + ((i * 11) % 7) * 0.020;
    const sz = 0.13 + ((i * 23) % 9) * 0.030;

    dummy.position.set(rx, by + sy * 0.35, rz);
    dummy.rotation.set(((i * 7) % 10) * 0.15, (i * 1.1) % (Math.PI * 2), 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    boulders.setMatrixAt(bIdx, dummy.matrix);
    const bTone = 0.78 + ((i * 31) % 10) * 0.042;
    tmpColor.setRGB(bTone * 0.98, bTone * 0.94, bTone * 0.88);
    boulders.setColorAt(bIdx, tmpColor);
    bIdx++;
  }
  boulders.count = bIdx;
  boulders.instanceMatrix.needsUpdate = true;
  if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
  group.add(boulders);

  // Low-poly grass blade tufts along the flat riverbank edges & across the grassy field
  const bladeGeom = new THREE.ConeGeometry(0.055, 0.24, 4);
  bladeGeom.translate(0, 0.12, 0);
  const grassBladeMat = new THREE.MeshStandardMaterial({
    color: 0x4b8733,
    roughness: 0.86,
    metalness: 0.02,
  });
  const TUFT_COUNT = 520;
  const grassTufts = new THREE.InstancedMesh(bladeGeom, grassBladeMat, TUFT_COUNT);
  grassTufts.castShadow = false;
  grassTufts.receiveShadow = true;

  let tIdx = 0;
  for (let i = 0; i < 1100 && tIdx < TUFT_COUNT; i++) {
    const rx = (((i * 197 + 13) % 1000) / 1000) * 26.8 - 13.4;
    const side = i % 2 === 0 ? -1 : 1;
    // Concentrate 70% along riverbank edge (|z| in [6.08, 7.15]), rest across flat grassy field
    const isEdge = i % 10 < 7;
    const distFromEdge = isEdge
      ? 0.08 + (((i * 149 + 31) % 1000) / 1000) * 1.05
      : 1.15 + (((i * 263 + 59) % 1000) / 1000) * 7.2;
    const rz = side * (CHANNEL_HALF_W + distFromEdge);

    // Keep clear of bridge roadway corridor and both side-pole base pads
    if (Math.abs(rx) < 1.45) continue;
    if (Math.hypot(rx - 2.1, rz + 8.45) < 0.95) continue;
    if (Math.abs(rx - 2.1) < 1.15 && rz > -7.35 && rz < -6.25) continue;

    const scaleH = (isEdge ? 0.85 : 0.65) + ((i * 17) % 9) * 0.09;
    const scaleW = 0.75 + ((i * 23) % 7) * 0.08;
    dummy.position.set(rx, BANK_TOP_Y - 0.005, rz);
    dummy.rotation.set(
      (((i * 13) % 10) - 5) * 0.04,
      (i * 1.37) % (Math.PI * 2),
      (((i * 29) % 10) - 5) * 0.04
    );
    dummy.scale.set(scaleW, scaleH, scaleW);
    dummy.updateMatrix();
    grassTufts.setMatrixAt(tIdx, dummy.matrix);
    const gShift = 0.78 + ((i * 29) % 12) * 0.036;
    tmpColor.setRGB(0.84 * gShift, gShift, 0.72 * gShift);
    grassTufts.setColorAt(tIdx, tmpColor);
    tIdx++;
  }
  grassTufts.count = tIdx;
  grassTufts.instanceMatrix.needsUpdate = true;
  if (grassTufts.instanceColor) grassTufts.instanceColor.needsUpdate = true;
  group.add(grassTufts);

  // Tropical riverbank shrubs / tall grass clumps seated cleanly on the flat grassy ground (|z| > 7.5)
  const bushGeom = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x3a6a2c,
    roughness: 0.90,
  });
  const BUSH_COUNT = 85;
  const bushes = new THREE.InstancedMesh(bushGeom, bushMat, BUSH_COUNT);
  bushes.castShadow = true;
  bushes.receiveShadow = true;

  let vIdx = 0;
  for (let i = 0; i < 300 && vIdx < BUSH_COUNT; i++) {
    const rx = (((i * 179 + 41) % 1000) / 1000) * 26.0 - 13.0;
    const side = i % 2 === 0 ? -1 : 1;
    const rz = side * (7.6 + (((i * 257 + 17) % 1000) / 1000) * 6.2);

    // Clear bridge deck corridor x in [-1.8, +1.8] and both pole pads
    if (Math.abs(rx) < 1.8) continue;
    if (Math.hypot(rx - 2.1, rz + 8.45) < 1.6) continue;
    if (Math.hypot(rx - 2.1, rz + 6.70) < 1.8) continue;

    const r = 0.32 + ((i * 13) % 8) * 0.09;
    dummy.position.set(rx, BANK_TOP_Y + r * 0.42, rz);
    dummy.rotation.set(0, (i * 0.9) % (Math.PI * 2), 0);
    dummy.scale.set(r * 1.25, r * 0.85, r * 1.1);
    dummy.updateMatrix();
    bushes.setMatrixAt(vIdx, dummy.matrix);
    const vShift = 0.76 + ((i * 19) % 10) * 0.044;
    tmpColor.setRGB(0.85 * vShift, vShift, 0.78 * vShift);
    bushes.setColorAt(vIdx, tmpColor);
    vIdx++;
  }
  bushes.count = vIdx;
  bushes.instanceMatrix.needsUpdate = true;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  group.add(bushes);

  // Tropical riparian trees along outer grassy banks (clear of bridge & side-pole sightlines)
  const treeSpots = [
    [-10.8, -11.8, 1.15], [-6.4, -12.6, 1.32], [-4.2, -9.8, 0.96],
    [6.6, -12.2, 1.25], [10.9, -11.4, 1.05], [12.2, -8.8, 0.92],
    [-11.4, 11.2, 1.18], [-7.2, 12.8, 1.35], [-3.8, 10.6, 1.02],
    [4.4, 10.8, 1.08], [8.5, 12.4, 1.28], [11.8, 10.2, 1.12],
  ];
  const trunkGeom = new THREE.CylinderGeometry(0.11, 0.17, 2.2, 8);
  trunkGeom.translate(0, 1.1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.92 });
  const canopyGeom = new THREE.IcosahedronGeometry(1.15, 1);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3b722f, roughness: 0.88 });
  const treeTrunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeSpots.length);
  const treeCanopies = new THREE.InstancedMesh(canopyGeom, canopyMat, treeSpots.length * 2);
  treeTrunks.castShadow = true;
  treeCanopies.castShadow = true;
  treeCanopies.receiveShadow = true;
  treeSpots.forEach(([tx, tz, ts], i) => {
    dummy.position.set(tx, BANK_TOP_Y - 0.04, tz);
    dummy.rotation.set(0.03 * ((i % 3) - 1), i * 1.1, 0.02 * ((i % 2) - 0.5));
    dummy.scale.set(ts, ts, ts);
    dummy.updateMatrix();
    treeTrunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, BANK_TOP_Y + 2.35 * ts, tz);
    dummy.scale.set(1.15 * ts, 0.88 * ts, 1.12 * ts);
    dummy.updateMatrix();
    treeCanopies.setMatrixAt(i * 2, dummy.matrix);

    dummy.position.set(tx + 0.35 * ts, BANK_TOP_Y + 2.95 * ts, tz - 0.25 * ts);
    dummy.scale.set(0.82 * ts, 0.72 * ts, 0.82 * ts);
    dummy.updateMatrix();
    treeCanopies.setMatrixAt(i * 2 + 1, dummy.matrix);

    const cMul = 0.84 + (i % 5) * 0.07;
    tmpColor.setRGB(0.86 * cMul, cMul, 0.76 * cMul);
    treeCanopies.setColorAt(i * 2, tmpColor);
    tmpColor.setRGB(0.92 * cMul, 1.04 * cMul, 0.80 * cMul);
    treeCanopies.setColorAt(i * 2 + 1, tmpColor);
  });
  treeTrunks.instanceMatrix.needsUpdate = true;
  treeCanopies.instanceMatrix.needsUpdate = true;
  if (treeCanopies.instanceColor) treeCanopies.instanceColor.needsUpdate = true;
  group.add(treeTrunks, treeCanopies);

  /* -------------------- 3. Concrete Bridge Pier, Girder Deck & Adjustable Sensor Pole -------------------- */

  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'GuimbalBridgeStructure';

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x8d9196,
    roughness: 0.86,
    metalness: 0.04,
  });
  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x5c6066,
    roughness: 0.92,
  });
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    roughness: 0.90,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xadb7c2,
    roughness: 0.36,
    metalness: 0.72,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x3b424c,
    roughness: 0.42,
    metalness: 0.65,
  });

  // Main In-Channel Concrete Bridge Pier at (x = 0, z = -4.2)
  const pierBedY = guimbalBedHeightAtZ(-4.2);
  const pierGroup = new THREE.Group();
  pierGroup.position.set(0, 0, -4.2);

  const footing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 1.30), darkConcreteMat);
  footing.position.y = pierBedY + 0.10;
  footing.castShadow = true;
  footing.receiveShadow = true;
  pierGroup.add(footing);

  // Hydrodynamic bullnose column (0.84 m width in Z matches PIER_POS.halfWidth = 0.42)
  const shaftH = 4.60 - pierBedY;
  const pierShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.45, shaftH, 20),
    concreteMat
  );
  pierShaft.scale.set(1.35, 1.0, 1.0); // elongated along X flow direction
  pierShaft.position.y = pierBedY + shaftH * 0.5;
  pierShaft.castShadow = true;
  pierShaft.receiveShadow = true;
  pierGroup.add(pierShaft);

  // Darkened waterline silt/moss band on pier (y = 0.8 .. 2.3 m)
  const stainBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.445, 0.456, 1.45, 20),
    darkConcreteMat
  );
  stainBand.scale.set(1.35, 1.0, 1.0);
  stainBand.position.y = Math.max(pierBedY + 0.8, 1.55);
  pierGroup.add(stainBand);

  // Concrete pier cap beam
  const pierCap = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 1.15), concreteMat);
  pierCap.position.y = 4.62;
  pierCap.castShadow = true;
  pierGroup.add(pierCap);

  bridgeGroup.add(pierGroup);

  // Far-bank support pier at (x = 0, z = +9.6) & near abutment at (x = 0, z = -10.4)
  for (const pz of [-10.4, 9.6]) {
    const abutBed = guimbalBedHeightAtZ(pz);
    const h = 4.75 - abutBed;
    const abut = new THREE.Mesh(new THREE.BoxGeometry(1.85, Math.max(0.8, h), 1.0), concreteMat);
    abut.position.set(0, abutBed + Math.max(0.8, h) * 0.5, pz);
    abut.castShadow = true;
    abut.receiveShadow = true;
    bridgeGroup.add(abut);
  }

  // Twin Precast Concrete I-Girders spanning across channel (z in [-11.2, +11.2])
  for (const gx of [-0.52, 0.52]) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 22.4), concreteMat);
    girder.position.set(gx, 4.86, 0);
    girder.castShadow = true;
    girder.receiveShadow = true;
    bridgeGroup.add(girder);
  }

  // Concrete bridge deck slab & asphalt roadway
  const deckSlab = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.20, 22.6), concreteMat);
  deckSlab.position.set(0, 5.10, 0);
  deckSlab.castShadow = true;
  deckSlab.receiveShadow = true;
  bridgeGroup.add(deckSlab);

  const asphalt = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.04, 22.6), asphaltMat);
  asphalt.position.set(0, 5.21, 0);
  asphalt.receiveShadow = true;
  bridgeGroup.add(asphalt);

  // Side concrete curbs & tubular steel pedestrian guardrails
  for (const xSign of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 22.6), concreteMat);
    curb.position.set(xSign * 0.99, 5.26, 0);
    bridgeGroup.add(curb);

    for (const railY of [5.58, 5.92]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 22.4), darkSteelMat);
      rail.position.set(xSign * 1.00, railY, 0);
      rail.castShadow = true;
      bridgeGroup.add(rail);
    }

    for (let pz = -10.5; pz <= 10.5; pz += 3.0) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.76, 0.07), darkSteelMat);
      post.position.set(xSign * 1.00, 5.62, pz);
      post.castShadow = true;
      bridgeGroup.add(post);
    }
  }

  // Tapered concrete & asphalt approach embankments at bridge ends (z = +-11.3 .. +-14.0 -> BANK_TOP_Y = 3.20)
  const rampRun = 2.75;
  const rampRise = 5.20 - BANK_TOP_Y;
  const rampLen = Math.hypot(rampRun, rampRise);
  const rampTilt = Math.atan2(rampRise, rampRun);
  for (const zSign of [-1, 1]) {
    const rampMidZ = zSign * (11.25 + rampRun * 0.5);
    const rampMidY = BANK_TOP_Y + rampRise * 0.5 - 0.08;

    const rampSlab = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.22, rampLen), concreteMat);
    rampSlab.position.set(0, rampMidY, rampMidZ);
    rampSlab.rotation.x = zSign * rampTilt;
    rampSlab.castShadow = true;
    rampSlab.receiveShadow = true;
    bridgeGroup.add(rampSlab);

    const rampAsphalt = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.04, rampLen), asphaltMat);
    rampAsphalt.position.set(0, rampMidY + 0.12, rampMidZ);
    rampAsphalt.rotation.x = zSign * rampTilt;
    rampAsphalt.receiveShadow = true;
    bridgeGroup.add(rampAsphalt);

    const earthPier = new THREE.Mesh(new THREE.BoxGeometry(2.05, rampRise * 0.85, rampRun * 0.65), darkConcreteMat);
    earthPier.position.set(0, BANK_TOP_Y + rampRise * 0.425, zSign * 11.75);
    earthPier.castShadow = true;
    earthPier.receiveShadow = true;
    bridgeGroup.add(earthPier);
  }

  // Adjustable Galvanized Bridge-Side Sensor Pole & Clamp Assembly (Overhead Bridge Mount)
  const DEFAULT_RIVER_MOUNT_Y = 4.50;
  const DEFAULT_RIVER_CAM_Y = 4.40;
  const DEFAULT_SIDE_POLE_MOUNT_Y = 6.00;

  const mountAnchor = new THREE.Vector3(0.8, DEFAULT_RIVER_MOUNT_Y, 0);
  const cameraAnchor = new THREE.Vector3(0.6, DEFAULT_RIVER_CAM_Y, -0.35);

  const bridgeSensorMountGroup = new THREE.Group();
  bridgeSensorMountGroup.name = 'BridgeCenteredSensorMount';

  // Fixed fascia clamp bolted outside downstream bridge deck edge (x = +1.08, clear of deck slab x <= 1.075)
  for (const cz of [-0.35, 0.0]) {
    const fasciaPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.18), darkSteelMat);
    fasciaPlate.position.set(1.08, 5.08, cz);
    fasciaPlate.castShadow = true;
    bridgeSensorMountGroup.add(fasciaPlate);

    const outriggerArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), steelMat);
    outriggerArm.position.set(1.13, 5.06, cz);
    outriggerArm.castShadow = true;
    bridgeSensorMountGroup.add(outriggerArm);
  }

  // Shared helper to build the sensor head boom brackets (reused on both Bridge Pole & Riverbank Side-Pole)
  function addSensorHeadBrackets(targetGroup, baseX, lidarY, lidarZ, camY, camZ, camArmSpan, boomTopY = null) {
    const lidarPad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), darkSteelMat);
    lidarPad.position.set(baseX, lidarY + 0.05, lidarZ);
    targetGroup.add(lidarPad);

    const camArm = new THREE.Mesh(new THREE.BoxGeometry(camArmSpan, 0.05, 0.05), steelMat);
    camArm.position.set(baseX - 0.04, camY + 0.05, camZ);
    camArm.castShadow = true;
    targetGroup.add(camArm);

    const fullLinkLen = Math.abs(lidarZ - camZ) + 0.05;
    const linkMidZ = 0.5 * (lidarZ + camZ);
    const camSideLink = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, fullLinkLen), steelMat);
    camSideLink.position.set(baseX, camY + 0.05, linkMidZ);
    targetGroup.add(camSideLink);

    if (Math.abs(lidarY - camY) > 0.01) {
      const dropH = Math.abs(lidarY - camY) + 0.05;
      const vertStep = new THREE.Mesh(new THREE.BoxGeometry(0.05, dropH, 0.05), steelMat);
      vertStep.position.set(baseX, 0.5 * (lidarY + camY) + 0.05, lidarZ);
      targetGroup.add(vertStep);
    }

    if (boomTopY !== null && boomTopY > camY + 0.05) {
      const stemH = boomTopY - (camY + 0.05);
      const boomStem = new THREE.Mesh(new THREE.BoxGeometry(0.05, stemH, 0.05), steelMat);
      boomStem.position.set(baseX, camY + 0.05 + stemH * 0.5, camZ);
      targetGroup.add(boomStem);
    }
  }

  // Sliding/Adjustable vertical pole + under-deck sensor mounting boom (clear of deckSlab & asphalt)
  const poleHeadGroup = new THREE.Group();
  poleHeadGroup.name = 'BridgeAdjustableSensorPole';

  const mastVert = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.18, 16), steelMat);
  mastVert.position.set(1.16, 5.00, -0.18);
  mastVert.castShadow = true;
  poleHeadGroup.add(mastVert);

  const underDeckArm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.055, 0.055), steelMat);
  underDeckArm.position.set(0.98, 4.54, -0.18);
  underDeckArm.castShadow = true;
  poleHeadGroup.add(underDeckArm);

  // LiDAR cantilever arm out to (0.80, 4.50, 0)
  const lidarArm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.24), steelMat);
  lidarArm.position.set(0.80, 4.54, -0.09);
  lidarArm.castShadow = true;
  poleHeadGroup.add(lidarArm);

  addSensorHeadBrackets(poleHeadGroup, 0.80, 4.50, 0.0, 4.40, -0.35, 0.46);

  // Pole clamp for control enclosure mounted to mastVert below deck underside (y = 5.00)
  const boxClamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.20, 0.05), darkSteelMat);
  boxClamp.position.set(1.16, 4.76, -0.24);
  poleHeadGroup.add(boxClamp);

  bridgeSensorMountGroup.add(poleHeadGroup);
  bridgeGroup.add(bridgeSensorMountGroup);
  group.add(bridgeGroup);

  /* -------------------- 3b. Riverbank Side-Pole Assembly (Reusing Pole/Boom Design at H_mount = 6.00m) -------------------- */

  const SIDE_POLE_X = 2.10;
  const SIDE_POLE_Z = -8.45;
  const SIDE_BOOM_TIP_Z = -5.35;
  const sideGroundY = guimbalBedHeightAtZ(SIDE_POLE_Z);

  const sideMountAnchor = new THREE.Vector3(SIDE_POLE_X, DEFAULT_SIDE_POLE_MOUNT_Y, SIDE_BOOM_TIP_Z);
  const sideCameraAnchor = new THREE.Vector3(SIDE_POLE_X - 0.20, DEFAULT_SIDE_POLE_MOUNT_Y - 0.08, SIDE_BOOM_TIP_Z - 0.03);
  const sideIrAnchor = new THREE.Vector3(SIDE_POLE_X + 0.20, DEFAULT_SIDE_POLE_MOUNT_Y - 0.08, SIDE_BOOM_TIP_Z - 0.03);
  const sideControlBoxAnchor = new THREE.Vector3(SIDE_POLE_X, 4.95, SIDE_POLE_Z + 0.20);
  const sideRouterAnchor = new THREE.Vector3(SIDE_POLE_X - 0.34, 4.95, SIDE_POLE_Z);

  const sidePoleGroup = new THREE.Group();
  sidePoleGroup.name = 'RiverbankSidePoleAssembly';
  sidePoleGroup.visible = false;

  // Embankment concrete footing pad & steel base flange
  const sidePad = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.68), darkConcreteMat);
  sidePad.position.set(SIDE_POLE_X, sideGroundY + 0.08, SIDE_POLE_Z);
  sidePad.castShadow = true;
  sidePad.receiveShadow = true;
  sidePoleGroup.add(sidePad);

  const sideFlange = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.03, 0.30), darkSteelMat);
  sideFlange.position.set(SIDE_POLE_X, sideGroundY + 0.275, SIDE_POLE_Z);
  sideFlange.castShadow = true;
  sidePoleGroup.add(sideFlange);

  const lowerMastTopY = 4.28;
  const lowerMastBaseY = sideGroundY + 0.28;
  const lowerMastH = lowerMastTopY - lowerMastBaseY;
  const sideLowerMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.052, lowerMastH, 16),
    steelMat
  );
  sideLowerMast.position.set(SIDE_POLE_X, lowerMastBaseY + lowerMastH * 0.5, SIDE_POLE_Z);
  sideLowerMast.castShadow = true;
  sidePoleGroup.add(sideLowerMast);

  // Telescoping upper mast + boom arm + solar panel + LoRa antenna + enclosure clamp
  const sidePoleHeadGroup = new THREE.Group();
  sidePoleHeadGroup.name = 'SidePoleUpperBoomGroup';

  const sideUpperMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.036, 1.0, 16),
    steelMat
  );
  sideUpperMast.scale.y = 2.23;
  sideUpperMast.position.set(SIDE_POLE_X, 3.85 + 2.23 * 0.5, SIDE_POLE_Z);
  sideUpperMast.castShadow = true;
  sidePoleHeadGroup.add(sideUpperMast);

  const sideMastCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.054, 0.054, 0.16, 16),
    darkSteelMat
  );
  sideMastCollar.position.set(SIDE_POLE_X, 6.04, SIDE_POLE_Z);
  sidePoleHeadGroup.add(sideMastCollar);

  // Horizontal cantilevered boom reaching out over the riverbank margin (z = -8.48 -> -5.28 at y = 6.055)
  const boomLen = Math.abs(SIDE_BOOM_TIP_Z - SIDE_POLE_Z) + 0.14;
  const sideBoomArm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, boomLen), steelMat);
  sideBoomArm.position.set(SIDE_POLE_X, 6.055, 0.5 * (SIDE_POLE_Z + SIDE_BOOM_TIP_Z));
  sideBoomArm.castShadow = true;
  sidePoleHeadGroup.add(sideBoomArm);

  // Diagonal structural gusset strut from mast (y=4.95) to mid-boom (z=-6.55)
  const strutP1 = new THREE.Vector3(SIDE_POLE_X, 4.95, SIDE_POLE_Z + 0.02);
  const strutP2 = new THREE.Vector3(SIDE_POLE_X, 6.04, -6.55);
  const strutDir = strutP2.clone().sub(strutP1);
  const strutLen = strutDir.length();
  const sideBoomStrut = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, strutLen), steelMat);
  sideBoomStrut.position.copy(strutP1).lerp(strutP2, 0.5);
  sideBoomStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), strutDir.normalize());
  sideBoomStrut.castShadow = true;
  sidePoleHeadGroup.add(sideBoomStrut);

  // Reused boom-tip sensor head brackets for LiDAR, Pi NoIR Camera & 850nm IR Illuminator
  addSensorHeadBrackets(
    sidePoleHeadGroup,
    SIDE_POLE_X,
    DEFAULT_SIDE_POLE_MOUNT_Y,
    SIDE_BOOM_TIP_Z,
    DEFAULT_SIDE_POLE_MOUNT_Y - 0.08,
    SIDE_BOOM_TIP_Z - 0.03,
    0.54,
    6.055
  );

  // Enclosure pole clamp & side router shelf
  const sideBoxClamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.05), darkSteelMat);
  sideBoxClamp.position.set(SIDE_POLE_X, 4.95, SIDE_POLE_Z + 0.11);
  sidePoleHeadGroup.add(sideBoxClamp);

  const sideRouterShelfArm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.04), steelMat);
  sideRouterShelfArm.position.set(SIDE_POLE_X - 0.18, 4.91, SIDE_POLE_Z);
  sidePoleHeadGroup.add(sideRouterShelfArm);

  const sideRouterShelf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), darkSteelMat);
  sideRouterShelf.position.set(SIDE_POLE_X - 0.34, 4.925, SIDE_POLE_Z);
  sidePoleHeadGroup.add(sideRouterShelf);

  // Tilted Monocrystalline Solar Panel Assembly
  const solarMountGroup = new THREE.Group();
  solarMountGroup.position.set(SIDE_POLE_X, 6.52, SIDE_POLE_Z - 0.05);
  solarMountGroup.rotation.x = 0.42; // ~24 deg tilt toward channel / sun

  const solarFrame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.032, 0.54), steelMat);
  solarFrame.castShadow = true;
  solarMountGroup.add(solarFrame);

  const solarCellPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.008, 0.50),
    new THREE.MeshStandardMaterial({ map: createSolarPanelTexture(), roughness: 0.22, metalness: 0.35 })
  );
  solarCellPlate.position.y = 0.017;
  solarMountGroup.add(solarCellPlate);

  const solarRearBracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), darkSteelMat);
  solarRearBracket.position.set(0, -0.07, 0.04);
  solarMountGroup.add(solarRearBracket);
  sidePoleHeadGroup.add(solarMountGroup);

  // LoRa / RF Omnidirectional Mast-Top Antenna
  const loraGroup = new THREE.Group();
  loraGroup.position.set(SIDE_POLE_X + 0.22, 6.66, SIDE_POLE_Z);

  const loraArm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.045), steelMat);
  loraArm.position.set(-0.11, 0, 0);
  loraGroup.add(loraArm);

  const loraBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.020, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4a44a, roughness: 0.3, metalness: 0.85 })
  );
  loraBase.position.y = 0.035;
  loraGroup.add(loraBase);

  const loraWhip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.010, 0.015, 0.72, 12),
    new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.35, metalness: 0.05 })
  );
  loraWhip.position.y = 0.42;
  loraWhip.castShadow = true;
  loraGroup.add(loraWhip);

  const loraTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 10, 10),
    darkSteelMat
  );
  loraTip.position.y = 0.78;
  loraGroup.add(loraTip);
  sidePoleHeadGroup.add(loraGroup);

  sidePoleGroup.add(sidePoleHeadGroup);
  group.add(sidePoleGroup);

  /* -------------------- 3c. Lab-Style Side Pole Assembly (Cloned Control Lab Tank PVC Gantry) -------------------- */

  const LAB_POLE_SCALE = 2.2526; // Maps lab height (1.243 m) on 3.20 m bank -> H_mount = 6.00 m
  const labPoleGantry = createGantryFrame({
    name: 'LabStyleSidePoleAssembly',
    scale: LAB_POLE_SCALE,
    enclosureScale: LAB_POLE_SCALE,
    baseY: BANK_TOP_Y,
    centerX: SIDE_POLE_X,
    postZ: -6.70,
    cantileverSpanZ: 1.80,
    railOffsetZ: 1.35,
    topOffsetFromFloor: 2.07,
    isRiverLabPole: true,
    addBaseAnchors: true,
    minLidarY: 4.50,
    maxLidarY: 7.50,
  });
  const labPoleGroup = labPoleGantry.group;
  labPoleGroup.visible = false;
  group.add(labPoleGroup);

  const labPoleMountAnchor = labPoleGantry.sensorMountPos.lidar;
  const labPoleCameraAnchor = labPoleGantry.sensorMountPos.camera;
  const labPoleIrAnchor = labPoleGantry.sensorMountPos.ir;
  const labPoleControlBoxAnchor = labPoleGantry.sensorMountPos.controlBox;
  const labPoleRouterAnchor = labPoleGantry.sensorMountPos.router;

  /* -------------------- 4. Graduated Riverbank Staff Gauge at (1.5, -5.4) -------------------- */

  const gaugeBedY = guimbalBedHeightAtZ(-5.4);
  const gaugeYBottom = Number((Math.ceil((gaugeBedY + 0.21) * 10) / 10).toFixed(1));
  const gaugeYTop = 3.80;
  const gaugeHeight = gaugeYTop - gaugeYBottom;
  const staffTex = createStaffGaugeTexture(gaugeYBottom, gaugeYTop);

  const staffGroup = new THREE.Group();
  staffGroup.name = 'RiverbankStaffGauge';
  staffGroup.position.set(1.5, 0, -5.4);

  const gaugePad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.28, 12), darkConcreteMat);
  gaugePad.position.y = gaugeBedY + 0.06;
  staffGroup.add(gaugePad);

  const gaugePost = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, gaugeYTop - gaugeBedY + 0.15, 0.08),
    darkSteelMat
  );
  gaugePost.position.set(0, gaugeBedY + (gaugeYTop - gaugeBedY) * 0.5, -0.05);
  gaugePost.castShadow = true;
  staffGroup.add(gaugePost);

  const gaugeBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, gaugeHeight, 0.025),
    [
      steelMat,
      steelMat,
      steelMat,
      steelMat,
      new THREE.MeshStandardMaterial({ map: staffTex, roughness: 0.35 }),
      steelMat,
    ]
  );
  gaugeBoard.position.set(0, gaugeYBottom + gaugeHeight * 0.5, 0.005);
  gaugeBoard.castShadow = true;
  staffGroup.add(gaugeBoard);

  group.add(staffGroup);

  /* -------------------- 5. 4 Surveyed High-Contrast GCP Markers (Bridge Ortho vs Side-Pole Trapezoidal) -------------------- */

  const BRIDGE_GCP_COORDS = [
    { id: 'GCP-1', x: -2.2, z: -4.8, tiltX: 0.18 },
    { id: 'GCP-2', x: 3.6, z: -4.8, tiltX: 0.18 },
    { id: 'GCP-3', x: -2.2, z: 4.8, tiltX: -0.18 },
    { id: 'GCP-4', x: 3.6, z: 4.8, tiltX: -0.18 },
  ];

  const SIDE_POLE_GCP_COORDS = [
    { id: 'GCP-1', x: -0.30, z: -4.6, tiltX: 0.22 },
    { id: 'GCP-2', x: 4.50, z: -4.6, tiltX: 0.22 },
    { id: 'GCP-3', x: -1.90, z: 4.6, tiltX: -0.22 },
    { id: 'GCP-4', x: 6.10, z: 4.6, tiltX: -0.22 },
  ];

  const LAB_POLE_GCP_COORDS = [
    { id: 'GCP-1', x: 0.20, z: -3.55, tiltX: 0.24 },
    { id: 'GCP-2', x: 4.10, z: -3.55, tiltX: 0.24 },
    { id: 'GCP-3', x: -1.60, z: 4.80, tiltX: -0.24 },
    { id: 'GCP-4', x: 5.90, z: 4.80, tiltX: -0.24 },
  ];

  const gcpWorldPoints = [];
  const gcpMarkers = [];
  const gcpGroup = new THREE.Group();
  gcpGroup.name = 'SurveyedGCPMarkers';

  for (const cfg of BRIDGE_GCP_COORDS) {
    const by = guimbalBedHeightAtZ(cfg.z);
    const wy = by + 0.12;
    const pt = new THREE.Vector3(cfg.x, wy, cfg.z);
    pt.id = cfg.id;
    gcpWorldPoints.push(pt);

    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 10), darkSteelMat);
    stake.position.set(cfg.x, by, cfg.z);
    gcpGroup.add(stake);

    const plateMat = new THREE.MeshStandardMaterial({
      map: createGcpTargetTexture(cfg.id),
      roughness: 0.45,
      metalness: 0.05,
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.025, 0.50), plateMat);
    plate.position.set(cfg.x, wy, cfg.z);
    plate.rotation.x = cfg.tiltX;
    plate.castShadow = true;
    plate.receiveShadow = true;
    gcpGroup.add(plate);
    gcpMarkers.push({ id: cfg.id, stake, plate, pt, by, cfg });
  }

  group.add(gcpGroup);

  /* -------------------- 6. Toggleable PyORC Ortho-Rectification Wireframe Grid -------------------- */

  const gcpGridGroup = new THREE.Group();
  gcpGridGroup.name = 'PyOrcOrthoGrid';

  const subX = 12;
  const subZ = 16;
  const gridVerts = new Float32Array(((subX + 1) + (subZ + 1)) * 2 * 3);
  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute('position', new THREE.BufferAttribute(gridVerts, 3));
  const gridLines = new THREE.LineSegments(
    gridGeom,
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.68,
    })
  );
  gcpGridGroup.add(gridLines);

  const perimVerts = new Float32Array(12 * 3);
  const perimGeom = new THREE.BufferGeometry();
  perimGeom.setAttribute('position', new THREE.BufferAttribute(perimVerts, 3));
  const perimLines = new THREE.LineSegments(
    perimGeom,
    new THREE.LineBasicMaterial({
      color: 0xff8c2b,
      transparent: true,
      opacity: 0.85,
    })
  );
  gcpGridGroup.add(perimLines);

  let activeGcpMode = null;

  function syncGcpMarkerElevations(liveWL) {
    for (let i = 0; i < gcpMarkers.length; i++) {
      const m = gcpMarkers[i];
      const plateY = Math.max(m.by + 0.12, liveWL + 0.04);
      const stakeH = Math.max(0.28, plateY - m.by + 0.04);
      m.stake.scale.y = stakeH;
      m.stake.position.set(m.cfg.x, m.by + stakeH * 0.5 - 0.04, m.cfg.z);
      m.plate.position.set(m.cfg.x, plateY, m.cfg.z);
      m.pt.set(m.cfg.x, plateY, m.cfg.z);
    }
  }

  function applyGcpLayout(mountMode, liveWL = 1.15) {
    const nextKey =
      mountMode === 'lab_pole'
        ? 'lab_pole'
        : mountMode === 'side_pole'
          ? 'side_pole'
          : 'bridge';
    if (activeGcpMode === nextKey) {
      syncGcpMarkerElevations(liveWL);
      return;
    }
    activeGcpMode = nextKey;

    const coords =
      nextKey === 'lab_pole'
        ? LAB_POLE_GCP_COORDS
        : nextKey === 'side_pole'
          ? SIDE_POLE_GCP_COORDS
          : BRIDGE_GCP_COORDS;
    for (let i = 0; i < coords.length; i++) {
      const cfg = coords[i];
      const by = guimbalBedHeightAtZ(cfg.z);
      const m = gcpMarkers[i];
      m.by = by;
      m.cfg = cfg;
      m.plate.rotation.x = cfg.tiltX;
    }
    syncGcpMarkerElevations(liveWL);

    // Bilinear interpolation across [c1, c2] (near bank) and [c3, c4] (far bank)
    const [c1, c2, c3, c4] = coords;
    const interp = (u, v) => ({
      x: (1 - v) * ((1 - u) * c1.x + u * c2.x) + v * ((1 - u) * c3.x + u * c4.x),
      z: (1 - v) * ((1 - u) * c1.z + u * c2.z) + v * ((1 - u) * c3.z + u * c4.z),
    });

    const gPos = gridGeom.attributes.position;
    let ptr = 0;
    for (let i = 0; i <= subX; i++) {
      const u = i / subX;
      const p0 = interp(u, 0);
      const p1 = interp(u, 1);
      gPos.setXYZ(ptr++, p0.x, 0, p0.z);
      gPos.setXYZ(ptr++, p1.x, 0, p1.z);
    }
    for (let j = 0; j <= subZ; j++) {
      const v = j / subZ;
      const p0 = interp(0, v);
      const p1 = interp(1, v);
      gPos.setXYZ(ptr++, p0.x, 0, p0.z);
      gPos.setXYZ(ptr++, p1.x, 0, p1.z);
    }
    gPos.needsUpdate = true;
    gridGeom.computeBoundingSphere();

    const pPos = perimGeom.attributes.position;
    const perimPairs = [
      [c1, c2], [c2, c4], [c4, c3], [c3, c1], [c1, c4], [c2, c3],
    ];
    let pIdx = 0;
    for (const [a, b] of perimPairs) {
      pPos.setXYZ(pIdx++, a.x, 0, a.z);
      pPos.setXYZ(pIdx++, b.x, 0, b.z);
    }
    pPos.needsUpdate = true;
    perimGeom.computeBoundingSphere();
  }

  applyGcpLayout('bridge', 1.15);
  group.add(gcpGridGroup);

  /* -------------------- 7. Toggleable 3D Bathymetry Cross-Section Slice at x = 0.8 -------------------- */

  const sliceGroup = new THREE.Group();
  sliceGroup.name = 'BathymetryCrossSectionSlice';
  const SLICE_X = 0.8;
  const SLICE_SAMPLES = 96;
  const SLICE_Z_MIN = -10.0;
  const SLICE_Z_MAX = 10.0;

  // Bed profile line at x = 0.8
  const bedLinePts = [];
  for (let i = 0; i <= SLICE_SAMPLES; i++) {
    const z = SLICE_Z_MIN + (i / SLICE_SAMPLES) * (SLICE_Z_MAX - SLICE_Z_MIN);
    bedLinePts.push(new THREE.Vector3(SLICE_X, guimbalBedHeightAtZ(z) + 0.02, z));
  }
  const bedLineGeom = new THREE.BufferGeometry().setFromPoints(bedLinePts);
  const bedProfileLine = new THREE.Line(
    bedLineGeom,
    new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 })
  );
  sliceGroup.add(bedProfileLine);

  // Dynamic Wetted Area A(WL) curtain mesh (triangle strip pairs between bed and max(bed, WL))
  const wettedVerts = new Float32Array((SLICE_SAMPLES + 1) * 2 * 3);
  const wettedIndices = [];
  for (let i = 0; i < SLICE_SAMPLES; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    wettedIndices.push(a, b, c, b, d, c);
  }
  const wettedGeom = new THREE.BufferGeometry();
  wettedGeom.setAttribute('position', new THREE.BufferAttribute(wettedVerts, 3));
  wettedGeom.setIndex(wettedIndices);

  const wettedMesh = new THREE.Mesh(
    wettedGeom,
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  wettedMesh.renderOrder = 5;
  sliceGroup.add(wettedMesh);

  // Top water-level chord line at x = 0.8
  const chordVerts = new Float32Array((SLICE_SAMPLES + 1) * 3);
  const chordGeom = new THREE.BufferGeometry();
  chordGeom.setAttribute('position', new THREE.BufferAttribute(chordVerts, 3));
  const chordLine = new THREE.Line(
    chordGeom,
    new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.92 })
  );
  sliceGroup.add(chordLine);

  // Depth gauge vertical ticks every 1.0 m across Z
  const tickZList = [];
  for (let tz = -8; tz <= 8; tz += 1.0) tickZList.push(tz);
  const tickVerts = new Float32Array(tickZList.length * 2 * 3);
  const tickGeom = new THREE.BufferGeometry();
  tickGeom.setAttribute('position', new THREE.BufferAttribute(tickVerts, 3));
  const tickLines = new THREE.LineSegments(
    tickGeom,
    new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.72 })
  );
  sliceGroup.add(tickLines);

  function updateBathymetrySlice(wl) {
    const wPos = wettedGeom.attributes.position;
    const cPos = chordGeom.attributes.position;

    for (let i = 0; i <= SLICE_SAMPLES; i++) {
      const z = SLICE_Z_MIN + (i / SLICE_SAMPLES) * (SLICE_Z_MAX - SLICE_Z_MIN);
      const bedY = guimbalBedHeightAtZ(z);
      const topY = Math.max(bedY, wl);

      wPos.setXYZ(i * 2, SLICE_X, bedY + 0.015, z);
      wPos.setXYZ(i * 2 + 1, SLICE_X, topY + 0.015, z);
      cPos.setXYZ(i, SLICE_X, topY + 0.025, z);
    }
    wPos.needsUpdate = true;
    cPos.needsUpdate = true;
    wettedGeom.computeBoundingSphere();

    const tPos = tickGeom.attributes.position;
    for (let i = 0; i < tickZList.length; i++) {
      const tz = tickZList[i];
      const by = guimbalBedHeightAtZ(tz);
      const ty = Math.max(by, wl);
      tPos.setXYZ(i * 2, SLICE_X, by + 0.015, tz);
      tPos.setXYZ(i * 2 + 1, SLICE_X, ty + 0.015, tz);
    }
    tPos.needsUpdate = true;
  }

  updateBathymetrySlice(1.15);
  group.add(sliceGroup);

  /* -------------------- 8. Toggleable Monsoon Rain Particle Streaks -------------------- */

  const RAIN_COUNT = 1200;
  const rainDrops = [];
  const rainVerts = new Float32Array(RAIN_COUNT * 2 * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    const rx = (((i * 193 + 7) % 1000) / 1000) * 24 - 11;
    const ry = (((i * 271 + 19) % 1000) / 1000) * 8.5;
    const rz = (((i * 131 + 43) % 1000) / 1000) * 18 - 9;
    rainDrops.push({ x: rx, y: ry, z: rz, speed: 9.5 + (i % 7) * 0.7 });
  }
  const rainGeom = new THREE.BufferGeometry();
  rainGeom.setAttribute('position', new THREE.BufferAttribute(rainVerts, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xcbe8ff,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const rainStreaks = new THREE.LineSegments(rainGeom, rainMat);
  rainStreaks.name = 'MonsoonRainStreaks';
  rainStreaks.visible = false;
  group.add(rainStreaks);

  /* -------------------- 9. Update Loop -------------------- */

  function getActiveGcpCorners() {
    const coords =
      activeGcpMode === 'lab_pole'
        ? LAB_POLE_GCP_COORDS
        : activeGcpMode === 'side_pole'
          ? SIDE_POLE_GCP_COORDS
          : BRIDGE_GCP_COORDS;
    return coords.map((c) => ({ ...c }));
  }

  let lastMountMode = null;
  let lastSliceWL = -99;

  function update(dt, state = {}, riverMetrics = null) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    const mountMode =
      state.riverMountMode === 'lab_pole'
        ? 'lab_pole'
        : state.riverMountMode === 'side_pole'
          ? 'side_pole'
          : 'bridge';
    const isAnySidePole = mountMode === 'side_pole' || mountMode === 'lab_pole';

    // Tri-placement visibility: Bridge Structure + Mount vs Galvanized Side-Pole vs Cloned Lab-Style Side Pole
    bridgeGroup.visible = mountMode === 'bridge';
    bridgeSensorMountGroup.visible = mountMode === 'bridge';
    sidePoleGroup.visible = mountMode === 'side_pole';
    labPoleGroup.visible = mountMode === 'lab_pole';

    // Proposal profile excludes solar panel & LoRa antenna (FINAL PAPER_RIVER.pdf p. 13)
    const isEdgeLora = state.architectureProfile === 'edge_lora';
    solarMountGroup.visible = isEdgeLora;
    loraGroup.visible = isEdgeLora;

    // Resolve live water level WL for GCP elevation, ortho grid & bathymetry cutaway
    const liveWL = clamp(
      Number(
        riverMetrics?.waterLevelM ??
          state.liveRiverWaterLevelM ??
          state.waterLevelM ??
          state.riverStageM ??
          1.15
      ),
      0.1,
      3.5
    );

    const wlMoved = Math.abs(liveWL - lastSliceWL) > 0.002;
    const modeChanged = mountMode !== lastMountMode;
    if (modeChanged || wlMoved) {
      applyGcpLayout(mountMode, liveWL);
      updateShorelineWetness(liveWL);
    }

    // Adjustable bridge sensor mast elevation H (default 4.5 m)
    const rawH =
      state.riverLidarHeightM !== undefined
        ? Number(state.riverLidarHeightM)
        : state.lidarHeightM !== undefined && Number(state.lidarHeightM) >= 2.0
          ? Number(state.lidarHeightM)
          : DEFAULT_RIVER_MOUNT_Y;
    const clampedH = clamp(Number.isFinite(rawH) ? rawH : DEFAULT_RIVER_MOUNT_Y, 3.2, 6.5);
    const deltaH = clampedH - DEFAULT_RIVER_MOUNT_Y;
    poleHeadGroup.position.y = deltaH;
    mountAnchor.y = DEFAULT_RIVER_MOUNT_Y + deltaH;
    cameraAnchor.y = DEFAULT_RIVER_CAM_Y + deltaH;

    // Adjustable riverbank side-pole elevation H_mount (default 6.00 m)
    const rawSideH =
      state.sidePoleHeightM !== undefined
        ? Number(state.sidePoleHeightM)
        : DEFAULT_SIDE_POLE_MOUNT_Y;
    const clampedSideH = clamp(Number.isFinite(rawSideH) ? rawSideH : DEFAULT_SIDE_POLE_MOUNT_Y, 4.5, 7.5);
    const sideDeltaH = clampedSideH - DEFAULT_SIDE_POLE_MOUNT_Y;
    sidePoleHeadGroup.position.y = sideDeltaH;
    const upperBotLocal = 3.85 - sideDeltaH;
    const upperH = Math.max(0.4, 6.08 - upperBotLocal);
    sideUpperMast.scale.y = upperH;
    sideUpperMast.position.set(SIDE_POLE_X, upperBotLocal + upperH * 0.5, SIDE_POLE_Z);
    sideMountAnchor.y = DEFAULT_SIDE_POLE_MOUNT_Y + sideDeltaH;
    sideCameraAnchor.y = DEFAULT_SIDE_POLE_MOUNT_Y - 0.08 + sideDeltaH;
    sideIrAnchor.y = DEFAULT_SIDE_POLE_MOUNT_Y - 0.08 + sideDeltaH;
    sideControlBoxAnchor.y = 4.95 + sideDeltaH;
    sideRouterAnchor.y = 4.95 + sideDeltaH;

    // Update cloned Lab-Style Side Pole telescopic drop rail
    labPoleGantry.update({ sidePoleHeightM: clampedSideH });

    // Align bathymetry cutaway slice with active station transect
    sliceGroup.position.x = isAnySidePole ? (SIDE_POLE_X - SLICE_X) : 0.0;

    // Toggle PyORC GCP Ortho Grid
    const showGrid =
      state.showGcpGrid !== undefined
        ? Boolean(state.showGcpGrid)
        : state.gcpGridVisible !== undefined
          ? Boolean(state.gcpGridVisible)
          : true;
    gcpGridGroup.visible = showGrid;
    if (showGrid) {
      gcpGridGroup.position.y = liveWL + 0.025;
    }

    // Toggle 3D Cross-Section Bathymetry Cutaway Slice (cached by WL change)
    const showSlice =
      state.showBathymetrySlice !== undefined
        ? Boolean(state.showBathymetrySlice)
        : state.bathymetrySlice !== undefined
          ? Boolean(state.bathymetrySlice)
          : true;
    sliceGroup.visible = showSlice;
    if (showSlice && (modeChanged || wlMoved)) {
      updateBathymetrySlice(liveWL);
    }
    if (modeChanged || wlMoved) {
      lastMountMode = mountMode;
      lastSliceWL = liveWL;
    }

    // Toggle & animate rain particle streaks (respawn upon hitting bridge deck, bank, or water surface)
    const rainAmt = clamp(Number(state.rainIntensity ?? 0), 0, 1);
    rainStreaks.visible = rainAmt > 0.02;
    if (rainStreaks.visible) {
      const activeCount = Math.max(40, Math.floor(RAIN_COUNT * rainAmt));
      rainGeom.setDrawRange(0, activeCount * 2);
      rainMat.opacity = 0.20 + 0.45 * rainAmt;

      const rPos = rainGeom.attributes.position;
      for (let i = 0; i < activeCount; i++) {
        const d = rainDrops[i];
        d.y -= d.speed * clampedDt;
        d.x += 1.5 * clampedDt;
        const onBridge = mountMode === 'bridge' && Math.abs(d.x) < 1.15 && Math.abs(d.z) < 11.4;
        const hitY = onBridge ? 5.24 : Math.max(liveWL, guimbalBedHeightAtZ(d.z));
        if (d.y < hitY) {
          d.y = hitY + 5.2 + ((i * 53) % 100) * 0.035;
          d.x = (((i * 193 + 7) % 1000) / 1000) * 24 - 11;
        }
        const streakLen = 0.28 + 0.22 * rainAmt;
        rPos.setXYZ(i * 2, d.x, d.y, d.z);
        rPos.setXYZ(i * 2 + 1, d.x - 0.06, d.y + streakLen, d.z);
      }
      rPos.needsUpdate = true;
    }

    // Subtle night mode darkening on terrain, grass & concrete
    const night = Boolean(state.nightMode);
    terrainMat.color.setHex(night ? 0x5c6473 : 0xffffff);
    grassMat.color.setHex(night ? 0x3b4858 : 0xffffff);
    grassBladeMat.color.setHex(night ? 0x243b24 : 0x4b8733);
    concreteMat.color.setHex(night ? 0x565b64 : 0x8d9196);
  }

  return {
    group,
    mountAnchor,
    cameraAnchor,
    sideMountAnchor,
    sideCameraAnchor,
    sideIrAnchor,
    sideControlBoxAnchor,
    sideRouterAnchor,
    labPoleMountAnchor,
    labPoleCameraAnchor,
    labPoleIrAnchor,
    labPoleControlBoxAnchor,
    labPoleRouterAnchor,
    labPoleEnclosureScale: LAB_POLE_SCALE,
    labPoleTopRailY: labPoleGantry.topY,
    gcpWorldPoints,
    getActiveGcpCorners,
    update,
    getBedHeightAtZ: guimbalBedHeightAtZ,
  };
}

export { guimbalBedHeightAtZ, createRiverField };
