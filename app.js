import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const RiverSimModules = {};

/* === MODULE: src/scene/flumeTank.js === */
RiverSimModules.flumeTank = (function (THREE) {
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Generates a CanvasTexture using a user draw callback.
 */
function createCanvasTexture(
  width,
  height,
  drawFn,
  repeatX = 1,
  repeatY = 1,
  colorSpace = THREE.SRGBColorSpace
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Builds procedural bamboo culm texture (golden-tan fibers + dark node rings).
 */
function createBambooTexture() {
  return createCanvasTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#96724b');
    grad.addColorStop(0.28, '#ba9364');
    grad.addColorStop(0.55, '#a88154');
    grad.addColorStop(0.85, '#c29b6b');
    grad.addColorStop(1, '#8b6843');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Longitudinal bamboo grain streaks
    for (let i = 0; i < 420; i++) {
      const y = (i * 19.7) % h;
      const alpha = 0.04 + ((i * 7) % 10) * 0.008;
      ctx.fillStyle = i % 2 === 0 ? `rgba(60,40,18,${alpha})` : `rgba(240,210,165,${alpha})`;
      ctx.fillRect(0, y, w, 1 + (i % 2));
    }

    // Bamboo node rings
    for (const nx of [96, 280, 440]) {
      ctx.fillStyle = 'rgba(55, 34, 16, 0.55)';
      ctx.fillRect(nx - 3, 0, 6, h);
      ctx.fillStyle = 'rgba(220, 190, 145, 0.35)';
      ctx.fillRect(nx + 3, 0, 3, h);
    }
  });
}

/**
 * Builds procedural weathered yellow & upper concrete lab studio wall texture.
 */
function createStudioWallTexture() {
  return createCanvasTexture(512, 512, (ctx, w, h) => {
    // Upper concrete plaster band
    ctx.fillStyle = '#8b8d89';
    ctx.fillRect(0, 0, w, h * 0.28);

    // Warm yellow/ochre painted lower plaster (matching lab photos 2-4)
    const wallGrad = ctx.createLinearGradient(0, h * 0.28, 0, h);
    wallGrad.addColorStop(0, '#c8ae48');
    wallGrad.addColorStop(0.4, '#d1b544');
    wallGrad.addColorStop(1, '#b69936');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, h * 0.28, w, h * 0.72);

    // Soft concrete plaster mottling near top transition
    for (let i = 0; i < 650; i++) {
      const x = (i * 97) % w;
      const y = (i * 53) % h;
      const r = 4 + (i % 18);
      const isUpper = y < h * 0.32;
      ctx.fillStyle = isUpper
        ? 'rgba(55, 58, 52, 0.06)'
        : i % 3 === 0
          ? 'rgba(130, 110, 40, 0.045)'
          : 'rgba(245, 232, 165, 0.04)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle dark vertical column accent matching background corner
    ctx.fillStyle = 'rgba(52, 46, 44, 0.32)';
    ctx.fillRect(w * 0.14, 0, w * 0.075, h);
  });
}

/**
 * Builds subtle porous white styrofoam/filter-foam surface texture.
 */
function createFoamTexture() {
  return createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3f5f8';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const x = (i * 73) % w;
      const y = (i * 139) % h;
      const r = 0.8 + (i % 3) * 0.8;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(205, 214, 224, 0.45)' : 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 2, 2);
}

/**
 * Deterministic PRNG for reproducible sand contours and rock packing.
 */
function createSeededRng(seed = 2026) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Builds washed river-sand color and granular bump textures for the flume substrate beds.
 */
function createSandTextures() {
  const rng = createSeededRng(7319);
  const map = createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b49971';
    ctx.fillRect(0, 0, w, h);

    // Soft natural moisture & mineral patches (tiled cleanly across edges)
    for (let i = 0; i < 90; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const r = 8 + rng() * 18;
      const col =
        i % 3 === 0
          ? 'rgba(146, 119, 83, 0.14)'
          : i % 3 === 1
            ? 'rgba(208, 186, 148, 0.14)'
            : 'rgba(122, 98, 68, 0.10)';
      ctx.fillStyle = col;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Fine mineral sand grains: quartz, warm tan, ochre, and dark mica flecks
    const grainCols = ['#d9c7a8', '#c8b08a', '#9c8058', '#856b48', '#564736', '#e3d5bc'];
    for (let i = 0; i < 5600; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const sz = 1.0 + rng() * 1.4;
      ctx.fillStyle = grainCols[Math.floor(rng() * grainCols.length)];
      ctx.globalAlpha = 0.4 + rng() * 0.45;
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.globalAlpha = 1.0;
  });

  const bumpRng = createSeededRng(7319);
  const bumpMap = createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) {
        const x = bumpRng() * w;
        const y = bumpRng() * h;
        const sz = 1.0 + bumpRng() * 1.4;
        const v = Math.floor(60 + bumpRng() * 165);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, sz, sz);
      }
    },
    1,
    1,
    THREE.NoColorSpace
  );

  return { map, bumpMap };
}

/**
 * Builds neutral stone grain color & bump textures (tinted per rock via InstancedMesh colors).
 */
function createRockTextures() {
  const rng = createSeededRng(9413);
  const map = createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e7e2d8';
    ctx.fillRect(0, 0, w, h);

    // Subtle sedimentary weathering streaks and mineral mottling
    for (let i = 0; i < 160; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const rx = 6 + rng() * 22;
      const ry = 2 + rng() * 8;
      const shade = Math.floor(170 + rng() * 75);
      ctx.fillStyle = `rgba(${shade}, ${shade - 4}, ${shade - 10}, 0.24)`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (rng() - 0.5) * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 2400; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const sz = 1.0 + rng() * 1.5;
      const v = rng() > 0.35 ? Math.floor(195 + rng() * 55) : Math.floor(95 + rng() * 65);
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 7},0.38)`;
      ctx.fillRect(x, y, sz, sz);
    }
  });

  const bumpRng = createSeededRng(9413);
  const bumpMap = createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#828282';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i++) {
        const y = bumpRng() * h;
        const thick = 1 + bumpRng() * 3.5;
        const v = Math.floor(95 + bumpRng() * 90);
        ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
        ctx.fillRect(0, y, w, thick);
      }
      for (let i = 0; i < 2600; i++) {
        const x = bumpRng() * w;
        const y = bumpRng() * h;
        const sz = 1.0 + bumpRng() * 1.6;
        const v = Math.floor(55 + bumpRng() * 175);
        ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
        ctx.fillRect(x, y, sz, sz);
      }
    },
    1,
    1,
    THREE.NoColorSpace
  );

  return { map, bumpMap };
}

/**
 * Generates watertight organic river rock & cobble geometries via purely spatial noise.
 * Variants 0-1: angular/stratified feature stones; Variants 2-4: smooth water-worn cobbles/pebbles.
 */
function createOrganicRockGeometry(variantIdx) {
  const geom = new THREE.IcosahedronGeometry(1, 2);
  const pos = geom.attributes.position;
  let maxExtent = 1.0;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.hypot(vx, vy, vz) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const nz = vz / len;

    let sx = 1.0;
    let sy = 1.0;
    let sz = 1.0;
    let disp = 1.0;

    if (variantIdx === 0) {
      // Stratified / grooved weathered river rock
      sx = 1.12;
      sy = 0.74;
      sz = 0.92;
      const strata = Math.sin(ny * 13.0 + nx * 2.8) * 0.065;
      const lobe = Math.sin(nx * 3.6 + 0.7) * Math.cos(nz * 3.2 - 0.4) * 0.14;
      const facet = Math.sin(nx * 5.8 - nz * 4.9 + ny * 3.1) * 0.06;
      disp = 0.96 + strata + lobe + facet;
    } else if (variantIdx === 1) {
      // Craggy asymmetric river boulder
      sx = 1.06;
      sy = 0.78;
      sz = 0.96;
      const lobe = Math.cos(nx * 2.9 - ny * 2.2) * Math.sin(nz * 3.7 + 0.8) * 0.15;
      const ridge = Math.sin(ny * 6.4 + nz * 4.2) * 0.07;
      disp = 0.97 + lobe + ridge;
    } else if (variantIdx === 2) {
      // Smooth water-worn oval river cobble
      sx = 1.16;
      sy = 0.64;
      sz = 0.90;
      const smoothAsym = Math.sin(nx * 2.1 + nz * 1.7) * 0.06 + Math.cos(ny * 2.5 - nx * 1.4) * 0.04;
      disp = 0.98 + smoothAsym;
    } else if (variantIdx === 3) {
      // Flat skimming river pebble
      sx = 1.10;
      sy = 0.52;
      sz = 0.96;
      const pillow = Math.sin(nx * 2.4 - nz * 2.1) * 0.055;
      disp = 0.98 + pillow;
    } else {
      // Chunky rounded pebble
      sx = 1.02;
      sy = 0.76;
      sz = 0.94;
      const dimple = Math.cos(nx * 3.1 + ny * 2.6 + nz * 2.9) * 0.07;
      disp = 0.98 + dimple;
    }

    const px = nx * sx * disp;
    const py = ny * sy * disp;
    const pz = nz * sz * disp;
    pos.setXYZ(i, px, py, pz);
    maxExtent = Math.max(maxExtent, Math.abs(px), Math.abs(py), Math.abs(pz));
  }

  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  geom.userData.maxExtent = maxExtent;
  return geom;
}

/**
 * Deterministic undulating sand-bed elevation at (worldX, worldZ) inside a stepped compartment.
 */
function sampleSandTopY(spec, worldX, worldZ) {
  const u = clamp((worldX - spec.xMin) / Math.max(0.01, spec.xMax - spec.xMin), 0, 1);
  const v = clamp((worldZ + 0.171) / 0.342, 0, 1);
  const amp = spec.sandWaveAmp ?? 0.0042;
  const ripple =
    Math.sin(u * Math.PI * 2.4 + spec.phase) * Math.cos(v * Math.PI * 1.8 - spec.phase * 0.7) * amp +
    Math.sin((u * 3.7 - v * 2.5) * Math.PI + spec.phase) * (amp * 0.42);
  // Subtle rise away from the very front glass wall so pebbles bed cleanly along the glass
  const gentleSlope = (0.5 - v) * 0.0022;
  return spec.sandTopY + ripple + gentleSlope;
}

/**
 * Builds an undulating sand bed mesh flush against the step compartment walls above the styrofoam.
 */
function buildStepSandBed(spec, sandMat) {
  const widthX = spec.xMax - spec.xMin - 0.004;
  const centerX = 0.5 * (spec.xMin + spec.xMax);
  const depthZ = 0.342;
  const sandBaseY = spec.foamSlabTopY - 0.001;

  const geom = new THREE.BoxGeometry(widthX, 1, depthZ, 20, 3, 16);
  geom.translate(0, 0.5, 0); // local y in [0, 1]

  const pos = geom.attributes.position;
  const norm = geom.attributes.normal;
  const uv = geom.attributes.uv;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const t = clamp(pos.getY(i), 0, 1);
    const lz = pos.getZ(i);
    const wx = centerX + lx;
    const topY = sampleSandTopY(spec, wx, lz);
    const wy = sandBaseY + t * Math.max(0.004, topY - sandBaseY);
    pos.setY(i, wy);

    // World-space triplanar UVs for uniform crisp grain across top and front glass cross-section
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    if (ny > 0.5) {
      uv.setXY(i, wx * 7.5, lz * 7.5);
    } else if (nx > 0.5) {
      uv.setXY(i, lz * 7.5, wy * 7.5);
    } else {
      uv.setXY(i, wx * 7.5, wy * 7.5);
    }

    // Subtle damp-sand shading near top water interface and subtle vertical banding along glass
    const topDiff = topY - spec.sandTopY;
    const dampShade = 0.89 + 0.11 * (1 - t) + clamp(topDiff * 10.0, -0.04, 0.05);
    const grainTint = 0.96 + 0.04 * Math.sin(wx * 48.0 + wy * 64.0 + lz * 32.0);
    const s = dampShade * grainTint;
    colors[i * 3] = s;
    colors[i * 3 + 1] = s * 0.985;
    colors[i * 3 + 2] = s * 0.95;
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, sandMat);
  mesh.position.set(centerX, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `SandBed_${spec.id}`;
  return mesh;
}

/**
 * Helper to create a glass panel plus thin emerald-jade cut edge strips along specified borders.
 */
function buildGlassPanel(w, h, d, glassMat, edgeMat, edges = { top: true, left: false, right: false, bottom: false }) {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat);
  pane.renderOrder = 8;
  g.add(pane);

  const rim = 0.0024;
  if (edges.top) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.0004, rim, d + 0.0004), edgeMat);
    strip.position.y = h * 0.5;
    strip.renderOrder = 9;
    g.add(strip);
  }
  if (edges.bottom) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.0004, rim, d + 0.0004), edgeMat);
    strip.position.y = -h * 0.5;
    strip.renderOrder = 9;
    g.add(strip);
  }
  if (edges.left) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(rim, h, d + 0.0004), edgeMat);
    strip.position.x = -w * 0.5;
    strip.renderOrder = 9;
    g.add(strip);
  }
  if (edges.right) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(rim, h, d + 0.0004), edgeMat);
    strip.position.x = w * 0.5;
    strip.renderOrder = 9;
    g.add(strip);
  }
  return g;
}

/**
 * Phase 1: Laboratory Bamboo Bench + Stepped-Weir Glass Flume Tank + Pump/PVC/Valve/Wave-Makers
 */
function createFlumeTank() {
  const group = new THREE.Group();
  group.name = 'FlumeTankAssembly';

  const bambooTex = createBambooTexture();
  const studioWallTex = createStudioWallTexture();
  const foamTex = createFoamTexture();

  /* -------------------- 1. Lab Studio Floor, Backdrop & Bamboo Bench -------------------- */

  const studioGroup = new THREE.Group();
  studioGroup.name = 'LabStudioBackdrop';

  // Concrete lab floor at y = -0.55
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2f3339,
    roughness: 0.88,
    metalness: 0.04,
  });
  const studioFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), floorMat);
  studioFloor.rotation.x = -Math.PI / 2;
  studioFloor.position.set(0, -0.55, 0.2);
  studioFloor.receiveShadow = true;
  studioGroup.add(studioFloor);

  // Subtle yellow/concrete lab studio backdrop at z = -0.50 (FrontSide only so rear orbit stays clear)
  const wallMat = new THREE.MeshStandardMaterial({
    map: studioWallTex,
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 0.78,
    side: THREE.FrontSide,
  });
  const studioWall = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.35), wallMat);
  studioWall.position.set(0, 0.625, -0.50);
  studioWall.receiveShadow = true;
  studioGroup.add(studioWall);

  // Bamboo / wood slatted lab bench (y = -0.55 .. 0.0)
  const bambooMat = new THREE.MeshStandardMaterial({
    map: bambooTex,
    roughness: 0.62,
    metalness: 0.04,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c432b,
    roughness: 0.72,
    metalness: 0.04,
  });

  const benchGroup = new THREE.Group();
  benchGroup.name = 'BambooLabBench';

  // 8 longitudinal bamboo culms forming the slatted tabletop, top tangents flush at y = 0.0
  const culmRadius = 0.021;
  const benchLenX = 1.32;
  const slatZs = [-0.195, -0.140, -0.084, -0.028, 0.028, 0.084, 0.140, 0.195];
  const culmGeo = new THREE.CylinderGeometry(culmRadius, culmRadius, benchLenX, 16);
  culmGeo.rotateZ(Math.PI / 2);

  for (const sz of slatZs) {
    const culm = new THREE.Mesh(culmGeo, bambooMat);
    culm.position.set(0, -culmRadius, sz);
    culm.castShadow = true;
    culm.receiveShadow = true;
    benchGroup.add(culm);
  }

  // Front & rear horizontal apron rails + 4 vertical bamboo legs down to y = -0.55
  const apronGeo = new THREE.CylinderGeometry(0.022, 0.022, benchLenX - 0.04, 14);
  apronGeo.rotateZ(Math.PI / 2);
  for (const az of [-0.19, 0.19]) {
    const rail = new THREE.Mesh(apronGeo, bambooMat);
    rail.position.set(0, -0.08, az);
    rail.castShadow = true;
    rail.receiveShadow = true;
    benchGroup.add(rail);

    const lowRail = new THREE.Mesh(apronGeo, darkWoodMat);
    lowRail.position.set(0, -0.38, az);
    lowRail.castShadow = true;
    benchGroup.add(lowRail);
  }

  const sideCrossGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.42, 12);
  sideCrossGeo.rotateX(Math.PI / 2);
  for (const sx of [-0.58, -0.22, 0.22, 0.58]) {
    const cross = new THREE.Mesh(sideCrossGeo, bambooMat);
    cross.position.set(sx, -0.055, 0);
    cross.castShadow = true;
    benchGroup.add(cross);
  }

  const legGeo = new THREE.CylinderGeometry(0.026, 0.024, 0.53, 14);
  for (const lx of [-0.58, 0.58]) {
    for (const lz of [-0.19, 0.19]) {
      const leg = new THREE.Mesh(legGeo, bambooMat);
      leg.position.set(lx, -0.285, lz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      benchGroup.add(leg);
    }
    // End bamboo arm rails (visible on left & right of tank in Photos 1-4)
    const armRail = new THREE.Mesh(sideCrossGeo, bambooMat);
    armRail.position.set(lx, 0.14, 0);
    armRail.castShadow = true;
    benchGroup.add(armRail);

    const armPostGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.16, 12);
    for (const lz of [-0.19, 0.19]) {
      const post = new THREE.Mesh(armPostGeo, bambooMat);
      post.position.set(lx, 0.07, lz);
      post.castShadow = true;
      benchGroup.add(post);
    }
  }

  // Thin dark anti-slip tank cushion mat on top of bamboo slats (y = 0 .. 0.002)
  const matPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.97, 0.002, 0.37),
    new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.9, metalness: 0.05 })
  );
  matPad.position.set(0, 0.001, 0);
  matPad.receiveShadow = true;
  benchGroup.add(matPad);

  studioGroup.add(benchGroup);
  group.add(studioGroup);

  /* -------------------- 2. Glass Stepped-Weir Aquarium Tank -------------------- */

  const glassTankGroup = new THREE.Group();
  glassTankGroup.name = 'GlassAquariumTank';

  // Use clearcoat MeshPhysicalMaterial without transmission so transparent internal water renders cleanly
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff5ee,
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    metalness: 0.02,
    reflectivity: 0.95,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const glassEdgeMat = new THREE.MeshPhysicalMaterial({
    color: 0x43b58d,
    emissive: 0x0e3325,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.72,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1.0,
  });

  const siliconeMat = new THREE.MeshStandardMaterial({
    color: 0xcbe8e0,
    transparent: true,
    opacity: 0.32,
    roughness: 0.25,
    depthWrite: false,
  });

  const T = 0.005; // 5 mm float glass wall thickness

  // Tank Floor Slab (y = 0.002 .. 0.012)
  const floorPanel = buildGlassPanel(0.96, 0.010, 0.36, glassMat, glassEdgeMat, {
    top: false,
    bottom: false,
    left: true,
    right: true,
  });
  floorPanel.position.set(0, 0.007, 0);
  glassTankGroup.add(floorPanel);

  // Outer Front (z = +0.1775) & Back (z = -0.1775) Glass Walls:
  // Stepped outer profile: Headbox x in [-0.48, -0.27] rises to y = 0.52; main flume x in [-0.27, +0.48] rises to y = 0.42
  for (const zSign of [-1, 1]) {
    const zPos = zSign * 0.1775;

    const headSide = buildGlassPanel(0.21, 0.51, T, glassMat, glassEdgeMat, {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
    headSide.position.set(-0.375, 0.265, zPos);
    glassTankGroup.add(headSide);

    const mainSide = buildGlassPanel(0.75, 0.41, T, glassMat, glassEdgeMat, {
      top: true,
      left: false,
      right: true,
      bottom: true,
    });
    mainSide.position.set(0.105, 0.215, zPos);
    glassTankGroup.add(mainSide);
  }

  // Left End Glass Wall (x = -0.4775, y = 0.012 .. 0.52)
  const leftWall = buildGlassPanel(T, 0.508, 0.35, glassMat, glassEdgeMat, {
    top: true,
    bottom: true,
  });
  leftWall.position.set(-0.4775, 0.266, 0);
  glassTankGroup.add(leftWall);

  // Right End Glass Wall (x = +0.4775, y = 0.012 .. 0.42)
  const rightWall = buildGlassPanel(T, 0.408, 0.35, glassMat, glassEdgeMat, {
    top: true,
    bottom: true,
  });
  rightWall.position.set(0.4775, 0.216, 0);
  glassTankGroup.add(rightWall);

  // Headbox Divider Wall at x = -0.270:
  // Open bottom gap y = 0.012 .. 0.080 (return flow inlet into headbox)
  // Solid panel y = 0.080 .. 0.450 + top rectangular overflow notch y = 0.450 .. 0.520 (notch z in [-0.09, +0.09])
  const dividerMain = buildGlassPanel(T, 0.370, 0.35, glassMat, glassEdgeMat, {
    top: true,
    bottom: true,
  });
  dividerMain.position.set(-0.270, 0.265, 0);
  glassTankGroup.add(dividerMain);

  for (const zSign of [-1, 1]) {
    const wing = buildGlassPanel(T, 0.070, 0.085, glassMat, glassEdgeMat, {
      top: true,
      bottom: false,
    });
    wing.position.set(-0.270, 0.485, zSign * 0.1325);
    glassTankGroup.add(wing);
  }

  // Raised Horizontal Glass Return Shelf: x in [-0.270, +0.300] at y = 0.080 .. 0.085 (top y = 0.085)
  const returnShelf = buildGlassPanel(0.570, T, 0.35, glassMat, glassEdgeMat, {
    top: false,
    bottom: false,
    left: true,
    right: true,
  });
  returnShelf.position.set(0.015, 0.0825, 0);
  glassTankGroup.add(returnShelf);

  // Subtle vertical glass support ribs along front/back inner faces under the shelf (y = 0.012 .. 0.080)
  for (const rx of [-0.08, 0.11, 0.298]) {
    for (const rz of [-0.165, 0.165]) {
      const supportFoot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.068, 0.012), glassEdgeMat);
      supportFoot.position.set(rx, 0.046, rz);
      supportFoot.renderOrder = 9;
      glassTankGroup.add(supportFoot);
    }
  }

  // 3 Stepped Weir Walls rising from shelf top (y = 0.085)
  const weirConfigs = [
    { x: -0.080, weirY: 0.320 },
    { x: 0.110, weirY: 0.255 },
    { x: 0.300, weirY: 0.190 },
  ];

  for (const w of weirConfigs) {
    const h = w.weirY - 0.085;
    const weirWall = buildGlassPanel(T, h, 0.35, glassMat, glassEdgeMat, {
      top: true,
      bottom: false,
    });
    weirWall.position.set(w.x, 0.085 + h * 0.5, 0);
    glassTankGroup.add(weirWall);

    // Subtle vertical silicone corner beads
    for (const zSign of [-1, 1]) {
      const bead = new THREE.Mesh(new THREE.BoxGeometry(0.004, h, 0.004), siliconeMat);
      bead.position.set(w.x, 0.085 + h * 0.5, zSign * 0.172);
      bead.renderOrder = 9;
      glassTankGroup.add(bead);
    }
  }

  // Stacked White Styrofoam + Compacted Sand Bed + Layered River Rocks inside Steps 1, 2, 3
  const foamMat = new THREE.MeshStandardMaterial({
    map: foamTex,
    color: 0xf4f6f9,
    roughness: 0.88,
    metalness: 0.02,
  });
  const foamSeamMat = new THREE.MeshStandardMaterial({
    color: 0xd4dce6,
    roughness: 0.9,
  });

  const sandTextures = createSandTextures();
  const sandMat = new THREE.MeshStandardMaterial({
    map: sandTextures.map,
    bumpMap: sandTextures.bumpMap,
    bumpScale: 0.0018,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
  });

  const rockTextures = createRockTextures();
  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTextures.map,
    bumpMap: rockTextures.bumpMap,
    bumpScale: 0.0024,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.03,
  });

  const stepFoamSpecs = [
    {
      id: 'step1',
      xMin: -0.268,
      xMax: -0.082,
      foamSlabTopY: 0.214,
      sandTopY: 0.244,
      bedTopY: 0.290,
      weirY: 0.320,
      layers: 3,
      phase: 0.4,
      sandWaveAmp: 0.0042,
      rockScale: 1.0,
      tier1Count: 9,
      tier2Count: 24,
      tier3Count: 48,
    },
    {
      id: 'step2',
      xMin: -0.078,
      xMax: 0.108,
      foamSlabTopY: 0.170,
      sandTopY: 0.190,
      bedTopY: 0.225,
      weirY: 0.255,
      layers: 3,
      phase: 1.7,
      sandWaveAmp: 0.0036,
      rockScale: 0.88,
      tier1Count: 8,
      tier2Count: 22,
      tier3Count: 44,
    },
    {
      id: 'step3',
      xMin: 0.112,
      xMax: 0.298,
      foamSlabTopY: 0.126,
      sandTopY: 0.144,
      bedTopY: 0.160,
      weirY: 0.190,
      layers: 2,
      phase: 2.9,
      sandWaveAmp: 0.0030,
      rockScale: 0.76,
      tier1Count: 7,
      tier2Count: 20,
      tier3Count: 40,
    },
  ];

  const sandBeds = [];
  const rockGeoms = [0, 1, 2, 3, 4].map((v) => createOrganicRockGeometry(v));
  const rockInstancesByVariant = rockGeoms.map(() => []);
  const rockRng = createSeededRng(8421);

  const featureRockPalette = ['#9c7d5a', '#b59b78', '#876846', '#c5b294', '#867c68', '#a38764'];
  const cobblePalette = ['#dfd6c5', '#c7b69b', '#928e86', '#57534d', '#b3b0a8', '#a88462', '#7a756b'];

  for (const spec of stepFoamSpecs) {
    const widthX = spec.xMax - spec.xMin - 0.004;
    const centerX = 0.5 * (spec.xMin + spec.xMax);
    const totalH = spec.foamSlabTopY - 0.085;
    const layerH = totalH / spec.layers;
    const depthZ = 0.342;

    for (let i = 0; i < spec.layers; i++) {
      const slabH = layerH - 0.0018;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(widthX, slabH, depthZ), foamMat);
      slab.position.set(centerX, 0.085 + (i + 0.5) * layerH, 0);
      slab.castShadow = true;
      slab.receiveShadow = true;
      glassTankGroup.add(slab);

      if (i > 0) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(widthX + 0.0005, 0.0018, depthZ + 0.0005), foamSeamMat);
        seam.position.set(centerX, 0.085 + i * layerH, 0);
        glassTankGroup.add(seam);
      }
    }

    // Compacted river sand bed directly above the white styrofoam
    const sandBed = buildStepSandBed(spec, sandMat);
    glassTankGroup.add(sandBed);
    sandBeds.push(sandBed);

    // Pack multi-tier river rocks, cobbles & pebbles on top of the sand bed
    const placedRocks = [];
    const s = spec.rockScale;
    const wallPad = 0.004;
    const maxRockTopY = spec.weirY - 0.008;
    const dummy = new THREE.Object3D();

    const tryPlaceRock = (tier, cellU = null, cellV = null, preferElevated = false) => {
      const isTier1 = tier === 1;
      const isTier2 = tier === 2;
      const variant = isTier1
        ? rockRng() < 0.76
          ? Math.floor(rockRng() * 2)
          : 2
        : 2 + Math.floor(rockRng() * 3);

      const rx = isTier1
        ? (0.022 + rockRng() * 0.015) * s
        : isTier2
          ? (0.012 + rockRng() * 0.009) * s
          : (0.0055 + rockRng() * 0.0055) * s;
      const ry = isTier1
        ? (0.016 + rockRng() * 0.011) * s
        : isTier2
          ? (0.0085 + rockRng() * 0.0065) * s
          : (0.0040 + rockRng() * 0.0038) * s;
      const rz = isTier1
        ? (0.020 + rockRng() * 0.013) * s
        : isTier2
          ? (0.011 + rockRng() * 0.0085) * s
          : (0.0052 + rockRng() * 0.0050) * s;

      const maxExt = rockGeoms[variant].userData.maxExtent || 1.18;
      const horizBound = Math.max(rx, rz) * maxExt;
      const vertBound = Math.max(ry, Math.max(rx, rz) * 0.28) * maxExt;

      const xLo = spec.xMin + wallPad + horizBound;
      const xHi = spec.xMax - wallPad - horizBound;
      const zLo = -0.170 + horizBound;
      const zHi = 0.170 - horizBound;
      if (xLo >= xHi || zLo >= zHi) return;

      let bestCandidate = null;
      const maxAttempts = isTier1 ? 22 : 24;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let u = rockRng();
        let v = rockRng();
        if (cellU !== null && cellV !== null && attempt < 12) {
          u = clamp(cellU + (rockRng() - 0.5) * 0.28, 0, 1);
          v = clamp(cellV + (rockRng() - 0.5) * 0.28, 0, 1);
        } else if (!isTier1 && rockRng() < 0.38) {
          // Bias some medium cobbles & small pebbles along the front glass pocket
          v = 0.72 + rockRng() * 0.28;
        }

        const candX = xLo + u * (xHi - xLo);
        const candZ = zLo + v * (zHi - zLo);

        // Leave small clearance around back-wall WaveMaker_1 in Step 1
        if (spec.id === 'step1' && Math.hypot(candX + 0.23, candZ + 0.14) < 0.044) {
          continue;
        }

        const sandY = sampleSandTopY(spec, candX, candZ);
        let supportY = sandY;
        let severeOverlap = false;

        for (let j = 0; j < placedRocks.length; j++) {
          const r = placedRocks[j];
          const dx = candX - r.x;
          const dz = candZ - r.z;
          const d = Math.hypot(dx, dz);
          const sumR = (rx + rz) * 0.5 + (r.rx + r.rz) * 0.5;
          if (d < sumR * 0.44 && Math.abs(sandY - r.y) < r.ry * 0.9) {
            severeOverlap = true;
            break;
          }
          if (d < sumR * 0.95) {
            const normD = clamp(d / Math.max(1e-4, sumR * 0.95), 0, 1);
            const domeY = r.y + Math.sqrt(Math.max(0, 1 - normD * normD)) * r.ry * 0.74;
            if (domeY > supportY) supportY = domeY;
          }
        }

        if (severeOverlap) continue;

        const embedFrac = supportY <= sandY + 0.001 ? 0.48 : 0.46;
        const candY = supportY + ry * embedFrac;
        if (candY + vertBound > maxRockTopY) continue;

        const score = preferElevated
          ? -candY + (rockRng() - 0.5) * 0.004
          : candY + (v > 0.75 ? -0.004 : 0) + (rockRng() - 0.5) * 0.003;
        if (!bestCandidate || score < bestCandidate.score) {
          bestCandidate = { x: candX, y: candY, z: candZ, score };
        }
        if (!preferElevated && supportY <= sandY + 0.002) break;
      }

      if (!bestCandidate) return;

      placedRocks.push({
        x: bestCandidate.x,
        y: bestCandidate.y,
        z: bestCandidate.z,
        rx,
        ry,
        rz,
      });

      dummy.position.set(bestCandidate.x, bestCandidate.y, bestCandidate.z);
      dummy.rotation.set(
        (rockRng() - 0.5) * 0.42,
        rockRng() * Math.PI * 2,
        (rockRng() - 0.5) * 0.42
      );
      dummy.scale.set(rx, ry, rz);
      dummy.updateMatrix();

      const palette = isTier1 ? featureRockPalette : cobblePalette;
      const color = new THREE.Color(palette[Math.floor(rockRng() * palette.length)]);
      const shade = 0.88 + rockRng() * 0.20;
      color.multiplyScalar(shade);

      rockInstancesByVariant[variant].push({
        matrix: dummy.matrix.clone(),
        color,
      });
    };

    // Tier 1 (Base): Stratified grid-assisted placement for large feature rocks on the sand
    const colsX = 3;
    const rowsZ = Math.max(2, Math.ceil(spec.tier1Count / colsX));
    let placedTier1 = 0;
    for (let r = 0; r < rowsZ && placedTier1 < spec.tier1Count; r++) {
      for (let c = 0; c < colsX && placedTier1 < spec.tier1Count; c++) {
        tryPlaceRock(1, (c + 0.5) / colsX, (r + 0.5) / rowsZ, false);
        placedTier1++;
      }
    }

    // Tier 1 (Upper Crest): Stacked large stones forming natural mounded ridges up near weir height
    const upperCount = Math.max(3, Math.round(spec.tier1Count * 0.55));
    for (let i = 0; i < upperCount; i++) {
      tryPlaceRock(1, null, null, true);
    }

    // Tier 2: Medium river cobbles (mix of sand-seated and shoulder-nestled)
    for (let i = 0; i < spec.tier2Count; i++) {
      tryPlaceRock(2, null, null, i % 3 === 0);
    }

    // Tier 3: Small pebbles & foreground gravel
    for (let i = 0; i < spec.tier3Count; i++) {
      tryPlaceRock(3, null, null, false);
    }
  }

  const rockMeshes = [];
  for (let v = 0; v < rockGeoms.length; v++) {
    const items = rockInstancesByVariant[v];
    if (!items.length) continue;
    const inst = new THREE.InstancedMesh(rockGeoms[v], rockMat, items.length);
    inst.name = `StepRocksVariant_${v}`;
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      inst.setMatrixAt(i, items[i].matrix);
      inst.setColorAt(i, items[i].color);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    glassTankGroup.add(inst);
    rockMeshes.push(inst);
  }

  group.add(glassTankGroup);

  /* -------------------- 3. Submersible Pump & Power Cord -------------------- */

  const pumpGroup = new THREE.Group();
  pumpGroup.name = 'SubmersiblePump';
  pumpGroup.position.set(-0.38, 0.055, 0);

  const pumpWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xe8edf2,
    roughness: 0.38,
    metalness: 0.06,
  });
  const pumpTealMat = new THREE.MeshStandardMaterial({
    color: 0x178767,
    roughness: 0.42,
    metalness: 0.08,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x16191f,
    roughness: 0.82,
    metalness: 0.04,
  });

  // White front/rear molded pump end caps + green stator core (matching Photos 1-2)
  const frontCap = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.076, 0.076), pumpWhiteMat);
  frontCap.position.x = 0.036;
  frontCap.castShadow = true;
  pumpGroup.add(frontCap);

  const rearCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.076, 0.076), pumpWhiteMat);
  rearCap.position.x = -0.036;
  rearCap.castShadow = true;
  pumpGroup.add(rearCap);

  const greenBody = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.079, 0.079), pumpTealMat);
  greenBody.castShadow = true;
  pumpGroup.add(greenBody);

  // Slotted intake grille on +X face
  for (let i = -2; i <= 2; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.046, 0.005), rubberMat);
    slot.position.set(0.053, 0, i * 0.011);
    pumpGroup.add(slot);
  }

  // Spinning internal impeller rotor (visible through intake & top)
  const pumpRotor = new THREE.Group();
  pumpRotor.position.set(0.046, 0, 0);
  const rotorHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12),
    new THREE.MeshStandardMaterial({ color: 0x4cc7e8, roughness: 0.3 })
  );
  rotorHub.rotation.z = Math.PI / 2;
  pumpRotor.add(rotorHub);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.003), pumpWhiteMat);
    blade.rotation.x = (b * Math.PI) / 4;
    pumpRotor.add(blade);
  }
  pumpGroup.add(pumpRotor);

  // 4 rubber suction feet resting on headbox floor (y_local = -0.043 -> world y = 0.012)
  const footGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.006, 12);
  for (const fx of [-0.036, 0.036]) {
    for (const fz of [-0.028, 0.028]) {
      const foot = new THREE.Mesh(footGeo, rubberMat);
      foot.position.set(fx, -0.040, fz);
      pumpGroup.add(foot);
    }
  }

  // Outlet discharge boss on top at local (0, +0.045, -0.02) matching riser pipe at (-0.38, 0.10, -0.02)
  const pumpOutletCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.018, 0.024, 16),
    new THREE.MeshStandardMaterial({ color: 0x1b66c9, roughness: 0.32 })
  );
  pumpOutletCollar.position.set(0, 0.045, -0.02);
  pumpGroup.add(pumpOutletCollar);

  group.add(pumpGroup);

  // Black AC power cord looping realistically out the left headbox rim onto the bench (Photos 1-2)
  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.42, 0.088, -0.02),
    new THREE.Vector3(-0.445, 0.25, -0.06),
    new THREE.Vector3(-0.455, 0.48, -0.08),
    new THREE.Vector3(-0.485, 0.532, -0.09),
    new THREE.Vector3(-0.525, 0.34, -0.10),
    new THREE.Vector3(-0.545, 0.08, -0.11),
    new THREE.Vector3(-0.59, 0.004, -0.13),
    new THREE.Vector3(-0.66, 0.004, -0.15),
  ]);
  const cordMesh = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 44, 0.0032, 8, false), rubberMat);
  cordMesh.castShadow = true;
  group.add(cordMesh);

  /* -------------------- 4. Blue PVC Plumbing, Grey Elbows, Red Valve & Riser Water -------------------- */

  const pvcGroup = new THREE.Group();
  pvcGroup.name = 'PvcPipingAssembly';

  const bluePvcMat = new THREE.MeshStandardMaterial({
    color: 0x1a68d1,
    roughness: 0.28,
    metalness: 0.06,
    transparent: true,
    opacity: 0.82,
  });
  const greyPvcMat = new THREE.MeshStandardMaterial({
    color: 0x767f89,
    roughness: 0.42,
    metalness: 0.08,
  });
  const redValveMat = new THREE.MeshStandardMaterial({
    color: 0xd92525,
    roughness: 0.32,
    metalness: 0.06,
  });

  const PIPE_R = 0.0125;
  const FITTING_R = 0.0175;

  // Vertical Blue PVC Riser: (-0.38, 0.10..0.58, -0.02)
  const riserLen = 0.48;
  const riserPipe = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, riserLen, 18), bluePvcMat);
  riserPipe.position.set(-0.38, 0.10 + riserLen * 0.5, -0.02);
  riserPipe.castShadow = true;
  pvcGroup.add(riserPipe);

  // Blue mid-riser coupling collar (visible in Photo 2)
  const riserCoupler = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.032, 18), bluePvcMat);
  riserCoupler.position.set(-0.38, 0.29, -0.02);
  pvcGroup.add(riserCoupler);

  // Luminous Inner Water Column for Stage 1 Priming Animation
  const riserWaterMat = new THREE.MeshStandardMaterial({
    color: 0x55e2ff,
    emissive: 0x1896bd,
    emissiveIntensity: 0.5,
    roughness: 0.18,
    transparent: true,
    opacity: 0.85,
  });
  const riserWaterGeom = new THREE.CylinderGeometry(0.0088, 0.0088, 1.0, 14);
  riserWaterGeom.translate(0, 0.5, 0); // anchored at bottom y = 0
  const riserWaterColumn = new THREE.Mesh(riserWaterGeom, riserWaterMat);
  riserWaterColumn.position.set(-0.38, 0.10, -0.02);
  riserWaterColumn.scale.y = 0.48;
  pvcGroup.add(riserWaterColumn);

  // Helper to build a clean 90-degree grey PVC elbow fitting
  function createElbow90(x, y, z, rotZ) {
    const elbow = new THREE.Group();
    elbow.position.set(x, y, z);
    elbow.rotation.z = rotZ;

    const cornerSphere = new THREE.Mesh(new THREE.SphereGeometry(FITTING_R, 14, 14), greyPvcMat);
    elbow.add(cornerSphere);

    const legA = new THREE.Mesh(new THREE.CylinderGeometry(FITTING_R, FITTING_R, 0.032, 16), greyPvcMat);
    legA.position.y = -0.016;
    elbow.add(legA);

    const legB = new THREE.Mesh(new THREE.CylinderGeometry(FITTING_R, FITTING_R, 0.032, 16), greyPvcMat);
    legB.rotation.z = Math.PI / 2;
    legB.position.x = 0.016;
    elbow.add(legB);

    elbow.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    return elbow;
  }

  // Left Grey 90deg Elbow at (-0.38, 0.58, -0.02)
  pvcGroup.add(createElbow90(-0.38, 0.58, -0.02, 0));

  // Horizontal PVC span (-0.38 to -0.21 at y = 0.58, z = -0.02)
  const horizPipe = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, 0.17, 16), greyPvcMat);
  horizPipe.rotation.z = Math.PI / 2;
  horizPipe.position.set(-0.295, 0.58, -0.02);
  horizPipe.castShadow = true;
  pvcGroup.add(horizPipe);

  // Grey Ball Valve Housing centered at (-0.32, 0.58, -0.02)
  const valveGroup = new THREE.Group();
  valveGroup.position.set(-0.32, 0.58, -0.02);

  const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.044, 16), greyPvcMat);
  valveBody.rotation.z = Math.PI / 2;
  valveBody.castShadow = true;
  valveGroup.add(valveBody);

  for (const ux of [-0.026, 0.026]) {
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 8), greyPvcMat);
    nut.rotation.z = Math.PI / 2;
    nut.position.x = ux;
    nut.castShadow = true;
    valveGroup.add(nut);
  }

  const stemBase = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.018, 12), greyPvcMat);
  stemBase.position.y = 0.022;
  valveGroup.add(stemBase);

  // Bright RED Ball-Valve T-Handle (rotates around Y with valveOpening)
  const valveHandle = new THREE.Group();
  valveHandle.name = 'RedValveHandle';
  valveHandle.position.set(0, 0.032, 0);

  const handleHub = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.010, 0.012, 12), redValveMat);
  valveHandle.add(handleHub);

  // Winged T-bar aligned along X when open (rotation.y = 0)
  const handleWing1 = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.008, 0.011), redValveMat);
  handleWing1.position.set(0.008, 0.006, 0);
  handleWing1.castShadow = true;
  valveHandle.add(handleWing1);

  const handleWing2 = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.008, 0.011), redValveMat);
  handleWing2.position.set(-0.016, 0.006, 0);
  handleWing2.castShadow = true;
  valveHandle.add(handleWing2);

  valveGroup.add(valveHandle);
  pvcGroup.add(valveGroup);

  // Right Grey 90deg Elbow at (-0.21, 0.58, -0.02) turning downward
  pvcGroup.add(createElbow90(-0.21, 0.58, -0.02, -Math.PI / 2));

  // Blue PVC Drop Pipe down to (-0.21, 0.43, -0.02) discharging into Step 1
  const dropLen = 0.15;
  const dropPipe = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, dropLen, 18), bluePvcMat);
  dropPipe.position.set(-0.21, 0.43 + dropLen * 0.5, -0.02);
  dropPipe.castShadow = true;
  pvcGroup.add(dropPipe);

  // Subtle dark inner bore ring at nozzle exit
  const nozzleLip = new THREE.Mesh(
    new THREE.TorusGeometry(PIPE_R * 0.9, 0.002, 8, 16),
    bluePvcMat
  );
  nozzleLip.rotation.x = Math.PI / 2;
  nozzleLip.position.set(-0.21, 0.43, -0.02);
  pvcGroup.add(nozzleLip);

  group.add(pvcGroup);

  /* -------------------- 5. 2x Submersible Aquarium Wave Makers -------------------- */

  const waveMakers = [];
  const wmDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1d2228,
    roughness: 0.46,
    metalness: 0.14,
  });
  const wmAccentMat = new THREE.MeshStandardMaterial({
    color: 0x2692b8,
    roughness: 0.35,
  });

  const wmPositions = [
    { x: -0.23, y: 0.24, z: -0.14 },
    { x: 0.26, y: 0.24, z: -0.14 },
  ];

  for (let idx = 0; idx < wmPositions.length; idx++) {
    const pos = wmPositions[idx];
    const wmGroup = new THREE.Group();
    wmGroup.name = `WaveMaker_${idx + 1}`;
    wmGroup.position.set(pos.x, pos.y, pos.z);

    // Magnetic suction base attached to back glass wall (z = -0.172)
    const suctionPad = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.010, 16), rubberMat);
    suctionPad.rotation.x = Math.PI / 2;
    suctionPad.position.z = -0.028;
    wmGroup.add(suctionPad);

    const swivelArm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.020, 10), wmDarkMat);
    swivelArm.rotation.x = Math.PI / 2;
    swivelArm.position.z = -0.016;
    wmGroup.add(swivelArm);

    // Cylindrical wave-maker cage angled slightly downstream (+X) and into flow (+Z)
    const nozzleHead = new THREE.Group();
    nozzleHead.rotation.y = 0.55;

    const motorRear = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 12), wmDarkMat);
    motorRear.scale.set(1.0, 1.0, 1.15);
    motorRear.position.z = -0.006;
    nozzleHead.add(motorRear);

    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.017, 0.026, 16, 1, true),
      wmDarkMat
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = 0.010;
    nozzleHead.add(shroud);

    // Intake/outlet protective grille rings
    for (const gz of [0.008, 0.016, 0.022]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0185, 0.0014, 6, 16), wmDarkMat);
      ring.position.z = gz;
      nozzleHead.add(ring);
    }

    // Spinning propeller inside shroud
    const rotor = new THREE.Group();
    rotor.position.z = 0.012;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 10), wmAccentMat);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    for (let b = 0; b < 3; b++) {
      const prop = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.004, 0.002), wmAccentMat);
      prop.rotation.z = (b * Math.PI) / 3;
      rotor.add(prop);
    }
    nozzleHead.add(rotor);

    wmGroup.add(nozzleHead);
    group.add(wmGroup);

    // Slim black wave-maker power cable routing up over back glass rim
    const wmCord = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(pos.x, pos.y, pos.z - 0.025),
          new THREE.Vector3(pos.x, 0.34, -0.168),
          new THREE.Vector3(pos.x, 0.428, -0.175),
          new THREE.Vector3(pos.x, 0.30, -0.195),
        ]),
        16,
        0.0022,
        6,
        false
      ),
      rubberMat
    );
    group.add(wmCord);

    waveMakers.push({ group: wmGroup, rotor });
  }

  /* -------------------- 6. Exported Geometry Bounds & Update Loop -------------------- */

  const stepBounds = stepFoamSpecs.map((spec) => ({
    id: spec.id,
    xMin: spec.xMin,
    xMax: spec.xMax,
    zMin: -0.175,
    zMax: 0.175,
    shelfY: 0.085,
    foamSlabTopY: spec.foamSlabTopY,
    sandTopY: spec.sandTopY,
    bedTopY: spec.bedTopY,
    foamY: spec.bedTopY,
    foamTopY: spec.bedTopY,
    weirY: spec.weirY,
    weirTopY: spec.weirY,
  }));

  const basinBounds = {
    xMin: 0.302,
    xMax: 0.474,
    zMin: -0.175,
    zMax: 0.175,
    floorY: 0.012,
  };

  let smoothValve = 0.75;
  let smoothRiserFill = 1.0;

  function update(dt, state = {}) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    const pumpActive = state.pumpActive !== undefined ? Boolean(state.pumpActive) : true;
    const targetValve = clamp(
      state.valveOpening !== undefined ? Number(state.valveOpening) : 0.75,
      0,
      1
    );
    const wavePower = clamp(
      state.waveMakerPower !== undefined ? Number(state.waveMakerPower) : 0.25,
      0,
      1
    );

    // Smooth red ball-valve handle rotation: 0 rad = open (parallel to X), PI/2 = closed (perpendicular)
    smoothValve += (targetValve - smoothValve) * Math.min(1, clampedDt * 12);
    valveHandle.rotation.y = (1 - smoothValve) * (Math.PI * 0.5);

    // Spin pump rotor when active
    if (pumpActive) {
      pumpRotor.rotation.x += clampedDt * (16 + 18 * smoothValve);
    }

    // Animate internal riser water column fill
    const targetFill =
      state.riserFill !== undefined
        ? clamp(Number(state.riserFill), 0, 1)
        : pumpActive && smoothValve > 0.02
          ? 1.0
          : 0.08;
    smoothRiserFill += (targetFill - smoothRiserFill) * Math.min(1, clampedDt * 3.5);
    riserWaterColumn.visible = smoothRiserFill > 0.01;
    riserWaterColumn.scale.y = Math.max(0.01, smoothRiserFill * 0.48);

    // Spin both wave-maker rotors proportionally to waveMakerPower
    const wmOmega = 6 + wavePower * 36;
    for (const wm of waveMakers) {
      if (wavePower > 0.01) {
        wm.rotor.rotation.z += clampedDt * wmOmega;
      }
    }

    // Subtle studio lighting tint adjustment in 850 nm night mode
    const night = Boolean(state.nightMode);
    wallMat.opacity = night ? 0.26 : 0.78;
    wallMat.color.setHex(night ? 0x5c6270 : 0xffffff);
  }

  return {
    group,
    parts: {
      pumpMesh: pumpGroup,
      pumpRotor,
      valveHandle,
      waveMakers,
      riserWaterColumn,
      sandBeds,
      rockMeshes,
      stepBounds,
      basinBounds,
    },
    update,
  };
}

  return { createFlumeTank };
})(THREE);

/* === MODULE: src/scene/gantryFrame.js === */
RiverSimModules.gantryFrame = (function (THREE) {
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Generates procedural matte-black painted PVC schedule-40 subtle speckle & drill texture.
 */
function createBlackPvcTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1e23';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1600; i++) {
    const x = (i * 83) % 256;
    const y = (i * 149) % 256;
    const v = 22 + (i % 18);
    ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 5}, 0.25)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  return tex;
}

/**
 * Generates graduated centimeter ruler decal texture for the adjustable vertical sensor rail.
 */
function createRailScaleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#bcc4cf';
  ctx.fillRect(0, 0, 128, 512);

  // Subtle brushed aluminum lines
  for (let x = 0; x < 128; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(40,48,58,0.06)';
    ctx.fillRect(x, 0, 1, 512);
  }

  // Centimeter graduation ticks along the left edge
  ctx.fillStyle = '#1a2029';
  ctx.font = 'bold 13px monospace';
  const totalTicks = 50;
  for (let i = 0; i <= totalTicks; i++) {
    const y = (i / totalTicks) * 512;
    const major = i % 5 === 0;
    const tickW = major ? 34 : 18;
    ctx.fillRect(0, y - 1, tickW, major ? 2.5 : 1.5);
    if (i % 10 === 0 && i > 0 && i < totalTicks) {
      ctx.fillText(`${i}cm`, 40, y + 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Helper to create a PVC pipe cylinder between two 3D points.
 */
function createPipeSpan(pA, pB, radius, mat) {
  const dir = new THREE.Vector3().subVectors(pB, pA);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 18), mat);
  mesh.position.copy(pA).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Helper to build a matte-black PVC T-fitting oriented along axis ('x' | 'y' | 'z').
 */
function createPvcTee(pos, mainAxis, branchDir, radius, mat, scale = 1.0) {
  const tee = new THREE.Group();
  tee.position.copy(pos);

  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.084 * scale, 18),
    mat
  );
  if (mainAxis === 'x') sleeve.rotation.z = Math.PI / 2;
  if (mainAxis === 'z') sleeve.rotation.x = Math.PI / 2;
  sleeve.castShadow = true;
  tee.add(sleeve);

  const bDir = branchDir.clone().normalize();
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.048 * scale, 18),
    mat
  );
  branch.position.copy(bDir).multiplyScalar(0.024 * scale);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bDir);
  branch.castShadow = true;
  tee.add(branch);

  return tee;
}

/**
 * Helper to build a 90-degree matte-black PVC elbow connecting two orthogonal unit directions.
 */
function createPvcElbow(pos, dirA, dirB, radius, mat, scale = 1.0) {
  const elbow = new THREE.Group();
  elbow.position.copy(pos);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.03, 16, 14), mat);
  sphere.castShadow = true;
  elbow.add(sphere);

  for (const d of [dirA, dirB]) {
    const dir = d.clone().normalize();
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.044 * scale, 18),
      mat
    );
    leg.position.copy(dir).multiplyScalar(0.022 * scale);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    leg.castShadow = true;
    elbow.add(leg);
  }

  return elbow;
}

/**
 * Phase 1 (and reusable scaled Lab-Style Side Pole):
 * Matte-Black PVC Gantry Frame & Adjustable Aluminum Sensor Drop Rail
 */
function createGantryFrame(options = {}) {
  const S = Number(options.scale ?? 1.0);
  const ES = Number(options.enclosureScale ?? S);
  const isRiverLabPole = Boolean(options.isRiverLabPole);
  const addBaseAnchors = Boolean(options.addBaseAnchors ?? isRiverLabPole);

  const group = new THREE.Group();
  group.name = options.name || 'GantryFrameAssembly';

  const pvcTex = createBlackPvcTexture();
  const railScaleTex = createRailScaleTexture();

  const blackPvcMat = new THREE.MeshStandardMaterial({
    map: pvcTex,
    color: 0x20242a,
    roughness: 0.56,
    metalness: 0.08,
  });

  const fittingMat = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: 0.48,
    metalness: 0.10,
  });

  const lightGreyPvcMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    roughness: 0.42,
    metalness: 0.14,
  });

  const aluminumMat = new THREE.MeshStandardMaterial({
    map: railScaleTex,
    color: 0xcfd6e0,
    roughness: 0.34,
    metalness: 0.68,
  });

  const darkClampMat = new THREE.MeshStandardMaterial({
    color: 0x232830,
    roughness: 0.44,
    metalness: 0.35,
  });

  const boreHoleMat = new THREE.MeshStandardMaterial({
    color: 0x07080a,
    roughness: 0.9,
  });

  const boltHeadMat = new THREE.MeshStandardMaterial({
    color: 0xc2cbd6,
    roughness: 0.25,
    metalness: 0.85,
  });

  const PIPE_R = 0.021 * S;    // ~42 mm OD schedule-40 black PVC (scaled by S)
  const FIT_R = 0.0265 * S;    // Socket fitting OD (scaled by S)
  const CENTER_X = Number(options.centerX ?? 0.0);
  const POST_HALF_W = 0.32 * S;
  const POST_Z = Number(options.postZ ?? -0.24);
  const FLOOR_Y = Number(options.baseY ?? -0.55);
  const TOP_OFFSET = Number(options.topOffsetFromFloor ?? 2.03);
  const TOP_Y = FLOOR_Y + TOP_OFFSET * S;
  const CANTILEVER_SPAN_Z = Number(options.cantileverSpanZ ?? 0.38 * S);
  const CANTILEVER_FRONT_Z = POST_Z + CANTILEVER_SPAN_Z;
  const RAIL_OFFSET_Z = Number(options.railOffsetZ ?? 0.185 * S);
  const railMastZ = POST_Z + RAIL_OFFSET_Z;
  const railMastX = CENTER_X - 0.04 * S;

  /* -------------------- 1. Main Vertical PVC Posts & Floor Feet -------------------- */

  for (const xSign of [-1, 1]) {
    const px = CENTER_X + xSign * POST_HALF_W;

    // Vertical main post from floor/ground base up to top elbow
    group.add(
      createPipeSpan(
        new THREE.Vector3(px, FLOOR_Y + 0.022 * S, POST_Z),
        new THREE.Vector3(px, TOP_Y, POST_Z),
        PIPE_R,
        blackPvcMat
      )
    );

    // Floor base T-fitting & stabilizer runner along Z
    const footY = FLOOR_Y + 0.022 * S;
    group.add(
      createPvcTee(
        new THREE.Vector3(px, footY, POST_Z),
        'z',
        new THREE.Vector3(0, 1, 0),
        FIT_R,
        fittingMat,
        S
      )
    );
    group.add(
      createPipeSpan(
        new THREE.Vector3(px, footY, POST_Z - 0.16 * S),
        new THREE.Vector3(px, footY, POST_Z + 0.12 * S),
        PIPE_R,
        blackPvcMat
      )
    );

    for (const endZ of [POST_Z - 0.16 * S, POST_Z + 0.12 * S]) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(FIT_R * 0.96, FIT_R * 0.96, 0.024 * S, 16),
        fittingMat
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.set(px, footY, endZ);
      cap.castShadow = true;
      group.add(cap);
    }

    // Optional ground anchor plates & bolts when anchored directly onto flat grassy riverbank
    if (addBaseAnchors) {
      const anchorPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.095 * S, 0.014 * S, 0.34 * S),
        darkClampMat
      );
      anchorPlate.position.set(px, FLOOR_Y + 0.007 * S, POST_Z - 0.02 * S);
      anchorPlate.castShadow = true;
      anchorPlate.receiveShadow = true;
      group.add(anchorPlate);

      for (const bz of [POST_Z - 0.14 * S, POST_Z + 0.10 * S]) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.007 * S, 0.007 * S, 0.018 * S, 10),
          boltHeadMat
        );
        bolt.position.set(px, FLOOR_Y + 0.016 * S, bz);
        group.add(bolt);
      }
    }

    // Bench rear clamp bracket tying gantry post at lower brace elevation
    const benchClamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.054 * S, 0.036 * S, 0.058 * S),
      darkClampMat
    );
    benchClamp.position.set(px, FLOOR_Y + 0.50 * S, POST_Z + 0.025 * S);
    benchClamp.castShadow = true;
    group.add(benchClamp);

    // Drilled bolt-hole decals along front (+Z) face of vertical posts
    for (const holeOffset of [0.89, 1.35, 1.79]) {
      const holeY = FLOOR_Y + holeOffset * S;
      const holeRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0052 * S, 0.0052 * S, 0.003 * S, 12),
        boltHeadMat
      );
      holeRing.rotation.x = Math.PI / 2;
      holeRing.position.set(px, holeY, POST_Z + PIPE_R - 0.0005 * S);
      group.add(holeRing);

      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0032 * S, 0.0032 * S, 0.004 * S, 12),
        boreHoleMat
      );
      bore.rotation.x = Math.PI / 2;
      bore.position.set(px, holeY, POST_Z + PIPE_R);
      group.add(bore);
    }

    // Forward horizontal sensor-mount stubs below top elbows
    const stubY = FLOOR_Y + 1.85 * S;
    group.add(
      createPvcTee(
        new THREE.Vector3(px, stubY, POST_Z),
        'y',
        new THREE.Vector3(0, 0, 1),
        FIT_R,
        fittingMat,
        S
      )
    );
    group.add(
      createPipeSpan(
        new THREE.Vector3(px, stubY, POST_Z),
        new THREE.Vector3(px, stubY, POST_Z + 0.125 * S),
        PIPE_R * 0.78,
        blackPvcMat
      )
    );
    const stubHollow = new THREE.Mesh(
      new THREE.CylinderGeometry(PIPE_R * 0.60, PIPE_R * 0.60, 0.003 * S, 14),
      boreHoleMat
    );
    stubHollow.rotation.x = Math.PI / 2;
    stubHollow.position.set(px, stubY, POST_Z + 0.125 * S);
    group.add(stubHollow);
  }

  /* -------------------- 2. Lower, Mid & Upper Horizontal Crossbars -------------------- */

  const crossbarYs = [FLOOR_Y + 0.80 * S, FLOOR_Y + 1.45 * S, FLOOR_Y + 1.93 * S];
  for (const cy of crossbarYs) {
    group.add(
      createPipeSpan(
        new THREE.Vector3(CENTER_X - POST_HALF_W, cy, POST_Z),
        new THREE.Vector3(CENTER_X + POST_HALF_W, cy, POST_Z),
        PIPE_R,
        blackPvcMat
      )
    );
    for (const xSign of [-1, 1]) {
      group.add(
        createPvcTee(
          new THREE.Vector3(CENTER_X + xSign * POST_HALF_W, cy, POST_Z),
          'y',
          new THREE.Vector3(-xSign, 0, 0),
          FIT_R,
          fittingMat,
          S
        )
      );
    }
  }

  // Control Box Sub-Rails behind controlBox at (CENTER_X - 0.02*S, FLOOR_Y + 1.60*S, POST_Z)
  const subRailZ = POST_Z - 0.068 * S;
  for (const ry of [FLOOR_Y + 1.54 * S, FLOOR_Y + 1.66 * S]) {
    const rail = createPipeSpan(
      new THREE.Vector3(CENTER_X - POST_HALF_W, ry, subRailZ),
      new THREE.Vector3(CENTER_X + POST_HALF_W, ry, subRailZ),
      0.012 * S,
      lightGreyPvcMat
    );
    group.add(rail);

    for (const xSign of [-1, 1]) {
      group.add(
        createPipeSpan(
          new THREE.Vector3(CENTER_X + xSign * POST_HALF_W, ry, POST_Z),
          new THREE.Vector3(CENTER_X + xSign * POST_HALF_W, ry, subRailZ),
          0.012 * S,
          darkClampMat
        )
      );
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(FIT_R * 0.95, FIT_R * 0.95, 0.030 * S, 16),
        darkClampMat
      );
      collar.position.set(CENTER_X + xSign * POST_HALF_W, ry, POST_Z);
      group.add(collar);
    }
  }

  // Optional side PVC router bracket for river field deployment
  const routerAnchor = new THREE.Vector3(
    CENTER_X - POST_HALF_W - 0.22 * S,
    FLOOR_Y + 1.02 * S,
    POST_Z
  );
  if (isRiverLabPole) {
    const rBracketY = FLOOR_Y + 1.00 * S;
    const leftPostX = CENTER_X - POST_HALF_W;
    group.add(
      createPvcTee(
        new THREE.Vector3(leftPostX, rBracketY, POST_Z),
        'y',
        new THREE.Vector3(-1, 0, 0),
        FIT_R,
        fittingMat,
        S
      )
    );
    group.add(
      createPipeSpan(
        new THREE.Vector3(leftPostX, rBracketY, POST_Z),
        new THREE.Vector3(routerAnchor.x, rBracketY, POST_Z),
        PIPE_R * 0.85,
        blackPvcMat
      )
    );
    const shelfPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * S, 0.015 * S, 0.16 * S),
      darkClampMat
    );
    shelfPlate.position.set(routerAnchor.x, rBracketY + 0.012 * S, POST_Z);
    shelfPlate.castShadow = true;
    group.add(shelfPlate);
  }

  /* -------------------- 3. Cantilevered Top U-Frame Over Water -------------------- */

  for (const xSign of [-1, 1]) {
    const px = CENTER_X + xSign * POST_HALF_W;

    // Rear top 90deg elbow turning from -Y post toward +Z cantilever
    group.add(
      createPvcElbow(
        new THREE.Vector3(px, TOP_Y, POST_Z),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        FIT_R,
        fittingMat,
        S
      )
    );

    // Side cantilever PVC conduit boom beam reaching out to CANTILEVER_FRONT_Z
    group.add(
      createPipeSpan(
        new THREE.Vector3(px, TOP_Y, POST_Z),
        new THREE.Vector3(px, TOP_Y, CANTILEVER_FRONT_Z),
        PIPE_R,
        blackPvcMat
      )
    );

    // Front top 90deg elbow turning inward along X
    group.add(
      createPvcElbow(
        new THREE.Vector3(px, TOP_Y, CANTILEVER_FRONT_Z),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(-xSign, 0, 0),
        FIT_R,
        fittingMat,
        S
      )
    );

    // T-fitting on cantilever beam at railMastZ supporting the adjustable sensor drop rail
    group.add(
      createPvcTee(
        new THREE.Vector3(px, TOP_Y, railMastZ),
        'z',
        new THREE.Vector3(-xSign, 0, 0),
        FIT_R,
        fittingMat,
        S
      )
    );
  }

  // Front top U-frame crossbar
  group.add(
    createPipeSpan(
      new THREE.Vector3(CENTER_X - POST_HALF_W, TOP_Y, CANTILEVER_FRONT_Z),
      new THREE.Vector3(CENTER_X + POST_HALF_W, TOP_Y, CANTILEVER_FRONT_Z),
      PIPE_R,
      blackPvcMat
    )
  );

  // Mid-cantilever overhead rail at railMastZ (carries adjustable vertical sensor rail)
  group.add(
    createPipeSpan(
      new THREE.Vector3(CENTER_X - POST_HALF_W, TOP_Y, railMastZ),
      new THREE.Vector3(CENTER_X + POST_HALF_W, TOP_Y, railMastZ),
      PIPE_R,
      blackPvcMat
    )
  );

  /* -------------------- 4. Adjustable Vertical Aluminum Sensor Drop Rail -------------------- */

  const DEFAULT_LIDAR_Y = FLOOR_Y + 1.243 * S;
  const DEFAULT_CAMERA_Y = FLOOR_Y + 1.270 * S;
  const DEFAULT_IR_Y = FLOOR_Y + 1.270 * S;
  const CARRIER_Y = FLOOR_Y + 1.355 * S;

  const lidarX = CENTER_X - 0.17 * ES;
  const lidarZ = railMastZ + 0.055 * ES;
  const camX = CENTER_X + 0.02 * ES;
  const camZ = railMastZ + 0.035 * ES;
  const irX = CENTER_X + 0.08 * ES;
  const irZ = railMastZ + 0.035 * ES;

  const sensorMountPos = {
    lidar: new THREE.Vector3(lidarX, DEFAULT_LIDAR_Y, lidarZ),
    camera: new THREE.Vector3(camX, DEFAULT_CAMERA_Y, camZ),
    ir: new THREE.Vector3(irX, DEFAULT_IR_Y, irZ),
    controlBox: new THREE.Vector3(CENTER_X - 0.02 * S, FLOOR_Y + 1.60 * S, POST_Z),
    router: routerAnchor,
  };

  // Fixed upper outer sleeve attached to mid-cantilever rail
  const upperTeeClamp = createPvcTee(
    new THREE.Vector3(railMastX, TOP_Y, railMastZ),
    'x',
    new THREE.Vector3(0, -1, 0),
    FIT_R,
    fittingMat,
    S
  );
  group.add(upperTeeClamp);

  const outerSleeveLen = (isRiverLabPole ? 0.62 : 0.44) * S;
  const outerSleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.026 * S, outerSleeveLen, 0.026 * S),
    darkClampMat
  );
  outerSleeve.position.set(railMastX, TOP_Y - outerSleeveLen * 0.5, railMastZ);
  outerSleeve.castShadow = true;
  group.add(outerSleeve);

  // Locking thumbscrew collar at bottom of outer sleeve
  const lockCollar = new THREE.Mesh(
    new THREE.BoxGeometry(0.032 * S, 0.024 * S, 0.032 * S),
    fittingMat
  );
  lockCollar.position.set(railMastX, TOP_Y - outerSleeveLen, railMastZ);
  group.add(lockCollar);

  const thumbKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.014 * S, 12),
    boltHeadMat
  );
  thumbKnob.rotation.x = Math.PI / 2;
  thumbKnob.position.set(railMastX, TOP_Y - outerSleeveLen, railMastZ + 0.020 * S);
  group.add(thumbKnob);

  // Sliding inner telescopic aluminum rail + lower sensor carrier T-bar
  const slidingRailGroup = new THREE.Group();
  slidingRailGroup.name = 'AdjustableSensorRail';

  const innerBarLen = (isRiverLabPole ? 0.78 : 0.68) * S;
  const innerBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.018 * S, innerBarLen, 0.018 * S),
    aluminumMat
  );
  innerBar.position.set(railMastX, CARRIER_Y + innerBarLen * 0.5, railMastZ);
  innerBar.castShadow = true;
  slidingRailGroup.add(innerBar);

  // Horizontal aluminum extruded sensor carrier bar
  const carrierBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.34 * ES, 0.020 * S, 0.020 * S),
    aluminumMat
  );
  carrierBar.position.set(CENTER_X - 0.045 * ES, CARRIER_Y, railMastZ);
  carrierBar.castShadow = true;
  slidingRailGroup.add(carrierBar);

  // Center junction block between inner vertical rail & horizontal carrier bar
  const junctionBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.032 * S, 0.030 * S, 0.030 * S),
    darkClampMat
  );
  junctionBlock.position.set(railMastX, CARRIER_Y, railMastZ);
  slidingRailGroup.add(junctionBlock);

  // Helper: cantilever L-bracket reaching from carrier bar down to sensor saddle
  function addSensorBracket(targetX, targetTopY, targetZ) {
    const bracket = new THREE.Group();
    const reachZ = targetZ - railMastZ;

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.024 * S, 0.026 * S, 0.026 * S), darkClampMat);
    collar.position.set(targetX, CARRIER_Y, railMastZ);
    bracket.add(collar);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.014 * S, 0.012 * S, Math.abs(reachZ) + 0.012 * S),
      darkClampMat
    );
    arm.position.set(targetX, CARRIER_Y, railMastZ + reachZ * 0.5);
    arm.castShadow = true;
    bracket.add(arm);

    const dropH = Math.max(0.008 * S, CARRIER_Y - targetTopY);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.014 * S, dropH, 0.014 * S), darkClampMat);
    stem.position.set(targetX, targetTopY + dropH * 0.5, targetZ);
    stem.castShadow = true;
    bracket.add(stem);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.028 * S, 0.004 * S, 0.024 * S), boltHeadMat);
    pad.position.set(targetX, targetTopY, targetZ);
    bracket.add(pad);

    if (isRiverLabPole) {
      const swivel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.022 * S, 12),
        boltHeadMat
      );
      swivel.rotation.z = Math.PI / 2;
      swivel.position.set(targetX, targetTopY - 0.003 * S, targetZ);
      bracket.add(swivel);
    }

    slidingRailGroup.add(bracket);
  }

  // Exact top-bracket attachment elevations matching enclosures.js pods (scaled by ES)
  addSensorBracket(lidarX, DEFAULT_LIDAR_Y + 0.047 * ES, lidarZ);
  addSensorBracket(camX, DEFAULT_CAMERA_Y + 0.051 * ES, camZ);
  addSensorBracket(irX, DEFAULT_IR_Y + 0.063 * ES, irZ);

  group.add(slidingRailGroup);

  /* -------------------- 5. Dynamic Height Update -------------------- */

  const minH = Number(options.minLidarY ?? (isRiverLabPole ? 4.50 : 0.48));
  const maxH = Number(options.maxLidarY ?? (isRiverLabPole ? 7.50 : 1.25));

  function update(state = {}) {
    let rawH;
    if (isRiverLabPole) {
      rawH = state.sidePoleHeightM !== undefined ? Number(state.sidePoleHeightM) : DEFAULT_LIDAR_Y;
    } else {
      rawH =
        state.labLidarHeightM !== undefined
          ? Number(state.labLidarHeightM)
          : state.lidarHeightM !== undefined && Number(state.lidarHeightM) < 1.45
            ? Number(state.lidarHeightM)
            : DEFAULT_LIDAR_Y;
    }

    const clampedH = clamp(Number.isFinite(rawH) ? rawH : DEFAULT_LIDAR_Y, minH, maxH);
    const deltaY = clampedH - DEFAULT_LIDAR_Y;

    slidingRailGroup.position.y = deltaY;

    sensorMountPos.lidar.y = DEFAULT_LIDAR_Y + deltaY;
    sensorMountPos.camera.y = DEFAULT_CAMERA_Y + deltaY;
    sensorMountPos.ir.y = DEFAULT_IR_Y + deltaY;
  }

  return {
    group,
    sensorMountPos,
    enclosureScale: ES,
    update,
  };
}

  return { createGantryFrame };
})(THREE);

/* === MODULE: src/scene/riverField.js === */
RiverSimModules.riverField = (function (THREE, { createGantryFrame }) {
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

    const dm = Math.floor(cm / 10);
    const isMeterBlock = Math.floor(elevM + 1e-4) !== Math.floor(elevM - 0.02 + 1e-4);
    const col = cm % 100 < 50 ? '#11161d' : '#184b8c';

    if ((cm / 2) % 2 === 0) {
      ctx.fillStyle = col;
      ctx.fillRect(16, pyTop, 62, h);
    }

    if (cm % 10 === 0) {
      ctx.fillStyle = col;
      ctx.fillRect(16, pyBottom - 3, 98, 4);
      const valLabel = (yBottom + cm * 0.01).toFixed(1);
      ctx.font = cm % 50 === 0 ? 'bold 34px monospace' : 'bold 24px monospace';
      ctx.fillStyle = cm % 100 === 0 ? '#b81f1f' : '#11161d';
      ctx.fillText(valLabel, 122, pyBottom - 6);
    } else if (isMeterBlock) {
      ctx.fillStyle = '#b81f1f';
      ctx.fillRect(16, pyBottom - 2, 110, 4);
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
  terrainGeom.setAttribute('color', new THREE.BufferAttribute(chanColors, 3));
  terrainGeom.setIndex(chanIndices);
  terrainGeom.computeVertexNormals();

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
    boulders.setMatrixAt(bIdx++, dummy.matrix);
  }
  boulders.count = bIdx;
  boulders.instanceMatrix.needsUpdate = true;
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
    grassTufts.setMatrixAt(tIdx++, dummy.matrix);
  }
  grassTufts.count = tIdx;
  grassTufts.instanceMatrix.needsUpdate = true;
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
    bushes.setMatrixAt(vIdx++, dummy.matrix);
  }
  bushes.count = vIdx;
  bushes.instanceMatrix.needsUpdate = true;
  group.add(bushes);

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
    new THREE.CylinderGeometry(0.428, 0.435, 1.45, 20),
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

  // Adjustable Galvanized Bridge-Side Sensor Pole & Clamp Assembly (Overhead Bridge Mount)
  const DEFAULT_RIVER_MOUNT_Y = 4.50;
  const DEFAULT_RIVER_CAM_Y = 4.40;
  const DEFAULT_SIDE_POLE_MOUNT_Y = 6.00;

  const mountAnchor = new THREE.Vector3(0.8, DEFAULT_RIVER_MOUNT_Y, 0);
  const cameraAnchor = new THREE.Vector3(0.6, DEFAULT_RIVER_CAM_Y, -0.35);

  const bridgeSensorMountGroup = new THREE.Group();
  bridgeSensorMountGroup.name = 'BridgeCenteredSensorMount';

  // Fixed fascia clamp bolted to downstream bridge deck edge (x = +1.05, z in [-0.40, +0.05])
  for (const cz of [-0.35, 0.0]) {
    const fasciaPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.18), darkSteelMat);
    fasciaPlate.position.set(1.06, 5.08, cz);
    fasciaPlate.castShadow = true;
    bridgeSensorMountGroup.add(fasciaPlate);

    const outriggerArm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.06), steelMat);
    outriggerArm.position.set(0.92, 5.06, cz);
    outriggerArm.castShadow = true;
    bridgeSensorMountGroup.add(outriggerArm);
  }

  // Shared helper to build the sensor head boom brackets (reused on both Bridge Pole & Riverbank Side-Pole)
  function addSensorHeadBrackets(targetGroup, baseX, lidarY, lidarZ, camY, camZ, camArmSpan, armLinkLen) {
    const lidarPad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), darkSteelMat);
    lidarPad.position.set(baseX, lidarY + 0.05, lidarZ);
    targetGroup.add(lidarPad);

    const camArm = new THREE.Mesh(new THREE.BoxGeometry(camArmSpan, 0.05, 0.05), steelMat);
    camArm.position.set(baseX - 0.04, camY + 0.05, camZ);
    camArm.castShadow = true;
    targetGroup.add(camArm);

    const linkMidZ = 0.5 * (lidarZ + camZ);
    const camSideLink = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, armLinkLen), steelMat);
    camSideLink.position.set(baseX, camY + 0.05, linkMidZ);
    targetGroup.add(camSideLink);
  }

  // Sliding/Adjustable vertical pole + sensor mounting boom
  const poleHeadGroup = new THREE.Group();
  poleHeadGroup.name = 'BridgeAdjustableSensorPole';

  const mastVert = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.35, 16), steelMat);
  mastVert.position.set(0.80, 5.15, -0.18);
  mastVert.castShadow = true;
  poleHeadGroup.add(mastVert);

  // LiDAR cantilever arm out to (0.80, 4.50, 0)
  const lidarArm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.24), steelMat);
  lidarArm.position.set(0.80, 4.54, -0.09);
  lidarArm.castShadow = true;
  poleHeadGroup.add(lidarArm);

  addSensorHeadBrackets(poleHeadGroup, 0.80, 4.50, 0.0, 4.40, -0.35, 0.46, 0.22);

  // Pole clamp for control enclosure near (0.80, 4.92, -0.35)
  const boxClamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), darkSteelMat);
  boxClamp.position.set(0.80, 4.92, -0.36);
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

  const lowerMastTopY = 5.85;
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
    new THREE.CylinderGeometry(0.034, 0.036, 2.55, 16),
    steelMat
  );
  sideUpperMast.position.set(SIDE_POLE_X, 5.425, SIDE_POLE_Z);
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
    0.16
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
  const gaugeYBottom = 0.80;
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

    applyGcpLayout(mountMode, liveWL);

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

    // Toggle 3D Cross-Section Bathymetry Cutaway Slice
    const showSlice =
      state.showBathymetrySlice !== undefined
        ? Boolean(state.showBathymetrySlice)
        : state.bathymetrySlice !== undefined
          ? Boolean(state.bathymetrySlice)
          : true;
    sliceGroup.visible = showSlice;
    if (showSlice) {
      updateBathymetrySlice(liveWL);
    }

    // Toggle & animate rain particle streaks
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
        if (d.y < 0.0) {
          d.y += 8.5;
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
    gcpWorldPoints,
    getActiveGcpCorners,
    update,
    getBedHeightAtZ: guimbalBedHeightAtZ,
  };
}

  return { guimbalBedHeightAtZ, createRiverField };
})(THREE, RiverSimModules.gantryFrame);

/* === MODULE: src/scene/enclosures.js === */
RiverSimModules.enclosures = (function (THREE) {
/**
 * Shared procedural texture generator for crisp technical markings & labels.
 */
function createBadgeTexture(width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds a rounded rectangle THREE.Shape centered at (0, 0).
 */
function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(radius, hw * 0.9, hh * 0.9);

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

/**
 * Builds a rectangular loop THREE.Path (used as inner hole for walls/gaskets/frames).
 */
function createRoundedRectHole(width, height, radius) {
  const path = new THREE.Path();
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(radius, hw * 0.9, hh * 0.9);

  path.moveTo(-hw + r, -hh);
  path.lineTo(-hw, -hh + r);
  path.lineTo(-hw, hh - r);
  path.quadraticCurveTo(-hw, hh, -hw + r, hh);
  path.lineTo(hw - r, hh);
  path.quadraticCurveTo(hw, hh, hw, hh - r);
  path.lineTo(hw, -hh + r);
  path.quadraticCurveTo(hw, -hh, hw - r, -hh);
  path.closePath();
  return path;
}

/**
 * Tags an Object3D and descendant meshes with componentInfo unless already tagged.
 */
function tagComponentInfo(root, info) {
  root.userData.componentInfo = info;
  root.traverse((child) => {
    if (child.isMesh && !child.userData.componentInfo) {
      child.userData.componentInfo = info;
    }
  });
}

/**
 * Creates a rounded hollow IP65 enclosure shell with optional bottom aperture holes.
 * Local orientation: depth along Z (back wall at z=0 .. z=depth).
 */
function createHollowShell({
  width,
  height,
  depth,
  wall,
  cornerRadius,
  bodyMat,
  apertureHoles = []
}) {
  const shellGroup = new THREE.Group();

  // Back/bottom solid plate with optional circular optical holes
  const plateShape = createRoundedRectShape(width, height, cornerRadius);
  for (const hole of apertureHoles) {
    const holePath = new THREE.Path();
    holePath.absarc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true);
    plateShape.holes.push(holePath);
  }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: wall,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 16
  });
  const plateMesh = new THREE.Mesh(plateGeo, bodyMat);
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  shellGroup.add(plateMesh);

  // Perimeter extruded rim walls
  const wallShape = createRoundedRectShape(width, height, cornerRadius);
  wallShape.holes.push(
    createRoundedRectHole(width - wall * 2, height - wall * 2, Math.max(0.002, cornerRadius - wall))
  );
  const rimGeo = new THREE.ExtrudeGeometry(wallShape, {
    depth: depth - wall,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 16
  });
  const rimMesh = new THREE.Mesh(rimGeo, bodyMat);
  rimMesh.position.z = wall;
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  shellGroup.add(rimMesh);

  return shellGroup;
}

/**
 * Creates a perimeter silicone O-ring gasket loop in XY plane.
 */
function createGasketLoop(width, height, thickness, depth, cornerRadius, material) {
  const shape = createRoundedRectShape(width, height, cornerRadius);
  shape.holes.push(
    createRoundedRectHole(
      width - thickness * 2,
      height - thickness * 2,
      Math.max(0.0015, cornerRadius - thickness)
    )
  );
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0005,
    bevelSize: 0.0005,
    bevelSegments: 2,
    curveSegments: 16
  });
  geo.center();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Adds a stainless steel machine screw at local (x, y, z) oriented along +Z.
 */
function createMachineBolt(radius, length, metalMat, darkMat) {
  const bolt = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 14),
    metalMat
  );
  head.rotation.x = Math.PI * 0.5;
  head.castShadow = true;
  bolt.add(head);

  const slot1 = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.25, radius * 0.28, 0.0006),
    darkMat
  );
  slot1.position.z = length * 0.5 + 0.0001;
  bolt.add(slot1);

  const slot2 = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.28, radius * 1.25, 0.0006),
    darkMat
  );
  slot2.position.z = length * 0.5 + 0.0001;
  bolt.add(slot2);

  return bolt;
}

/**
 * Builds a waterproof PG hex cable gland pointing along +Y from origin (0,0,0).
 */
function createHexCableGland(scale, bodyMat, rubberMat) {
  const gland = new THREE.Group();

  // Threaded base collar
  const baseCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0082 * scale, 0.0085 * scale, 0.006 * scale, 16),
    bodyMat
  );
  baseCollar.position.y = 0.003 * scale;
  baseCollar.castShadow = true;
  gland.add(baseCollar);

  // Hex locknut
  const lockNut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0112 * scale, 0.0112 * scale, 0.0045 * scale, 6),
    bodyMat
  );
  lockNut.position.y = 0.0075 * scale;
  lockNut.castShadow = true;
  gland.add(lockNut);

  // Black rubber O-ring washer
  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0092 * scale, 0.0092 * scale, 0.002 * scale, 16),
    rubberMat
  );
  seal.position.y = 0.0105 * scale;
  gland.add(seal);

  // Compression barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0078 * scale, 0.0086 * scale, 0.007 * scale, 16),
    bodyMat
  );
  barrel.position.y = 0.0145 * scale;
  barrel.castShadow = true;
  gland.add(barrel);

  // Outer hex compression dome nut
  const domeNut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0102 * scale, 0.0108 * scale, 0.0075 * scale, 6),
    bodyMat
  );
  domeNut.position.y = 0.020 * scale;
  domeNut.castShadow = true;
  gland.add(domeNut);

  // Rubber clamping boot
  const boot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0046 * scale, 0.0066 * scale, 0.0075 * scale, 14),
    rubberMat
  );
  boot.position.y = 0.0265 * scale;
  boot.castShadow = true;
  gland.add(boot);

  return gland;
}

/**
 * Builds a corrugated split wire loom along a 3D curve using InstancedMesh ribs.
 */
function createCorrugatedLoom(curve, radius, ribCount, loomMat) {
  const group = new THREE.Group();

  const coreGeo = new THREE.TubeGeometry(curve, Math.max(18, ribCount), radius * 0.78, 10, false);
  const coreMesh = new THREE.Mesh(coreGeo, loomMat);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  group.add(coreMesh);

  const ringGeo = new THREE.TorusGeometry(radius * 0.88, radius * 0.22, 7, 14);
  const rings = new THREE.InstancedMesh(ringGeo, loomMat, ribCount);
  rings.castShadow = true;
  rings.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < ribCount; i++) {
    const t = i / Math.max(1, ribCount - 1);
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    dummy.position.copy(pt);
    dummy.quaternion.setFromUnitVectors(up, tangent);
    dummy.updateMatrix();
    rings.setMatrixAt(i, dummy.matrix);
  }
  rings.instanceMatrix.needsUpdate = true;
  group.add(rings);

  return group;
}

/**
 * Adds colored wire strands emerging from the end of a corrugated loom.
 */
function createExposedWireTips(origin, dir, colors, spreadRadius, wireRadius) {
  const tips = new THREE.Group();
  const baseDir = dir.clone().normalize();
  const orthoA = new THREE.Vector3(1, 0, 0);
  if (Math.abs(baseDir.dot(orthoA)) > 0.85) orthoA.set(0, 1, 0);
  const orthoB = new THREE.Vector3().crossVectors(baseDir, orthoA).normalize();
  orthoA.crossVectors(orthoB, baseDir).normalize();

  colors.forEach((hex, idx) => {
    const angle = (idx / colors.length) * Math.PI * 2;
    const offX = Math.cos(angle) * spreadRadius;
    const offY = Math.sin(angle) * spreadRadius;
    const p0 = origin.clone();
    const p1 = origin
      .clone()
      .addScaledVector(baseDir, 0.012)
      .addScaledVector(orthoA, offX * 0.6)
      .addScaledVector(orthoB, offY * 0.6);
    const p2 = origin
      .clone()
      .addScaledVector(baseDir, 0.025)
      .addScaledVector(orthoA, offX * 1.35)
      .addScaledVector(orthoB, offY * 1.35);

    const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, wireRadius, 6, false),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0.1 })
    );
    mesh.castShadow = true;
    tips.add(mesh);
  });

  return tips;
}

/**
 * Builds the 4 high-detail CAD IP65 enclosures matching thesis Figs. 8-10.
 */
function createEnclosures() {
  // Shared engineering CAD materials
  const mat = {
    absGrey: new THREE.MeshStandardMaterial({
      color: 0xd0d6de,
      roughness: 0.42,
      metalness: 0.08
    }),
    absInnerGrey: new THREE.MeshStandardMaterial({
      color: 0xbac2cc,
      roughness: 0.5,
      metalness: 0.06
    }),
    darkBody: new THREE.MeshStandardMaterial({
      color: 0x242932,
      roughness: 0.46,
      metalness: 0.35
    }),
    anodizedBlack: new THREE.MeshStandardMaterial({
      color: 0x181b20,
      roughness: 0.36,
      metalness: 0.68
    }),
    glandGrey: new THREE.MeshStandardMaterial({
      color: 0x7e8792,
      roughness: 0.45,
      metalness: 0.12
    }),
    rubberBlack: new THREE.MeshStandardMaterial({
      color: 0x16181c,
      roughness: 0.82,
      metalness: 0.04
    }),
    siliconeGasket: new THREE.MeshStandardMaterial({
      color: 0x2c343d,
      roughness: 0.72,
      metalness: 0.05
    }),
    stainlessSteel: new THREE.MeshStandardMaterial({
      color: 0xcfd6de,
      roughness: 0.24,
      metalness: 0.88
    }),
    brassInsert: new THREE.MeshStandardMaterial({
      color: 0xd4a44a,
      roughness: 0.3,
      metalness: 0.82
    }),
    opticalGlass: new THREE.MeshPhysicalMaterial({
      color: 0xdaf0ff,
      transparent: true,
      opacity: 0.26,
      roughness: 0.06,
      metalness: 0.05,
      clearcoat: 1.0,
      reflectivity: 0.9,
      depthWrite: false
    }),
    smokeLidGlass: new THREE.MeshPhysicalMaterial({
      color: 0x6c7f92,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.06,
      clearcoat: 1.0,
      reflectivity: 0.85,
      depthWrite: false
    }),
    slotDark: new THREE.MeshStandardMaterial({
      color: 0x353b42,
      roughness: 0.7,
      metalness: 0.2
    })
  };

  // =========================================================================
  // 1) LIDAR POD GROUP (Fig. 8 / image10.jpg)
  // Local origin (0,0,0) = dual-aperture optical window center pointing -Y.
  // =========================================================================
  const lidarPodGroup = new THREE.Group();
  lidarPodGroup.name = 'lidarPodGroup';

  const lidarInfo = {
    id: 'ENC-LIDAR',
    designator: 'ENC-2',
    title: 'LiDAR IP65 Sensor Pod',
    role: 'Weatherproof Dual-Aperture Enclosure for TF-Luna ToF LiDAR',
    specs: '78 × 64 × 44 mm IP65 ABS Housing, Silicone Gasket, Dual Optical Windows, PG7 Cable Gland & Split Loom',
    pinout: '2× 14 mm Optical Windows (-Y), 6-Pin Loom Exit (+Z)',
    power: 'Passive Environmental Seal (IP65)',
    bus: 'Optical Aperture (-Y) / UART Loom (+Z)',
    group: 'Enclosures'
  };

  const lidarW = 0.078;
  const lidarD = 0.064;
  const lidarBaseH = 0.036;
  const lidarWall = 0.004;

  // Base shell built in XY then rotated so depth runs along +Y from y=0..0.036
  const lidarShell = createHollowShell({
    width: lidarW,
    height: lidarD,
    depth: lidarBaseH,
    wall: lidarWall,
    cornerRadius: 0.007,
    bodyMat: mat.absGrey,
    apertureHoles: [
      { x: -0.0095, y: 0, r: 0.0072 },
      { x: 0.0095, y: 0, r: 0.0072 }
    ]
  });
  lidarShell.rotation.x = -Math.PI * 0.5;
  lidarPodGroup.add(lidarShell);

  // Dual-aperture optical window bezels & AR glass facing -Y at y = 0
  [-0.0095, 0.0095].forEach((ax) => {
    const bezel = new THREE.Mesh(
      new THREE.RingGeometry(0.007, 0.0098, 24),
      mat.darkBody
    );
    bezel.rotation.x = Math.PI * 0.5;
    bezel.position.set(ax, -0.0004, 0);
    lidarPodGroup.add(bezel);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0096, 0.0096, 0.0022, 24, 1, true),
      mat.darkBody
    );
    collar.position.set(ax, -0.001, 0);
    lidarPodGroup.add(collar);

    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0071, 0.0071, 0.0012, 24),
      mat.opticalGlass
    );
    glass.position.set(ax, 0.0005, 0);
    lidarPodGroup.add(glass);
  });

  // 4 internal corner bosses + brass inserts + 2 TF-Luna ear standoffs
  const lidarCorners = [
    [-0.031, -0.024],
    [0.031, -0.024],
    [-0.031, 0.024],
    [0.031, 0.024]
  ];
  lidarCorners.forEach(([cx, cz]) => {
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0038, 0.0038, lidarBaseH - lidarWall - 0.001, 14),
      mat.absInnerGrey
    );
    boss.position.set(cx, lidarWall + (lidarBaseH - lidarWall - 0.001) * 0.5, cz);
    lidarPodGroup.add(boss);

    const insert = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0017, 0.0017, 0.004, 12),
      mat.brassInsert
    );
    insert.position.set(cx, lidarBaseH - 0.002, cz);
    lidarPodGroup.add(insert);
  });

  [-0.0215, 0.0215].forEach((sx) => {
    const standoff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.0034, 0.009, 14),
      mat.absInnerGrey
    );
    standoff.position.set(sx, 0.0085, 0);
    standoff.castShadow = true;
    lidarPodGroup.add(standoff);

    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0011, 0.0011, 0.004, 10),
      mat.brassInsert
    );
    pin.position.set(sx, 0.0135, 0);
    lidarPodGroup.add(pin);
  });

  // Silicone gasket ring (lifts along +Y / -Z on explode)
  const lidarGasketRest = new THREE.Vector3(0, 0.0365, 0);
  const lidarGasket = createGasketLoop(
    lidarW - 0.004,
    lidarD - 0.004,
    0.0026,
    0.0018,
    0.006,
    mat.siliconeGasket
  );
  lidarGasket.rotation.x = Math.PI * 0.5;
  lidarGasket.position.copy(lidarGasketRest);
  lidarPodGroup.add(lidarGasket);

  // Top lid group (lifts along +Y / -Z on explode)
  const lidarLidRest = new THREE.Vector3(0, 0.0375, 0);
  const lidarLidGroup = new THREE.Group();
  lidarLidGroup.position.copy(lidarLidRest);

  const lidarLidShape = createRoundedRectShape(lidarW, lidarD, 0.007);
  const lidarLidGeo = new THREE.ExtrudeGeometry(lidarLidShape, {
    depth: 0.0065,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 2,
    curveSegments: 16
  });
  const lidarLidMesh = new THREE.Mesh(lidarLidGeo, mat.absGrey);
  lidarLidMesh.rotation.x = -Math.PI * 0.5;
  lidarLidMesh.castShadow = true;
  lidarLidMesh.receiveShadow = true;
  lidarLidGroup.add(lidarLidMesh);

  // Top gantry mount saddle flange
  const lidarBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.004, 0.030),
    mat.darkBody
  );
  lidarBracket.position.set(0, 0.0085, 0);
  lidarBracket.castShadow = true;
  lidarLidGroup.add(lidarBracket);

  lidarCorners.forEach(([cx, cz]) => {
    const bolt = createMachineBolt(0.0022, 0.002, mat.stainlessSteel, mat.slotDark);
    bolt.rotation.x = -Math.PI * 0.5;
    bolt.position.set(cx, 0.0075, cz);
    lidarLidGroup.add(bolt);
  });
  lidarPodGroup.add(lidarLidGroup);

  // Hex waterproof cable gland + corrugated split wire loom exiting +Z
  const lidarGland = createHexCableGland(0.75, mat.glandGrey, mat.rubberBlack);
  lidarGland.rotation.x = Math.PI * 0.5;
  lidarGland.position.set(0, 0.020, lidarD * 0.5);
  lidarPodGroup.add(lidarGland);

  const lidarLoomCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.020, lidarD * 0.5 + 0.020),
    new THREE.Vector3(0, 0.020, lidarD * 0.5 + 0.052),
    new THREE.Vector3(0.008, 0.026, lidarD * 0.5 + 0.078),
    new THREE.Vector3(0.014, 0.042, lidarD * 0.5 + 0.095)
  ]);
  const lidarLoom = createCorrugatedLoom(lidarLoomCurve, 0.0052, 24, mat.rubberBlack);
  lidarPodGroup.add(lidarLoom);

  lidarPodGroup.add(
    createExposedWireTips(
      lidarLoomCurve.getPointAt(1),
      lidarLoomCurve.getTangentAt(1),
      [0xe52424, 0x1ec95b, 0x2488ff, 0x1d2128],
      0.0022,
      0.00065
    )
  );

  // Anchor at the end of the loom/gland for hardwareRig external cable routing
  const lidarGlandAnchor = new THREE.Object3D();
  lidarGlandAnchor.position.copy(lidarLoomCurve.getPointAt(1));
  lidarPodGroup.add(lidarGlandAnchor);

  tagComponentInfo(lidarPodGroup, lidarInfo);
  lidarPodGroup.userData.glandAnchor = lidarGlandAnchor;
  lidarPodGroup.userData.anchors = {
    standoffY: 0.013,
    glandInside: new THREE.Vector3(0, 0.020, lidarD * 0.5 - 0.004)
  };

  // =========================================================================
  // 2) CAMERA POD GROUP (Fig. 10 / image13.jpg)
  // Local origin (0,0,0) = circular optical window center pointing -Y.
  // =========================================================================
  const cameraPodGroup = new THREE.Group();
  cameraPodGroup.name = 'cameraPodGroup';

  const cameraPodInfo = {
    id: 'ENC-CAM',
    designator: 'ENC-3',
    title: 'NoIR Camera IP65 Pod',
    role: 'Weatherproof Optical Housing for Raspberry Pi Camera Module 3 NoIR',
    specs: '94 × 74 × 48 mm IP65 ABS Housing, Circular AR Optical Window, 4× M2 PCB Standoffs, CSI-2 Loom',
    pinout: '22 mm Optical Window (-Y), 15-Pin MIPI CSI-2 Ribbon Loom (-Z)',
    power: 'Passive Environmental Seal (IP65)',
    bus: 'Optical Viewing Window (-Y) / CSI-2 Exit (-Z)',
    group: 'Enclosures'
  };

  const camW = 0.094;
  const camD = 0.074;
  const camBaseH = 0.040;
  const camWall = 0.004;

  const camShell = createHollowShell({
    width: camW,
    height: camD,
    depth: camBaseH,
    wall: camWall,
    cornerRadius: 0.008,
    bodyMat: mat.absGrey,
    apertureHoles: [{ x: 0, y: 0, r: 0.0108 }]
  });
  camShell.rotation.x = -Math.PI * 0.5;
  cameraPodGroup.add(camShell);

  // Circular optical viewing window bezel & clear lens at (0,0,0) facing -Y
  const camBezelRing = new THREE.Mesh(
    new THREE.RingGeometry(0.0105, 0.0155, 28),
    mat.darkBody
  );
  camBezelRing.rotation.x = Math.PI * 0.5;
  camBezelRing.position.set(0, -0.0005, 0);
  cameraPodGroup.add(camBezelRing);

  const camBezelWall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0154, 0.0154, 0.0032, 28, 1, true),
    mat.darkBody
  );
  camBezelWall.position.set(0, -0.0014, 0);
  cameraPodGroup.add(camBezelWall);

  const camGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0106, 0.0106, 0.0014, 28),
    mat.opticalGlass
  );
  camGlass.position.set(0, 0.0004, 0);
  cameraPodGroup.add(camGlass);

  // 4 internal corner bosses + 4 M2 Pi Camera standoffs
  const camCorners = [
    [-0.039, -0.029],
    [0.039, -0.029],
    [-0.039, 0.029],
    [0.039, 0.029]
  ];
  camCorners.forEach(([cx, cz]) => {
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0038, 0.0038, camBaseH - camWall - 0.001, 14),
      mat.absInnerGrey
    );
    boss.position.set(cx, camWall + (camBaseH - camWall - 0.001) * 0.5, cz);
    cameraPodGroup.add(boss);
  });

  [
    [-0.0105, -0.010],
    [0.0105, -0.010],
    [-0.0105, 0.010],
    [0.0105, 0.010]
  ].forEach(([sx, sz]) => {
    const standoff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0021, 0.0024, 0.011, 12),
      mat.brassInsert
    );
    standoff.position.set(sx, 0.0095, sz);
    standoff.castShadow = true;
    cameraPodGroup.add(standoff);
  });

  // Gasket & Top Lid
  const camGasketRest = new THREE.Vector3(0, 0.0405, 0);
  const camGasket = createGasketLoop(
    camW - 0.004,
    camD - 0.004,
    0.0028,
    0.0018,
    0.007,
    mat.siliconeGasket
  );
  camGasket.rotation.x = Math.PI * 0.5;
  camGasket.position.copy(camGasketRest);
  cameraPodGroup.add(camGasket);

  const camLidRest = new THREE.Vector3(0, 0.0415, 0);
  const camLidGroup = new THREE.Group();
  camLidGroup.position.copy(camLidRest);

  const camLidShape = createRoundedRectShape(camW, camD, 0.008);
  const camLidGeo = new THREE.ExtrudeGeometry(camLidShape, {
    depth: 0.0068,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 2,
    curveSegments: 16
  });
  const camLidMesh = new THREE.Mesh(camLidGeo, mat.absGrey);
  camLidMesh.rotation.x = -Math.PI * 0.5;
  camLidMesh.castShadow = true;
  camLidMesh.receiveShadow = true;
  camLidGroup.add(camLidMesh);

  const camBracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.046, 0.004, 0.032),
    mat.darkBody
  );
  camBracket.position.set(0, 0.0088, 0);
  camBracket.castShadow = true;
  camLidGroup.add(camBracket);

  camCorners.forEach(([cx, cz]) => {
    const bolt = createMachineBolt(0.0022, 0.002, mat.stainlessSteel, mat.slotDark);
    bolt.rotation.x = -Math.PI * 0.5;
    bolt.position.set(cx, 0.0078, cz);
    camLidGroup.add(bolt);
  });
  cameraPodGroup.add(camLidGroup);

  // Rear cable gland & split loom pointing -Z toward control box
  const camGland = createHexCableGland(0.85, mat.glandGrey, mat.rubberBlack);
  camGland.rotation.x = -Math.PI * 0.5;
  camGland.position.set(0, 0.022, -camD * 0.5);
  cameraPodGroup.add(camGland);

  const camLoomCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.022, -camD * 0.5 - 0.022),
    new THREE.Vector3(0, 0.022, -camD * 0.5 - 0.055),
    new THREE.Vector3(-0.004, 0.028, -camD * 0.5 - 0.088)
  ]);
  const camLoom = createCorrugatedLoom(camLoomCurve, 0.006, 22, mat.rubberBlack);
  cameraPodGroup.add(camLoom);

  const camGlandAnchor = new THREE.Object3D();
  camGlandAnchor.position.copy(camLoomCurve.getPointAt(1));
  cameraPodGroup.add(camGlandAnchor);

  tagComponentInfo(cameraPodGroup, cameraPodInfo);
  cameraPodGroup.userData.glandAnchor = camGlandAnchor;
  cameraPodGroup.userData.anchors = {
    standoffY: 0.015,
    glandInside: new THREE.Vector3(0, 0.022, -camD * 0.5 + 0.004)
  };

  // =========================================================================
  // 3) IR ILLUMINATOR GROUP (850 nm 4-LED IP65 Array)
  // Local origin (0,0,0) = emitter lens face pointing -Y.
  // =========================================================================
  const irIlluminatorGroup = new THREE.Group();
  irIlluminatorGroup.name = 'irIlluminatorGroup';

  const irInfo = {
    id: 'IR1',
    designator: 'IR1',
    title: '850 nm IR LED Illuminator (4-LED Array)',
    role: 'Active Near-Infrared Night Lighting for NoIR Camera PIV & Debris Detection',
    specs: '4× High-Power 850 nm IR Emitters, IP65 Finned Aluminum Cylindrical Housing, Ambient CdS Sensor',
    pinout: 'VCC (Red) -> PS2 OUT+ (+12.0V), GND (Black) -> PS2 OUT- (GND)',
    power: '12.0 V DC Regulated from PS2 Automatic Buck-Boost',
    bus: '12V Regulated Power Bus',
    group: 'Sensors & Optics'
  };

  const irBodyGroup = new THREE.Group();
  const irMainCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.044, 28),
    mat.anodizedBlack
  );
  irMainCyl.position.y = 0.030;
  irMainCyl.castShadow = true;
  irMainCyl.receiveShadow = true;
  irBodyGroup.add(irMainCyl);

  // 5 radial heatsink cooling fins
  for (let i = 0; i < 5; i++) {
    const fin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0295, 0.0295, 0.0024, 28),
      mat.anodizedBlack
    );
    fin.position.y = 0.014 + i * 0.0075;
    fin.castShadow = true;
    irBodyGroup.add(fin);
  }

  // U-shaped mounting bracket yoke
  const yokeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.030, 0.012), mat.darkBody);
  yokeLeft.position.set(-0.0315, 0.046, 0);
  irBodyGroup.add(yokeLeft);

  const yokeRight = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.030, 0.012), mat.darkBody);
  yokeRight.position.set(0.0315, 0.046, 0);
  irBodyGroup.add(yokeRight);

  const yokeTop = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.004, 0.014), mat.darkBody);
  yokeTop.position.set(0, 0.062, 0);
  yokeTop.castShadow = true;
  irBodyGroup.add(yokeTop);
  irIlluminatorGroup.add(irBodyGroup);

  // Rear endcap + cable gland (lifts +Y on explode)
  const irRearGroup = new THREE.Group();
  const irRearCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.027, 0.027, 0.008, 28),
    mat.darkBody
  );
  irRearCap.position.y = 0.056;
  irRearCap.castShadow = true;
  irRearGroup.add(irRearCap);

  const irGland = createHexCableGland(0.65, mat.glandGrey, mat.rubberBlack);
  irGland.rotation.x = -Math.PI * 0.5;
  irGland.position.set(0, 0.055, -0.026);
  irRearGroup.add(irGland);
  irIlluminatorGroup.add(irRearGroup);

  const irGlandAnchor = new THREE.Object3D();
  irGlandAnchor.position.set(0, 0.055, -0.048);
  irRearGroup.add(irGlandAnchor);

  // Internal 4-LED MCPCB array (steps slightly on explode)
  const irArrayGroup = new THREE.Group();
  const irBoard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.0025, 24),
    new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.45, metalness: 0.2 })
  );
  irBoard.position.y = 0.0085;
  irArrayGroup.add(irBoard);

  // Reflective chrome cup ring around LEDs
  const irReflector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0215, 0.0185, 0.004, 24, 1, true),
    mat.stainlessSteel
  );
  irReflector.position.y = 0.0055;
  irArrayGroup.add(irReflector);

  // Central ambient CdS light sensor
  const cdsSensor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.003, 14),
    new THREE.MeshStandardMaterial({ color: 0xb67432, roughness: 0.35 })
  );
  cdsSensor.position.y = 0.006;
  irArrayGroup.add(cdsSensor);

  // 4 high-power 850nm IR LED domes
  const irLedMat = new THREE.MeshStandardMaterial({
    color: 0x26050c,
    emissive: new THREE.Color(0xff1026),
    emissiveIntensity: 0,
    roughness: 0.14,
    metalness: 0.1
  });
  [
    [-0.010, -0.010],
    [0.010, -0.010],
    [-0.010, 0.010],
    [0.010, 0.010]
  ].forEach(([lx, lz]) => {
    const ledBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0044, 0.0048, 0.0022, 16),
      mat.stainlessSteel
    );
    ledBase.position.set(lx, 0.0068, lz);
    irArrayGroup.add(ledBase);

    const ledDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.0039, 16, 12),
      irLedMat
    );
    ledDome.position.set(lx, 0.0052, lz);
    irArrayGroup.add(ledDome);
  });

  // Additive crimson-IR halo disc under face when nightMode is true
  const irGlowHaloMat = new THREE.MeshBasicMaterial({
    color: 0xff1630,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const irGlowHalo = new THREE.Mesh(
    new THREE.CircleGeometry(0.028, 28),
    irGlowHaloMat
  );
  irGlowHalo.rotation.x = Math.PI * 0.5;
  irGlowHalo.position.y = -0.0018;
  irArrayGroup.add(irGlowHalo);

  irIlluminatorGroup.add(irArrayGroup);

  // Front bezel ring + glass lens (drops -Y on explode)
  const irFrontGroup = new THREE.Group();
  const irBezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.0255, 0.0036, 12, 28),
    mat.anodizedBlack
  );
  irBezel.rotation.x = Math.PI * 0.5;
  irBezel.position.y = 0.0022;
  irBezel.castShadow = true;
  irFrontGroup.add(irBezel);

  const irFrontGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0225, 0.0225, 0.0016, 28),
    mat.opticalGlass
  );
  irFrontGlass.position.y = 0.001;
  irFrontGroup.add(irFrontGlass);
  irIlluminatorGroup.add(irFrontGroup);

  tagComponentInfo(irIlluminatorGroup, irInfo);
  irIlluminatorGroup.userData.glandAnchor = irGlandAnchor;

  // =========================================================================
  // 4) MAIN CONTROL BOX GROUP (Fig. 9 / image11.jpg)
  // Scale: 0.28 x 0.22 x 0.11 m. Local origin = enclosure center.
  // Back wall @ z = -0.055; Smoke-grey lid @ z = +0.035..+0.055 (+Z normal).
  // =========================================================================
  const controlBoxGroup = new THREE.Group();
  controlBoxGroup.name = 'controlBoxGroup';

  const boxBaseInfo = {
    id: 'ENC-MAIN',
    designator: 'ENC-1',
    title: 'Main IP65 Edge Control Enclosure',
    role: 'Weatherproof Housing for Edge Compute, Power Regulation, RTC & Storage',
    specs: '280 × 220 × 110 mm IP65 Polycarbonate/ABS Base, Smoke-Grey Transparent Lid, Silicone Gasket, 3× PG13.5 Glands',
    pinout: '3× Bottom Hex Glands (-Y): LiDAR, Camera CSI-2, 12V IR Illuminator',
    power: 'Houses 12.8V LiFePO4 Pack, 5A Fuse, LM2596 (5.1V) & Buck-Boost (12V)',
    bus: 'Mounting Brackets (-Z) onto Gantry / Bridge Pole',
    group: 'Enclosures'
  };

  const boxLidInfo = {
    id: 'ENC-MAIN-LID',
    designator: 'ENC-1-LID',
    title: 'Smoke-Grey Transparent IP65 Lid',
    role: 'Sealed Viewing Cover Allowing Visual Inspection of Status LEDs While Weatherproof',
    specs: 'Polycarbonate Smoke-Grey Window + ABS Perimeter Flange + 6× Captive Stainless Bolts',
    pinout: 'Compresses Silicone O-Ring Perimeter Gasket',
    power: 'N/A (Protective Cover)',
    bus: 'Lifts Along +Z Normal in Exploded CAD View',
    group: 'Enclosures'
  };

  const boxW = 0.28;
  const boxH = 0.22;
  const boxBaseDepth = 0.088; // z in [-0.055, +0.033]
  const boxWall = 0.0055;

  const mainShell = createHollowShell({
    width: boxW,
    height: boxH,
    depth: boxBaseDepth,
    wall: boxWall,
    cornerRadius: 0.012,
    bodyMat: mat.absGrey
  });
  mainShell.position.z = -0.055;
  tagComponentInfo(mainShell, boxBaseInfo);
  controlBoxGroup.add(mainShell);

  // Internal backplate mounting tray with grid texture
  const backplateTex = createBadgeTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#aeb7c2';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70, 82, 98, 0.25)';
    ctx.lineWidth = 1.5;
    for (let x = 24; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 24; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#3c4654';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('IP65 INTERNAL MOUNTING BACKPLATE • REV 3.1', 18, h - 14);
  });
  const backplate = new THREE.Mesh(
    new THREE.BoxGeometry(0.258, 0.198, 0.0025),
    new THREE.MeshStandardMaterial({ map: backplateTex, roughness: 0.55, metalness: 0.2 })
  );
  backplate.position.set(0, 0, -0.0475);
  backplate.receiveShadow = true;
  tagComponentInfo(backplate, boxBaseInfo);
  controlBoxGroup.add(backplate);

  // 4 internal corner bosses + brass threaded inserts
  const boxBoltPts = [
    [-0.124, -0.094],
    [0.124, -0.094],
    [-0.124, 0.094],
    [0.124, 0.094],
    [0, -0.094],
    [0, 0.094]
  ];
  boxBoltPts.slice(0, 4).forEach(([bx, by]) => {
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, boxBaseDepth - boxWall - 0.002, 16),
      mat.absInnerGrey
    );
    boss.rotation.x = Math.PI * 0.5;
    boss.position.set(bx, by, -0.055 + boxWall + (boxBaseDepth - boxWall - 0.002) * 0.5);
    tagComponentInfo(boss, boxBaseInfo);
    controlBoxGroup.add(boss);

    const insert = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0026, 0.0026, 0.005, 12),
      mat.brassInsert
    );
    insert.rotation.x = Math.PI * 0.5;
    insert.position.set(bx, by, 0.030);
    tagComponentInfo(insert, boxBaseInfo);
    controlBoxGroup.add(insert);
  });

  // 4 external mounting brackets on rear -Z corners
  const bracketOffsets = [
    [-0.146, 0.086],
    [0.146, 0.086],
    [-0.146, -0.086],
    [0.146, -0.086]
  ];
  bracketOffsets.forEach(([mx, my]) => {
    const lug = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.022, 0.006),
      mat.darkBody
    );
    lug.position.set(mx, my, -0.052);
    lug.castShadow = true;
    tagComponentInfo(lug, boxBaseInfo);
    controlBoxGroup.add(lug);

    const mountBolt = createMachineBolt(0.0036, 0.005, mat.stainlessSteel, mat.slotDark);
    mountBolt.rotation.y = Math.PI;
    mountBolt.position.set(mx + (mx > 0 ? 0.003 : -0.003), my, -0.056);
    tagComponentInfo(mountBolt, boxBaseInfo);
    controlBoxGroup.add(mountBolt);
  });

  // 3 bottom hex cable glands along y = -0.110 pointing -Y
  const glandConfigs = [
    { key: 'lidar', x: -0.075 },
    { key: 'camera', x: 0.0 },
    { key: 'ir', x: 0.075 }
  ];
  const glandAnchors = {};
  glandConfigs.forEach(({ key, x }) => {
    const gland = createHexCableGland(1.0, mat.glandGrey, mat.rubberBlack);
    gland.rotation.x = Math.PI;
    gland.position.set(x, -boxH * 0.5, -0.014);
    tagComponentInfo(gland, boxBaseInfo);
    controlBoxGroup.add(gland);

    const anchor = new THREE.Object3D();
    anchor.position.set(x, -boxH * 0.5 - 0.030, -0.014);
    controlBoxGroup.add(anchor);
    glandAnchors[key] = anchor;
  });

  // Silicone perimeter gasket at z = +0.034
  const mainGasketRestZ = 0.034;
  const mainGasket = createGasketLoop(
    boxW - 0.008,
    boxH - 0.008,
    0.0042,
    0.0024,
    0.010,
    mat.siliconeGasket
  );
  mainGasket.position.z = mainGasketRestZ;
  tagComponentInfo(mainGasket, boxBaseInfo);
  controlBoxGroup.add(mainGasket);

  // Transparent / smoke-grey lid with outer grey frame + perimeter bolts
  const mainLidRestZ = 0.0355;
  const mainLidGroup = new THREE.Group();
  mainLidGroup.position.z = mainLidRestZ;

  const lidFrameShape = createRoundedRectShape(boxW, boxH, 0.012);
  lidFrameShape.holes.push(createRoundedRectHole(0.232, 0.172, 0.007));
  const lidFrameGeo = new THREE.ExtrudeGeometry(lidFrameShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 16
  });
  const lidFrameMesh = new THREE.Mesh(lidFrameGeo, mat.absGrey);
  lidFrameMesh.castShadow = true;
  lidFrameMesh.receiveShadow = true;
  mainLidGroup.add(lidFrameMesh);

  const lidWindow = new THREE.Mesh(
    new THREE.BoxGeometry(0.234, 0.174, 0.004),
    mat.smokeLidGlass
  );
  lidWindow.position.z = 0.014;
  mainLidGroup.add(lidWindow);

  // Subtle corner technical badge on top-right of the lid frame
  const lidLabelTex = createBadgeTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1b222b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6ad4ff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('IP65 • TELEMETRY', 14, 28);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px monospace';
    ctx.fillText('RPi3B / LiFePO4 / RTC', 14, 50);
  });
  const lidBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.056, 0.014),
    new THREE.MeshBasicMaterial({ map: lidLabelTex })
  );
  lidBadge.position.set(0.082, 0.097, 0.0195);
  mainLidGroup.add(lidBadge);

  boxBoltPts.forEach(([bx, by]) => {
    const bolt = createMachineBolt(0.0034, 0.0035, mat.stainlessSteel, mat.slotDark);
    bolt.position.set(bx, by, 0.019);
    mainLidGroup.add(bolt);
  });

  tagComponentInfo(mainLidGroup, boxLidInfo);
  controlBoxGroup.add(mainLidGroup);

  controlBoxGroup.userData.glandAnchors = glandAnchors;
  controlBoxGroup.userData.explodeFactor = 0;

  // =========================================================================
  // EXPLODE & NIGHT STATE UPDATE
  // =========================================================================
  let irGlowAlpha = 0;

  function updateExplode(explodeFactor, dt = 0, state = {}) {
    const rawTarget = explodeFactor !== undefined && explodeFactor !== null
      ? explodeFactor
      : (state && typeof state.explodeFactor === 'number' ? state.explodeFactor : 0);
    const e = THREE.MathUtils.clamp(rawTarget, 0, 1);

    // 1) Control box lid + gasket separate cleanly along +Z lid normal
    mainGasket.position.z = mainGasketRestZ + 0.068 * e;
    mainLidGroup.position.z = mainLidRestZ + 0.155 * e;
    controlBoxGroup.userData.explodeFactor = e;

    // 2) LiDAR pod lid + gasket lift along +Y / -Z
    lidarGasket.position.set(
      lidarGasketRest.x,
      lidarGasketRest.y + 0.026 * e,
      lidarGasketRest.z - 0.010 * e
    );
    lidarLidGroup.position.set(
      lidarLidRest.x,
      lidarLidRest.y + 0.058 * e,
      lidarLidRest.z - 0.024 * e
    );
    lidarPodGroup.userData.explodeFactor = e;

    // 3) Camera pod lid + gasket lift along +Y
    camGasket.position.y = camGasketRest.y + 0.030 * e;
    camLidGroup.position.y = camLidRest.y + 0.068 * e;
    cameraPodGroup.userData.explodeFactor = e;

    // 4) IR Illuminator axial separation + 850nm deep-red glow in Night Mode
    irFrontGroup.position.y = -0.028 * e;
    irArrayGroup.position.y = -0.012 * e;
    irRearGroup.position.y = 0.032 * e;
    irIlluminatorGroup.userData.explodeFactor = e;

    const nightActive = Boolean(state && state.nightMode);
    if (dt > 0) {
      const rate = Math.min(1, dt * 8);
      irGlowAlpha += ((nightActive ? 1 : 0) - irGlowAlpha) * rate;
    } else {
      irGlowAlpha = nightActive ? 1 : 0;
    }
    irLedMat.emissiveIntensity = irGlowAlpha * 2.4;
    irGlowHaloMat.opacity = irGlowAlpha * 0.42;
    irGlowHalo.visible = irGlowAlpha > 0.01;
  }

  return {
    controlBoxGroup,
    lidarPodGroup,
    cameraPodGroup,
    irIlluminatorGroup,
    updateExplode
  };
}

  return { tagComponentInfo, createEnclosures };
})(THREE);

/* === MODULE: src/scene/hardwareRig.js === */
RiverSimModules.hardwareRig = (function (THREE, { tagComponentInfo }) {
/**
 * Generates a crisp procedural CanvasTexture for PCB silkscreens & labels.
 */
function createCanvasTex(width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Helper to create a smooth colored TubeGeometry wire along points.
 */
function createWireMesh(points, radius, colorHex, roughness = 0.42) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.max(14, points.length * 6), radius, 7, false);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return { mesh, curve };
}

/**
 * Builds a flat ribbon mesh along a 3D CatmullRomCurve3 (for MIPI CSI-2 FFC cable).
 */
function createFlatRibbonMesh(points, width, thickness, mat) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = 28;
  const positions = [];
  const uvs = [];
  const indices = [];

  const upHint = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tangent).normalize();

    if (Math.abs(tangent.dot(upHint)) > 0.92) {
      side.crossVectors(tangent, new THREE.Vector3(0, 0, 1)).normalize();
    } else {
      side.crossVectors(tangent, upHint).normalize();
    }
    normal.crossVectors(side, tangent).normalize();

    const hw = width * 0.5;
    const ht = thickness * 0.5;

    // 4 vertices per ring (top-L, top-R, bot-R, bot-L)
    const v0 = p.clone().addScaledVector(side, -hw).addScaledVector(normal, ht);
    const v1 = p.clone().addScaledVector(side, hw).addScaledVector(normal, ht);
    const v2 = p.clone().addScaledVector(side, hw).addScaledVector(normal, -ht);
    const v3 = p.clone().addScaledVector(side, -hw).addScaledVector(normal, -ht);

    [v0, v1, v2, v3].forEach((v, k) => {
      positions.push(v.x, v.y, v.z);
      uvs.push(k === 0 || k === 3 ? 0 : 1, t);
    });

    if (i < segs) {
      const b = i * 4;
      const n = (i + 1) * 4;
      // Top face
      indices.push(b + 0, b + 1, n + 1, b + 0, n + 1, n + 0);
      // Bottom face
      indices.push(b + 2, b + 3, n + 3, b + 2, n + 3, n + 2);
      // Left edge
      indices.push(b + 3, b + 0, n + 0, b + 3, n + 0, n + 3);
      // Right edge
      indices.push(b + 1, b + 2, n + 2, b + 1, n + 2, n + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return { mesh, curve };
}

/**
 * Builds accurate 3D electronic component twins, internal & external wiring harnesses,
 * standalone Wi-Fi router, component metadata, and animated CatmullRomCurve3 signal pulses.
 */
function createHardwareRig(enclosures) {
  const {
    controlBoxGroup,
    lidarPodGroup,
    cameraPodGroup,
    irIlluminatorGroup
  } = enclosures;

  const group = new THREE.Group();
  group.name = 'hardwareRigGroup';

  // =========================================================================
  // COMPONENT METADATA CATALOG (Table 3 & Thesis Wiring Schematic)
  // =========================================================================
  const componentCatalog = {
    U1: {
      id: 'U1',
      designator: 'U1',
      title: 'Raspberry Pi 3 Model B',
      role: 'Edge Compute SBC: Acquisition, RTC Sync, SQLite Buffering & Wi-Fi Telemetry',
      specs: 'Broadcom BCM2837 Quad-Core 1.2 GHz, 1 GB RAM, 40-Pin GPIO, 4× USB 2.0, RJ45 Ethernet, MIPI CSI-2, 2.4 GHz WLAN',
      pinout: 'Pin 1 (3.3V)->RTC VCC | Pin 2/4 (5.1V)<-PS1 | Pin 3/5 (SDA/SCL)<->RTC | Pin 8/10 (TXD/RXD)<->TF-Luna | CSI-2<-Cam3',
      power: '+5.10 V DC via GPIO Pins 2 & 4 (from LM2596 PS1)',
      bus: 'UART0 (115200 bps), I2C-1 (400 kHz), MIPI CSI-2, USB 2.0, SDIO, 2.4 GHz Wi-Fi',
      group: 'Edge Compute'
    },
    U2: {
      id: 'U2',
      designator: 'U2',
      title: 'Benewake TF-Luna ToF LiDAR',
      role: 'Non-Contact Water-Level Distance Sensor (WL = H - D)',
      specs: '850 nm VCSEL ToF, Range 0.20–8.0 m, Resolution 1 cm, Accuracy ±6 cm (0.2–3 m) / ±2% (3–8 m), 100 Hz UART',
      pinout: '6-Pin JST GH 1.25 mm: 1:+5V (Red), 2:RXD (Green->GPIO14), 3:TXD (Blue->GPIO15), 4:GND (Black), 5:CFG (NC), 6:OUT (NC)',
      power: '+5.10 V DC (Pin 1), ~0.35 W avg',
      bus: 'UART TTL 3.3V (115200 bps)',
      group: 'Sensors & Optics'
    },
    U3: {
      id: 'U3',
      designator: 'U3',
      title: 'Raspberry Pi Camera Module 3 NoIR',
      role: 'Day & 850 nm Night-IR Video Capture for PyORC LSPIV & YOLOv8 Debris Detection',
      specs: 'Sony IMX708 11.9 MP CMOS, No IR-Cut Filter, 75° DFOV / 66° HFOV, PDAF Autofocus, 1080p30/720p60',
      pinout: '15-Pin MIPI CSI-2 Flat Flex Ribbon Cable -> Pi 3B CSI Port',
      power: '3.3 V via MIPI CSI-2 FFC',
      bus: 'MIPI CSI-2 High-Speed Differential',
      group: 'Sensors & Optics'
    },
    U4: {
      id: 'U4',
      designator: 'U4',
      title: 'DS3231 Precision RTC Module',
      role: 'Offline-Resilient Timestamping (±2 ppm) During Wi-Fi Outages',
      specs: 'Maxim DS3231 TCXO I2C RTC + CR2032 3V Lithium Coin Backup Cell, Integrated Temp Compensation',
      pinout: 'VCC (Yellow)->Pi Pin 1 (3.3V) | SDA (Cyan)->GPIO2 | SCL (Purple)->GPIO3 | GND (Black)->GND | SQW->GPIO0',
      power: '+3.3 V DC + CR2032 Coin Battery Backup',
      bus: 'I2C Bus (0x68)',
      group: 'Edge Compute'
    },
    BT1: {
      id: 'BT1',
      designator: 'BT1',
      title: '12V LiFePO4 3S2P Battery Pack w/ BMS',
      role: 'Primary Off-Grid Field Energy Storage',
      specs: '12.8 V Nominal (14.6 V Max Charge), 3S2P Cylindrical LiFePO4 Cell Array + 3S BMS Protection PCB',
      pinout: 'P+ (Red)->F1 5A Inline Fuse (V_FUSED) | P- (Black)->Main GND Bus',
      power: '12.8 V DC Nominal Battery Source',
      bus: 'Unregulated 12V Primary DC Bus',
      group: 'Power & Protection'
    },
    F1: {
      id: 'F1',
      designator: 'F1',
      title: '5A Inline Fuse Holder',
      role: 'Primary Overcurrent & Short-Circuit Protection on Battery Positive Line',
      specs: '5 A Fast-Blow Blade Fuse inside Translucent Amber Inline Holder',
      pinout: 'IN<-BT1 P+ | OUT (V_FUSED)->PS1 IN+ & PS2 VIN+',
      power: 'Rated 5.0 A @ 32 V DC',
      bus: 'V_FUSED 12V Bus',
      group: 'Power & Protection'
    },
    PS1: {
      id: 'PS1',
      designator: 'PS1',
      title: 'LM2596 DC-DC Buck Converter (5.1 V)',
      role: 'Step-Down Voltage Regulator Powering Raspberry Pi 3B & TF-Luna LiDAR',
      specs: 'LM2596S Switching Buck Regulator, Precision Trimpot Tuned to 5.10 V DC (Up to 3 A), 33 µH Inductor',
      pinout: 'IN+<-V_FUSED | IN-<-GND | OUT+ (Orange +5.1V)->TB1/Pi Pins 2,4 & TF-Luna Pin 1',
      power: '12.8 V In -> 5.10 V DC Regulated Out',
      bus: '+5.1V Logic Power Bus',
      group: 'Power & Protection'
    },
    PS2: {
      id: 'PS2',
      designator: 'PS2',
      title: 'DC-DC Automatic Buck-Boost Converter (12 V)',
      role: 'Regulated 12.0 V Supply for 850 nm IR Illuminator Across Battery Discharge',
      specs: 'Auto Step-Up/Step-Down Module, Dual Extruded Black Heatsinks, Toroidal Inductor, Green Filter Caps',
      pinout: 'VIN+<-V_FUSED | VIN-<-GND | OUT+ (Red +12V)->IR1 VCC | OUT-->IR1 GND',
      power: '9–15 V In -> Stabilized 12.0 V DC Out',
      bus: '+12.0V Regulated IR Bus',
      group: 'Power & Protection'
    },
    SSD1: {
      id: 'SSD1',
      designator: 'SSD1',
      title: '2.5" SATA SSD Drive (USB 2.0 Bridge)',
      role: 'High-Endurance Local Storage for SQLite Telemetry Queue & Video Clips',
      specs: '2.5" 240 GB SATA III SSD + USB 2.0-to-SATA Adapter Cable (Prevents microSD Wearout)',
      pinout: 'USB 2.0 Type-A Cable -> Raspberry Pi 3B USB Port',
      power: '+5.0 V via Pi USB 2.0 Port',
      bus: 'USB 2.0 Mass Storage',
      group: 'Storage & Comms'
    },
    SD1: {
      id: 'SD1',
      designator: 'SD1',
      title: '32 GB microSD Card (SDIO Boot)',
      role: 'Primary OS & Edge Acquisition Script Storage',
      specs: '32 GB UHS-I microSDHC Installed in Raspberry Pi 3B Underside SDIO Slot',
      pinout: 'SDIO Slot -> Raspberry Pi 3B U1',
      power: '3.3 V SDIO',
      bus: 'SDIO Bus',
      group: 'Storage & Comms'
    },
    TB1: {
      id: 'TB1',
      designator: 'TB1',
      title: 'Terminal Distribution Blocks & JST GH Harnesses',
      role: 'Vibration-Proof Power/Signal Distribution & Modular Interconnects',
      specs: 'Color-Coded Harnesses: Red 12V, Orange 5.1V, Yellow 3.3V, Black GND, Blue/Green UART, Cyan/Purple I2C',
      pinout: 'Distributes +12V, +5.1V, GND across BT1, PS1, PS2, U1, U2, U4, IR1',
      power: 'Multi-Rail Bus Distribution',
      bus: 'All Internal & Gland Buses',
      group: 'Power & Protection'
    },
    AP1: {
      id: 'AP1',
      designator: 'AP1',
      title: 'Wi-Fi Router / Access Point (Separately Powered)',
      role: '2.4 GHz Local WLAN Gateway Forwarding Edge Telemetry & Clips to Cloud Server',
      specs: 'Dual-Antenna 2.4 GHz 802.11n Wireless Router / AP, Separately Powered Mains/Field Supply',
      pinout: '2.4 GHz WLAN <-> Raspberry Pi 3B | WAN Uplink -> Cloud FastAPI + PostgreSQL Server',
      power: 'External 12 V DC Adapter (Separately Powered)',
      bus: '2.4 GHz Wi-Fi -> Cloud HTTPS/REST',
      group: 'Storage & Comms'
    }
  };

  // Shared PBR Materials
  const mat = {
    pcbGreen: new THREE.MeshStandardMaterial({ color: 0x156c35, roughness: 0.45, metalness: 0.1 }),
    pcbDarkGreen: new THREE.MeshStandardMaterial({ color: 0x0f3b22, roughness: 0.48, metalness: 0.12 }),
    pcbBlue: new THREE.MeshStandardMaterial({ color: 0x1254a8, roughness: 0.4, metalness: 0.12 }),
    pcbRed: new THREE.MeshStandardMaterial({ color: 0xb41d23, roughness: 0.42, metalness: 0.12 }),
    pcbBlack: new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.48, metalness: 0.15 }),
    icBlack: new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.35, metalness: 0.25 }),
    metalSilver: new THREE.MeshStandardMaterial({ color: 0xcbd3dc, roughness: 0.24, metalness: 0.88 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x2c323b, roughness: 0.38, metalness: 0.65 }),
    goldPin: new THREE.MeshStandardMaterial({ color: 0xe3b94b, roughness: 0.25, metalness: 0.9 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc97438, roughness: 0.28, metalness: 0.85 }),
    heatsinkBlack: new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.4, metalness: 0.72 }),
    jstWhite: new THREE.MeshStandardMaterial({ color: 0xf1f4f8, roughness: 0.42, metalness: 0.05 }),
    blueTerm: new THREE.MeshStandardMaterial({ color: 0x1a6ed8, roughness: 0.45, metalness: 0.05 }),
    capGreen: new THREE.MeshStandardMaterial({ color: 0x148249, roughness: 0.35, metalness: 0.15 }),
    batteryBlue: new THREE.MeshStandardMaterial({ color: 0x2474cc, roughness: 0.32, metalness: 0.12 }),
    kaptonAmber: new THREE.MeshStandardMaterial({ color: 0xd98a18, roughness: 0.3, transparent: true, opacity: 0.85 }),
    fuseAmber: new THREE.MeshPhysicalMaterial({ color: 0xf6b932, transparent: true, opacity: 0.65, roughness: 0.15, clearcoat: 0.8 }),
    ssdBody: new THREE.MeshStandardMaterial({ color: 0x2e343e, roughness: 0.36, metalness: 0.68 }),
    lensIridescent: new THREE.MeshPhysicalMaterial({ color: 0x142442, roughness: 0.05, metalness: 0.4, clearcoat: 1.0 })
  };

  // =========================================================================
  // 1) INSIDE LIDAR POD: Benewake TF-Luna + 6-pin JST GH 1.25mm
  // =========================================================================
  const tfLunaGroup = new THREE.Group();
  tfLunaGroup.name = 'tfLunaModule';
  tfLunaGroup.position.set(0, 0.011, 0);

  const tfLabelTex = createCanvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#171a20';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8e0ea';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TF-Luna LiDAR', w * 0.5, 52);
    ctx.fillStyle = '#8b99ab';
    ctx.font = '18px monospace';
    ctx.fillText('Benewake 850nm ToF', w * 0.5, 86);
  });

  // Main black ABS sensor housing (35 x 12 x 21 mm)
  const tfBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.012, 0.021),
    mat.icBlack
  );
  tfBody.position.y = 0.006;
  tfBody.castShadow = true;
  tfLunaGroup.add(tfBody);

  // Top label sticker
  const tfTopPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.031, 0.016),
    new THREE.MeshBasicMaterial({ map: tfLabelTex })
  );
  tfTopPlate.rotation.x = -Math.PI * 0.5;
  tfTopPlate.position.y = 0.0122;
  tfLunaGroup.add(tfTopPlate);

  // Side mounting ears resting on pod standoffs (x = +-0.0215)
  [-0.0215, 0.0215].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0025, 0.012), mat.icBlack);
    ear.position.set(ex, 0.004, 0);
    tfLunaGroup.add(ear);

    const screwRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.003, 12),
      mat.metalSilver
    );
    screwRing.position.set(ex, 0.0045, 0);
    tfLunaGroup.add(screwRing);
  });

  // Dual emitter & receiver optical barrels facing -Y into pod windows
  [-0.0095, 0.0095].forEach((lx, idx) => {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0068, 0.0068, 0.005, 22),
      mat.metalDark
    );
    barrel.position.set(lx, -0.001, 0);
    tfLunaGroup.add(barrel);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0052, 0.0052, 0.0015, 22),
      idx === 0
        ? new THREE.MeshPhysicalMaterial({ color: 0x0b2a22, roughness: 0.06, clearcoat: 1.0 })
        : mat.lensIridescent
    );
    lens.position.set(lx, -0.003, 0);
    tfLunaGroup.add(lens);
  });

  // 6-pin JST GH 1.25mm white connector + micro-wire harness to pod +Z gland
  const jstSocket = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0042, 0.0055), mat.jstWhite);
  jstSocket.position.set(0, 0.008, 0.0125);
  tfLunaGroup.add(jstSocket);

  const jstColors = [0xe52424, 0x1ec95b, 0x2488ff, 0x1d2128, 0xeaeef2, 0xf2c922];
  jstColors.forEach((col, i) => {
    const px = -0.0038 + i * 0.0015;
    const { mesh } = createWireMesh(
      [
        new THREE.Vector3(px, 0.008, 0.015),
        new THREE.Vector3(px * 0.6, 0.009, 0.022),
        new THREE.Vector3(px * 0.3, 0.009, 0.029)
      ],
      0.00048,
      col
    );
    tfLunaGroup.add(mesh);
  });

  tagComponentInfo(tfLunaGroup, componentCatalog.U2);
  lidarPodGroup.add(tfLunaGroup);

  // =========================================================================
  // 2) INSIDE CAMERA POD: Pi Camera Module 3 NoIR + White MIPI CSI-2 Ribbon
  // =========================================================================
  const camModuleGroup = new THREE.Group();
  camModuleGroup.name = 'piCamNoIRModule';
  camModuleGroup.position.set(0, 0.0145, 0);

  const camPcbTex = createCanvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0e3620';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#f5d77a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Pi Cam 3 NoIR', 22, 34);
    ctx.font = '14px monospace';
    ctx.fillText('IMX708 12MP', 22, h - 18);
  });

  const camPcb = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.0018, 0.024),
    new THREE.MeshStandardMaterial({ map: camPcbTex, roughness: 0.45, metalness: 0.15 })
  );
  camPcb.castShadow = true;
  camModuleGroup.add(camPcb);

  // 4 corner M2 gold mounting pads + screws
  [
    [-0.0105, -0.010],
    [0.0105, -0.010],
    [-0.0105, 0.010],
    [0.0105, 0.010]
  ].forEach(([cx, cz]) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0024, 12), mat.goldPin);
    pad.position.set(cx, 0.0005, cz);
    camModuleGroup.add(pad);
  });

  // Sony IMX708 autofocus cube + NoIR lens facing -Y into viewing window
  const camSensorBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.0115, 0.0068, 0.0115),
    mat.icBlack
  );
  camSensorBox.position.set(0, -0.004, 0);
  camModuleGroup.add(camSensorBox);

  const camLensRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0044, 0.0046, 0.003, 20),
    mat.metalDark
  );
  camLensRing.position.set(0, -0.008, 0);
  camModuleGroup.add(camLensRing);

  const camGlassElement = new THREE.Mesh(
    new THREE.SphereGeometry(0.0028, 16, 12),
    mat.lensIridescent
  );
  camGlassElement.scale.y = 0.45;
  camGlassElement.position.set(0, -0.009, 0);
  camModuleGroup.add(camGlassElement);

  // ZIF CSI connector + White 15-pin MIPI CSI-2 flat ribbon curving out -Z gland
  const camZif = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0024, 0.0045), mat.jstWhite);
  camZif.position.set(0, 0.0018, -0.009);
  camModuleGroup.add(camZif);

  const csiRibbonTex = createCanvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c4cdd8';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 15; i++) {
      const x = (i / 16) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.fillStyle = '#1d6ce0';
    ctx.fillRect(0, 0, w, 22);
  });
  const csiRibbonMat = new THREE.MeshStandardMaterial({
    map: csiRibbonTex,
    roughness: 0.35,
    metalness: 0.1
  });
  const { mesh: camRibbonMesh } = createFlatRibbonMesh(
    [
      new THREE.Vector3(0, 0.0022, -0.011),
      new THREE.Vector3(0, 0.007, -0.022),
      new THREE.Vector3(0, 0.0075, -0.036)
    ],
    0.0155,
    0.0005,
    csiRibbonMat
  );
  camModuleGroup.add(camRibbonMesh);

  tagComponentInfo(camModuleGroup, componentCatalog.U3);
  cameraPodGroup.add(camModuleGroup);

  // =========================================================================
  // 3) INSIDE MAIN CONTROL BOX: Exact 1:1 Component Twins & Bus Harnesses
  // =========================================================================
  const internalsGroup = new THREE.Group();
  internalsGroup.name = 'controlBoxInternals';

  // --- BT1: 12V LiFePO4 3S2P Battery Pack + Green BMS PCB (Left: x=-0.092, y=0.002) ---
  const bt1Group = new THREE.Group();
  bt1Group.position.set(-0.092, -0.002, -0.025);

  const cellGeo = new THREE.CylinderGeometry(0.0088, 0.0088, 0.062, 16);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = -0.018 + col * 0.018;
      const cz = -0.009 + row * 0.018;
      const cell = new THREE.Mesh(cellGeo, mat.batteryBlue);
      cell.position.set(cx, 0, cz);
      cell.castShadow = true;
      bt1Group.add(cell);

      const capTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0078, 0.0078, 0.0018, 14),
        mat.jstWhite
      );
      capTop.position.set(cx, 0.0315, cz);
      bt1Group.add(capTop);
    }
  }

  // Kapton wrap band + label
  const btLabelTex = createCanvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1b5fa8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('12.8V LiFePO4', 22, 52);
    ctx.fillStyle = '#a8dcff';
    ctx.font = '18px monospace';
    ctx.fillText('3S2P Pack w/ BMS', 22, 86);
  });
  const btBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.024, 0.037),
    new THREE.MeshStandardMaterial({ map: btLabelTex, roughness: 0.38 })
  );
  btBand.position.set(0, -0.004, 0);
  bt1Group.add(btBand);

  // Green BMS PCB mounted across top/front of cells
  const bmsPcb = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.018, 0.0022), mat.pcbGreen);
  bmsPcb.position.set(0, 0.024, 0.019);
  bmsPcb.castShadow = true;
  bt1Group.add(bmsPcb);

  for (let m = 0; m < 4; m++) {
    const mosfet = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.005, 0.002), mat.icBlack);
    mosfet.position.set(-0.016 + m * 0.0105, 0.025, 0.021);
    bt1Group.add(mosfet);
  }
  const bmsPadPlus = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.0015), mat.goldPin);
  bmsPadPlus.position.set(0.020, 0.018, 0.0205);
  bt1Group.add(bmsPadPlus);

  const bmsPadMinus = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.0015), mat.metalSilver);
  bmsPadMinus.position.set(-0.020, 0.018, 0.0205);
  bt1Group.add(bmsPadMinus);

  tagComponentInfo(bt1Group, componentCatalog.BT1);
  internalsGroup.add(bt1Group);

  // --- F1: 5A Inline Fuse Holder (Bottom-left: x=-0.090, y=-0.072) ---
  const f1Group = new THREE.Group();
  f1Group.position.set(-0.090, -0.072, -0.036);

  const fuseHousing = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.013, 0.013), mat.fuseAmber);
  fuseHousing.castShadow = true;
  f1Group.add(fuseHousing);

  const fuseBlade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.005), mat.metalSilver);
  f1Group.add(fuseBlade);

  [-0.016, 0.016].forEach((gx) => {
    const grommet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.0045, 0.006, 12),
      mat.icBlack
    );
    grommet.rotation.z = Math.PI * 0.5;
    grommet.position.x = gx;
    f1Group.add(grommet);
  });

  tagComponentInfo(f1Group, componentCatalog.F1);
  internalsGroup.add(f1Group);

  // --- PS1: Blue LM2596 5.1V Buck Converter (Bottom-center-left: x=-0.024, y=-0.068) ---
  const ps1Group = new THREE.Group();
  ps1Group.position.set(-0.024, -0.068, -0.039);

  const ps1Pcb = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.024, 0.0018), mat.pcbBlue);
  ps1Pcb.castShadow = true;
  ps1Group.add(ps1Pcb);

  // 2 electrolytic caps
  [-0.016, 0.016].forEach((cx) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.010, 14), mat.icBlack);
    cap.rotation.x = Math.PI * 0.5;
    cap.position.set(cx, 0.004, 0.006);
    ps1Group.add(cap);

    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0008, 14), mat.metalSilver);
    capTop.rotation.x = Math.PI * 0.5;
    capTop.position.set(cx, 0.004, 0.0112);
    ps1Group.add(capTop);
  });

  // 33uH shielded SMD power inductor + LM2596 TO-263 IC + blue trimpot
  const ps1Inductor = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.006), mat.metalDark);
  ps1Inductor.position.set(0.004, -0.003, 0.004);
  ps1Group.add(ps1Inductor);

  const ps1Ic = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.009, 0.004), mat.icBlack);
  ps1Ic.position.set(-0.007, -0.004, 0.003);
  ps1Group.add(ps1Ic);

  const ps1Pot = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.005, 0.008), mat.blueTerm);
  ps1Pot.position.set(-0.002, 0.007, 0.005);
  ps1Group.add(ps1Pot);

  const ps1PotScrew = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0014, 0.0014, 0.002, 10),
    mat.goldPin
  );
  ps1PotScrew.rotation.x = Math.PI * 0.5;
  ps1PotScrew.position.set(-0.005, 0.007, 0.0095);
  ps1Group.add(ps1PotScrew);

  const ps1LedMat = new THREE.MeshStandardMaterial({
    color: 0xff3b3b,
    emissive: 0xff2222,
    emissiveIntensity: 1.5
  });
  const ps1Led = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.0016, 0.0012), ps1LedMat);
  ps1Led.position.set(0.012, -0.007, 0.0018);
  ps1Group.add(ps1Led);

  tagComponentInfo(ps1Group, componentCatalog.PS1);
  internalsGroup.add(ps1Group);

  // --- PS2: Red DC-DC Automatic Buck-Boost Converter (Bottom-center-right: x=+0.044, y=-0.062) ---
  const ps2Group = new THREE.Group();
  ps2Group.position.set(0.044, -0.062, -0.036);

  const ps2Pcb = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.042, 0.002), mat.pcbRed);
  ps2Pcb.castShadow = true;
  ps2Group.add(ps2Pcb);

  // Dual black anodized heatsink fin strips along top & bottom edges
  [-0.019, 0.019].forEach((hy) => {
    const hsBase = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.004, 0.014), mat.heatsinkBlack);
    hsBase.position.set(0, hy, 0.007);
    ps2Group.add(hsBase);

    for (let f = -4; f <= 4; f++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.007, 0.014), mat.heatsinkBlack);
      fin.position.set(f * 0.0052, hy + (hy > 0 ? 0.003 : -0.003), 0.007);
      ps2Group.add(fin);
    }
  });

  // Large copper-wound toroidal inductor
  const toroidCore = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0038, 12, 24), mat.kaptonAmber);
  toroidCore.position.set(0.010, 0, 0.006);
  ps2Group.add(toroidCore);

  for (let w = 0; w < 16; w++) {
    const ang = (w / 16) * Math.PI * 2;
    const turn = new THREE.Mesh(new THREE.TorusGeometry(0.0042, 0.0007, 6, 12), mat.copper);
    turn.position.set(0.010 + Math.cos(ang) * 0.009, Math.sin(ang) * 0.009, 0.006);
    turn.rotation.z = ang + Math.PI * 0.5;
    turn.rotation.y = Math.PI * 0.5;
    ps2Group.add(turn);
  }

  // Two green electrolytic caps
  [-0.007, 0.007].forEach((cy) => {
    const gCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.013, 14), mat.capGreen);
    gCap.rotation.x = Math.PI * 0.5;
    gCap.position.set(-0.010, cy, 0.0075);
    ps2Group.add(gCap);

    const gCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.0008, 14), mat.metalSilver);
    gCapTop.rotation.x = Math.PI * 0.5;
    gCapTop.position.set(-0.010, cy, 0.0142);
    ps2Group.add(gCapTop);
  });

  // Blue screw terminal blocks (VIN left, OUT right)
  [-0.025, 0.025].forEach((tx) => {
    const term = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.010), mat.blueTerm);
    term.position.set(tx, 0, 0.0055);
    ps2Group.add(term);
  });

  const ps2LedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.2
  });
  const ps2Led = new THREE.Mesh(new THREE.BoxGeometry(0.0024, 0.0018, 0.0012), ps2LedMat);
  ps2Led.position.set(0.021, 0.011, 0.0018);
  ps2Group.add(ps2Led);

  tagComponentInfo(ps2Group, componentCatalog.PS2);
  internalsGroup.add(ps2Group);

  // --- SSD1: 2.5" SATA SSD Drive (Top-left: x=-0.056, y=+0.058) ---
  const ssdGroup = new THREE.Group();
  ssdGroup.position.set(-0.056, 0.058, -0.040);

  const ssdTex = createCanvasTex(256, 176, (ctx, w, h) => {
    ctx.fillStyle = '#2a3039';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#536275';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('2.5" SATA SSD', 24, 58);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('240 GB • SQLite Buffer', 24, 92);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText('USB 2.0 SATA Bridge', 24, 134);
  });

  const ssdBox = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.064, 0.008), mat.ssdBody);
  ssdBox.castShadow = true;
  ssdGroup.add(ssdBox);

  const ssdFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.088, 0.058),
    new THREE.MeshStandardMaterial({ map: ssdTex, roughness: 0.4, metalness: 0.3 })
  );
  ssdFace.position.z = 0.0042;
  ssdGroup.add(ssdFace);

  // SATA-to-USB adapter dongle on right edge
  const sataBridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.007), mat.icBlack);
  sataBridge.position.set(0.052, -0.010, 0);
  ssdGroup.add(sataBridge);

  tagComponentInfo(ssdGroup, componentCatalog.SSD1);
  internalsGroup.add(ssdGroup);

  // --- U4: Blue DS3231 RTC Module (Top-center: x=+0.022, y=+0.072) ---
  const rtcGroup = new THREE.Group();
  rtcGroup.position.set(0.022, 0.072, -0.040);

  const rtcPcb = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.0018), mat.pcbBlue);
  rtcPcb.castShadow = true;
  rtcGroup.add(rtcPcb);

  const coinHolder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0098, 0.0098, 0.0042, 20),
    mat.icBlack
  );
  coinHolder.rotation.x = Math.PI * 0.5;
  coinHolder.position.set(-0.004, 0, 0.003);
  rtcGroup.add(coinHolder);

  const coinTex = createCanvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d4dce6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#364150';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CR2032', w * 0.5, 58);
    ctx.font = '18px monospace';
    ctx.fillText('3V +', w * 0.5, 86);
  });
  const coinCell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0085, 0.0085, 0.0025, 20),
    new THREE.MeshStandardMaterial({ map: coinTex, roughness: 0.25, metalness: 0.85 })
  );
  coinCell.rotation.x = Math.PI * 0.5;
  coinCell.position.set(-0.004, 0, 0.0048);
  rtcGroup.add(coinCell);

  const dsChip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.010, 0.0022), mat.icBlack);
  dsChip.position.set(0.010, 0.002, 0.002);
  rtcGroup.add(dsChip);

  // 5-pin gold I2C header
  for (let p = 0; p < 5; p++) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0012, 0.006), mat.goldPin);
    pin.position.set(-0.010 + p * 0.0026, -0.009, 0.003);
    rtcGroup.add(pin);
  }

  const rtcLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.0022, 0.0014, 0.001),
    new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff1a1a, emissiveIntensity: 1.4 })
  );
  rtcLed.position.set(0.012, -0.006, 0.0016);
  rtcGroup.add(rtcLed);

  tagComponentInfo(rtcGroup, componentCatalog.U4);
  internalsGroup.add(rtcGroup);

  // --- U1: Raspberry Pi 3 Model B + SD1: 32GB microSD (Right: x=+0.086, y=+0.024) ---
  const piGroup = new THREE.Group();
  piGroup.position.set(0.086, 0.024, -0.038);

  const piTex = createCanvasTex(256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#156c35';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d9b54a';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#f2f6fa';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Raspberry Pi 3 B', 20, 44);
    ctx.font = '12px monospace';
    ctx.fillText('GPIO 40-PIN', 16, 150);
    ctx.fillText('CAMERA CSI', 120, 210);
  });
  const piPcb = new THREE.Mesh(
    new THREE.BoxGeometry(0.056, 0.085, 0.0018),
    new THREE.MeshStandardMaterial({ map: piTex, roughness: 0.45, metalness: 0.12 })
  );
  piPcb.castShadow = true;
  piGroup.add(piPcb);

  // Broadcom BCM2837 SoC
  const soc = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.0025), mat.metalSilver);
  soc.position.set(0.002, 0.010, 0.002);
  piGroup.add(soc);

  // LAN9514 USB/Ethernet IC
  const lanChip = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.009, 0.002), mat.icBlack);
  lanChip.position.set(-0.002, -0.014, 0.0018);
  piGroup.add(lanChip);

  // Silver WLAN/BT chip shield
  const wifiShield = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.013, 0.0022), mat.metalSilver);
  wifiShield.position.set(-0.016, 0.024, 0.002);
  piGroup.add(wifiShield);

  // 40-pin (2x20) GPIO header along left edge
  const gpioBase = new THREE.Mesh(new THREE.BoxGeometry(0.0052, 0.051, 0.003), mat.icBlack);
  gpioBase.position.set(-0.024, 0.008, 0.0025);
  piGroup.add(gpioBase);

  const pinGeo = new THREE.BoxGeometry(0.0009, 0.0009, 0.007);
  const gpioPinsInst = new THREE.InstancedMesh(pinGeo, mat.goldPin, 40);
  const pinDummy = new THREE.Object3D();
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 2; c++) {
      pinDummy.position.set(-0.0252 + c * 0.0024, -0.0155 + r * 0.00245, 0.0055);
      pinDummy.updateMatrix();
      gpioPinsInst.setMatrixAt(r * 2 + c, pinDummy.matrix);
    }
  }
  gpioPinsInst.instanceMatrix.needsUpdate = true;
  piGroup.add(gpioPinsInst);

  // 2x stacked dual USB 2.0 cages + RJ45 Ethernet cage on bottom edge
  [-0.016, 0.002].forEach((ux) => {
    const usbCage = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.017, 0.015), mat.metalSilver);
    usbCage.position.set(ux, -0.036, 0.0085);
    usbCage.castShadow = true;
    piGroup.add(usbCage);
  });
  const rj45 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.021, 0.0135), mat.metalSilver);
  rj45.position.set(0.020, -0.035, 0.0078);
  rj45.castShadow = true;
  piGroup.add(rj45);

  // HDMI + 3.5mm AV + micro-USB on right edge
  const hdmi = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.015, 0.0065), mat.metalSilver);
  hdmi.position.set(0.024, 0.006, 0.004);
  piGroup.add(hdmi);

  const avJack = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.007, 0.0065), mat.icBlack);
  avJack.position.set(0.023, -0.012, 0.004);
  piGroup.add(avJack);

  const microUsbPwr = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.0035), mat.metalSilver);
  microUsbPwr.position.set(0.025, 0.024, 0.0025);
  piGroup.add(microUsbPwr);

  // MIPI CSI-2 ZIF ribbon connector
  const piCsiConn = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.004, 0.0055), mat.jstWhite);
  piCsiConn.position.set(-0.002, -0.021, 0.0036);
  piGroup.add(piCsiConn);

  // Status LEDs (PWR red, ACT blinking green)
  const piPwrLedMat = new THREE.MeshStandardMaterial({
    color: 0xff2b2b,
    emissive: 0xff1e1e,
    emissiveIntensity: 1.6
  });
  const piPwrLed = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.0014), piPwrLedMat);
  piPwrLed.position.set(0.022, 0.036, 0.0016);
  piGroup.add(piPwrLed);

  const piActLedMat = new THREE.MeshStandardMaterial({
    color: 0x22ff66,
    emissive: 0x10ee55,
    emissiveIntensity: 1.4
  });
  const piActLed = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.0014), piActLedMat);
  piActLed.position.set(0.018, 0.036, 0.0016);
  piGroup.add(piActLed);

  // --- SD1: 32GB microSD card inserted in underside slot (tagged individually BEFORE U1!) ---
  const sdCardGroup = new THREE.Group();
  sdCardGroup.position.set(0, 0.041, -0.0025);

  const sdSlotCage = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.0022), mat.metalSilver);
  sdSlotCage.position.set(0, -0.004, 0);
  sdCardGroup.add(sdSlotCage);

  const sdTex = createCanvasTex(96, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1f232a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d62828';
    ctx.fillRect(0, 0, w, 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('32GB', w * 0.5, 38);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '14px monospace';
    ctx.fillText('uSD', w * 0.5, 92);
  });
  const sdCardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.011, 0.015, 0.0012),
    new THREE.MeshStandardMaterial({ map: sdTex, roughness: 0.4 })
  );
  sdCardMesh.position.set(0, 0.003, 0);
  sdCardGroup.add(sdCardMesh);

  tagComponentInfo(sdCardGroup, componentCatalog.SD1);
  piGroup.add(sdCardGroup);

  tagComponentInfo(piGroup, componentCatalog.U1);
  internalsGroup.add(piGroup);

  // --- TB1: Modular Screw Terminal Distribution Blocks (Center: x=+0.012, y=+0.008) ---
  const tbGroup = new THREE.Group();
  tbGroup.position.set(0.012, 0.008, -0.039);

  [
    { y: 0.010, col: 0x3b82f6, label: '+5.1V / GND' },
    { y: -0.010, col: 0x64748b, label: '+12V / BUS' }
  ].forEach((blk) => {
    const blockBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.011, 0.009),
      new THREE.MeshStandardMaterial({ color: blk.col, roughness: 0.45 })
    );
    blockBody.position.set(0, blk.y, 0.004);
    blockBody.castShadow = true;
    tbGroup.add(blockBody);

    for (let s = 0; s < 4; s++) {
      const screw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0018, 0.0018, 0.002, 10),
        mat.metalSilver
      );
      screw.rotation.x = Math.PI * 0.5;
      screw.position.set(-0.009 + s * 0.006, blk.y, 0.009);
      tbGroup.add(screw);
    }
  });

  tagComponentInfo(tbGroup, componentCatalog.TB1);
  internalsGroup.add(tbGroup);

  // --- INTERNAL WIRING HARNESSES (Matching Schematic & Color Spec) ---
  const internalPulseDefs = [];
  const wireHarnessGroup = new THREE.Group();

  const addInternalBusWire = (id, name, kind, colorHex, pts, radius = 0.0011, speed = 0.45) => {
    const { mesh, curve } = createWireMesh(pts, radius, colorHex);
    wireHarnessGroup.add(mesh);
    internalPulseDefs.push({ id, name, kind, color: colorHex, curve, speed, active: true });
  };

  // Red 12V: BT1 P+ -> F1 -> PS1 IN+ & PS2 VIN+, and PS2 OUT+ -> bottom right gland (IR1)
  addInternalBusWire('bus-12v-fuse', '12V Battery -> 5A Fuse -> Converters', 'power', 0xe52424, [
    new THREE.Vector3(-0.072, 0.016, -0.006),
    new THREE.Vector3(-0.062, -0.028, -0.018),
    new THREE.Vector3(-0.095, -0.055, -0.030),
    new THREE.Vector3(-0.106, -0.072, -0.036)
  ], 0.00125, 0.55);

  addInternalBusWire('bus-12v-ps1', 'V_FUSED -> LM2596 IN+', 'power', 0xe52424, [
    new THREE.Vector3(-0.074, -0.072, -0.036),
    new THREE.Vector3(-0.056, -0.072, -0.034),
    new THREE.Vector3(-0.044, -0.062, -0.034)
  ], 0.00115, 0.5);

  addInternalBusWire('bus-12v-ps2', 'V_FUSED -> Buck-Boost VIN+', 'power', 0xe52424, [
    new THREE.Vector3(-0.068, -0.072, -0.036),
    new THREE.Vector3(-0.054, -0.088, -0.033),
    new THREE.Vector3(0.012, -0.086, -0.031),
    new THREE.Vector3(0.020, -0.066, -0.031)
  ], 0.00115, 0.5);

  addInternalBusWire('bus-12v-ir', 'Buck-Boost +12V OUT+ -> IR Gland', 'power', 0xe52424, [
    new THREE.Vector3(0.068, -0.062, -0.031),
    new THREE.Vector3(0.076, -0.086, -0.024),
    new THREE.Vector3(0.075, -0.110, -0.014)
  ], 0.00115, 0.6);

  // Orange 5.1V: PS1 OUT+ -> TB1 -> Pi 3B GPIO 2/4 (+5.1V) & TB1 -> LiDAR gland
  addInternalBusWire('bus-5v-pi', 'LM2596 +5.1V -> TB1 -> Pi 3B GPIO', 'power', 0xf5821f, [
    new THREE.Vector3(-0.004, -0.062, -0.034),
    new THREE.Vector3(-0.004, -0.028, -0.031),
    new THREE.Vector3(0.010, 0.018, -0.031),
    new THREE.Vector3(0.038, 0.032, -0.029),
    new THREE.Vector3(0.061, 0.042, -0.032)
  ], 0.00115, 0.65);

  addInternalBusWire('bus-5v-lidar', '5.1V Bus -> LiDAR Gland', 'power', 0xf5821f, [
    new THREE.Vector3(0.004, 0.018, -0.031),
    new THREE.Vector3(-0.042, -0.012, -0.028),
    new THREE.Vector3(-0.075, -0.110, -0.014)
  ], 0.0010, 0.55);

  // Yellow 3.3V: Pi 3B Pin 1 -> DS3231 VCC
  addInternalBusWire('bus-3v3-rtc', 'Pi 3.3V -> DS3231 RTC VCC', 'power', 0xf2c922, [
    new THREE.Vector3(0.061, 0.045, -0.032),
    new THREE.Vector3(0.042, 0.056, -0.031),
    new THREE.Vector3(0.014, 0.063, -0.035)
  ], 0.0009, 0.45);

  // Black GND: BT1 P- -> TB1 GND -> PS1/PS2/Pi/RTC/Glands
  addInternalBusWire('bus-gnd-main', 'System Ground Return Bus (GND)', 'power', 0x1d2128, [
    new THREE.Vector3(-0.112, 0.016, -0.006),
    new THREE.Vector3(-0.048, 0.004, -0.030),
    new THREE.Vector3(0.006, -0.002, -0.031),
    new THREE.Vector3(0.061, 0.038, -0.032)
  ], 0.0012, 0.4);

  const { mesh: gndBranch1 } = createWireMesh([
    new THREE.Vector3(0.006, -0.002, -0.031),
    new THREE.Vector3(-0.024, -0.045, -0.033),
    new THREE.Vector3(-0.042, -0.072, -0.034)
  ], 0.0010, 0x1d2128);
  wireHarnessGroup.add(gndBranch1);

  const { mesh: gndBranch2 } = createWireMesh([
    new THREE.Vector3(0.006, -0.002, -0.031),
    new THREE.Vector3(0.020, -0.045, -0.032),
    new THREE.Vector3(0.068, -0.070, -0.030),
    new THREE.Vector3(0.075, -0.110, -0.014)
  ], 0.0010, 0x1d2128);
  wireHarnessGroup.add(gndBranch2);

  // Blue & Green UART TX/RX: Pi GPIO14/15 <-> Left LiDAR gland
  addInternalBusWire('bus-uart-rx', 'TF-Luna TX -> Pi GPIO15 RXD', 'uart', 0x2488ff, [
    new THREE.Vector3(-0.075, -0.110, -0.014),
    new THREE.Vector3(-0.050, -0.032, -0.024),
    new THREE.Vector3(0.026, 0.014, -0.026),
    new THREE.Vector3(0.061, 0.028, -0.032)
  ], 0.0009, 0.85);

  addInternalBusWire('bus-uart-tx', 'Pi GPIO14 TXD -> TF-Luna RX', 'uart', 0x1ec95b, [
    new THREE.Vector3(0.061, 0.031, -0.032),
    new THREE.Vector3(0.022, 0.010, -0.026),
    new THREE.Vector3(-0.054, -0.036, -0.024),
    new THREE.Vector3(-0.073, -0.110, -0.014)
  ], 0.0009, 0.75);

  // Cyan & Purple I2C SDA/SCL: DS3231 <-> Pi GPIO2/3
  addInternalBusWire('bus-i2c-sda', 'DS3231 I2C SDA <-> Pi GPIO2', 'i2c', 0x00d4e6, [
    new THREE.Vector3(0.018, 0.063, -0.035),
    new THREE.Vector3(0.044, 0.052, -0.029),
    new THREE.Vector3(0.061, 0.040, -0.032)
  ], 0.00085, 0.65);

  addInternalBusWire('bus-i2c-scl', 'DS3231 I2C SCL <-> Pi GPIO3', 'i2c', 0xa84dff, [
    new THREE.Vector3(0.022, 0.063, -0.035),
    new THREE.Vector3(0.046, 0.048, -0.029),
    new THREE.Vector3(0.061, 0.036, -0.032)
  ], 0.00085, 0.65);

  // USB 2.0 Cable: SATA SSD -> Pi USB 2.0
  addInternalBusWire('bus-usb-ssd', 'Pi USB 2.0 <-> 2.5" SATA SSD', 'usb', 0x475569, [
    new THREE.Vector3(-0.002, 0.048, -0.038),
    new THREE.Vector3(0.036, 0.018, -0.022),
    new THREE.Vector3(0.054, -0.022, -0.022),
    new THREE.Vector3(0.070, -0.012, -0.028)
  ], 0.0016, 0.75);

  // Internal White MIPI CSI-2 Ribbon: Camera gland (x=0, y=-0.110) -> Pi CSI port
  const { mesh: internalCsiMesh, curve: internalCsiCurve } = createFlatRibbonMesh(
    [
      new THREE.Vector3(0.000, -0.110, -0.014),
      new THREE.Vector3(0.014, -0.058, -0.022),
      new THREE.Vector3(0.062, -0.018, -0.028),
      new THREE.Vector3(0.084, 0.003, -0.034)
    ],
    0.0145,
    0.0005,
    csiRibbonMat
  );
  wireHarnessGroup.add(internalCsiMesh);
  internalPulseDefs.push({
    id: 'bus-csi-internal',
    name: 'MIPI CSI-2 Video Frame Stream',
    kind: 'csi',
    color: 0xff3b6b,
    curve: internalCsiCurve,
    speed: 0.9,
    active: true
  });

  tagComponentInfo(wireHarnessGroup, componentCatalog.TB1);
  internalsGroup.add(wireHarnessGroup);

  // Internal glowing pulse spheres attached inside controlBoxGroup
  const internalPulses = internalPulseDefs.map((def, idx) => {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.0031, 10, 10),
      new THREE.MeshBasicMaterial({ color: def.color })
    );
    controlBoxGroup.add(sphere);
    return { ...def, mesh: sphere, phase: (idx * 0.19) % 1 };
  });

  controlBoxGroup.add(internalsGroup);

  // =========================================================================
  // 4) STANDALONE WI-FI ROUTER / ACCESS POINT (routerGroup) + CLOUD BEACON
  // =========================================================================
  const routerGroup = new THREE.Group();
  routerGroup.name = 'routerGroup';
  // Sensible default lab bench position (only auto-updated if main.js does not override)
  const defaultLabRouterPos = new THREE.Vector3(0.57, 0.018, -0.05);
  const defaultRiverRouterPos = new THREE.Vector3(0.99, 5.35, -0.45);
  routerGroup.position.copy(defaultLabRouterPos);
  let lastAutoRouterPos = defaultLabRouterPos.clone();

  const routerBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.026, 0.096), mat.metalDark);
  routerBody.castShadow = true;
  routerBody.receiveShadow = true;
  routerGroup.add(routerBody);

  const routerTex = createCanvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#e8edf2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('2.4 GHz Wi-Fi AP', 22, 54);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('FIELD TELEMETRY GATEWAY', 22, 86);
    ctx.fillStyle = '#64748b';
    ctx.font = '14px monospace';
    ctx.fillText('SEPARATELY POWERED', 22, 124);
  });
  const routerTopPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.124, 0.080),
    new THREE.MeshStandardMaterial({ map: routerTex, roughness: 0.4 })
  );
  routerTopPlate.rotation.x = -Math.PI * 0.5;
  routerTopPlate.position.y = 0.0135;
  routerGroup.add(routerTopPlate);

  // Rubber feet
  [
    [-0.055, -0.036],
    [0.055, -0.036],
    [-0.055, 0.036],
    [0.055, 0.036]
  ].forEach(([fx, fz]) => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 10), mat.icBlack);
    foot.position.set(fx, -0.015, fz);
    routerGroup.add(foot);
  });

  // 2 articulated black SMA dipole antennas
  [-0.052, 0.052].forEach((ax, i) => {
    const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.012, 12), mat.goldPin);
    antBase.position.set(ax, 0.012, -0.044);
    routerGroup.add(antBase);

    const antMast = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0048, 0.135, 12), mat.icBlack);
    antMast.position.set(ax + (i === 0 ? -0.012 : 0.012), 0.082, -0.048);
    antMast.rotation.z = i === 0 ? 0.16 : -0.16;
    antMast.castShadow = true;
    routerGroup.add(antMast);
  });

  // Front LED bar: PWR (green), WLAN (blinking cyan), CLOUD (emerald or amber/red offline)
  const routerPwrLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.003, 0.002),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.5 })
  );
  routerPwrLed.position.set(-0.040, 0.002, 0.0485);
  routerGroup.add(routerPwrLed);

  const routerWlanLedMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.5
  });
  const routerWlanLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.003, 0.002), routerWlanLedMat);
  routerWlanLed.position.set(-0.022, 0.002, 0.0485);
  routerGroup.add(routerWlanLed);

  const routerCloudLedMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.5
  });
  const routerCloudLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.003, 0.002), routerCloudLedMat);
  routerCloudLed.position.set(-0.004, 0.002, 0.0485);
  routerGroup.add(routerCloudLed);

  const wifiAnchor = new THREE.Object3D();
  wifiAnchor.position.set(0, 0.115, -0.020);
  routerGroup.add(wifiAnchor);
  routerGroup.userData.wifiAnchor = wifiAnchor;

  tagComponentInfo(routerGroup, componentCatalog.AP1);
  group.add(routerGroup);

  // Subtle Cloud Uplink Gateway Beacon hovering above router
  const cloudBeacon = new THREE.Group();
  cloudBeacon.name = 'cloudUplinkBeacon';
  const cloudRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.72
  });
  const cloudRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.0035, 10, 28), cloudRingMat);
  cloudRing.rotation.x = Math.PI * 0.5;
  cloudBeacon.add(cloudRing);

  const cloudCoreMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    wireframe: true,
    transparent: true,
    opacity: 0.6
  });
  const cloudCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 1), cloudCoreMat);
  cloudBeacon.add(cloudCore);

  const cloudLabelTex = createCanvasTex(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12, 22, 36, 0.82)';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLOUD FASTAPI + DB', w * 0.5, 40);
  });
  const cloudSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: cloudLabelTex, transparent: true })
  );
  cloudSprite.scale.set(0.24, 0.06, 1);
  cloudSprite.position.y = 0.058;
  cloudBeacon.add(cloudSprite);
  group.add(cloudBeacon);

  // =========================================================================
  // 5) EXTERNAL UMBILICAL CABLES & WIRELESS ARCS + PULSES (in hardwareRig.group)
  // =========================================================================
  const umbilicalMatBlack = new THREE.MeshStandardMaterial({
    color: 0x1a1e24,
    roughness: 0.65,
    metalness: 0.08
  });
  const umbilicalMatWhite = new THREE.MeshStandardMaterial({
    color: 0xe6ecf2,
    roughness: 0.42,
    metalness: 0.08
  });

  const wifiArcMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65
  });
  const cloudArcMat = new THREE.LineBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.68
  });

  const externalLinks = [
    {
      id: 'ext-lidar',
      name: 'Control Box <-> TF-Luna LiDAR Umbilical (5.1V + UART)',
      kind: 'uart',
      color: 0x22ff88,
      speed: 0.72,
      buildTube: true,
      tubeRadius: 0.0042,
      tubeMat: umbilicalMatBlack,
      tubeMesh: null,
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)]),
      pulses: []
    },
    {
      id: 'ext-camera',
      name: 'Control Box <-> NoIR Camera MIPI CSI-2 Loom',
      kind: 'csi',
      color: 0xff3b6b,
      speed: 0.85,
      buildTube: true,
      tubeRadius: 0.0046,
      tubeMat: umbilicalMatWhite,
      tubeMesh: null,
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)]),
      pulses: []
    },
    {
      id: 'ext-ir',
      name: 'Control Box PS2 -> 850nm IR Illuminator (+12V)',
      kind: 'power',
      color: 0xff2233,
      speed: 0.62,
      buildTube: true,
      tubeRadius: 0.0036,
      tubeMat: umbilicalMatBlack,
      tubeMesh: null,
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)]),
      pulses: []
    },
    {
      id: 'wireless-pi-router',
      name: '2.4 GHz WLAN Telemetry Link (Pi 3B -> Wi-Fi Router)',
      kind: 'wifi',
      color: 0x38bdf8,
      speed: 0.75,
      buildTube: false,
      lineMesh: new THREE.Line(new THREE.BufferGeometry(), wifiArcMat),
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)]),
      pulses: []
    },
    {
      id: 'wireless-router-cloud',
      name: 'Cloud Telemetry & Video Uplink (Router -> FastAPI/PostgreSQL)',
      kind: 'cloud',
      color: 0x10b981,
      speed: 0.68,
      buildTube: false,
      lineMesh: new THREE.Line(new THREE.BufferGeometry(), cloudArcMat),
      curve: new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0)]),
      pulses: []
    }
  ];

  // Create 2 animated glowing pulse spheres per external link
  externalLinks.forEach((link) => {
    if (link.lineMesh) group.add(link.lineMesh);
    for (let k = 0; k < 2; k++) {
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 10, 10),
        new THREE.MeshBasicMaterial({ color: link.color })
      );
      group.add(pMesh);
      link.pulses.push({ mesh: pMesh, phase: k * 0.5 });
    }
  });

  // Expose unified packetPaths array
  const packetPaths = [
    ...internalPulseDefs,
    ...externalLinks.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      color: l.color,
      curve: l.curve,
      speed: l.speed,
      active: true
    }))
  ];

  let lastSignature = '';
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpPi = new THREE.Vector3();
  const tmpRouter = new THREE.Vector3();
  const tmpCloud = new THREE.Vector3();

  function getLocalFromAnchor(anchorObj, outVec) {
    anchorObj.getWorldPosition(outVec);
    group.worldToLocal(outVec);
    return outVec;
  }

  function rebuildExternalGeometry(modeScale, mountMode = 'bridge', boomTopY = 6.00) {
    const gA = controlBoxGroup.userData.glandAnchors;
    if (!gA) return;

    const cLidar = getLocalFromAnchor(gA.lidar, new THREE.Vector3());
    const pLidar = getLocalFromAnchor(lidarPodGroup.userData.glandAnchor, new THREE.Vector3());

    const cCam = getLocalFromAnchor(gA.camera, new THREE.Vector3());
    const pCam = getLocalFromAnchor(cameraPodGroup.userData.glandAnchor, new THREE.Vector3());

    const cIr = getLocalFromAnchor(gA.ir, new THREE.Vector3());
    const pIr = getLocalFromAnchor(irIlluminatorGroup.userData.glandAnchor, new THREE.Vector3());

    getLocalFromAnchor(piGroup, tmpPi);
    getLocalFromAnchor(wifiAnchor, tmpRouter);
    tmpCloud.copy(tmpRouter).add(new THREE.Vector3(0, 0.38 * modeScale, 0));
    cloudBeacon.position.copy(tmpCloud);
    cloudBeacon.scale.setScalar(modeScale);

    const modeTag = mountMode === 'lab_pole' ? 'LP' : mountMode === 'side_pole' ? 'SP' : 'BR';

    // Check if positions changed enough to warrant geometry rebuild
    const sig = [
      cLidar.x.toFixed(3), cLidar.y.toFixed(3), pLidar.x.toFixed(3), pLidar.y.toFixed(3),
      pCam.x.toFixed(3), pCam.y.toFixed(3), pIr.x.toFixed(3), pIr.y.toFixed(3),
      tmpRouter.x.toFixed(3), tmpRouter.y.toFixed(3), tmpRouter.z.toFixed(3),
      modeScale.toFixed(2), modeTag, boomTopY.toFixed(2)
    ].join('|');

    if (sig === lastSignature) return;
    lastSignature = sig;

    const makeSwoopCurve = (start, end, dropY, backZ) => {
      const mid1 = start.clone().lerp(end, 0.28);
      mid1.y -= dropY;
      mid1.z += backZ * 0.4;
      const mid2 = start.clone().lerp(end, 0.72);
      mid2.y -= dropY * 0.35;
      mid2.z += backZ * 0.2;
      return new THREE.CatmullRomCurve3([start.clone(), mid1, mid2, end.clone()]);
    };

    const makeSidePoleBoomCurve = (start, end, offsetX) => {
      const drip = new THREE.Vector3(start.x, start.y - 0.08, start.z - 0.04);
      const mastMid = new THREE.Vector3(2.10 + offsetX, boomTopY - 0.45, -8.38);
      const boomBase = new THREE.Vector3(2.10 + offsetX, boomTopY + 0.02, -8.35);
      const boomMid = new THREE.Vector3(2.10 + offsetX, boomTopY + 0.01, -6.90);
      const boomEnd = new THREE.Vector3(end.x, boomTopY - 0.02, -5.65);
      return new THREE.CatmullRomCurve3([start.clone(), drip, mastMid, boomBase, boomMid, boomEnd, end.clone()]);
    };

    const makeLabPoleBoomCurve = (start, end, offsetX) => {
      const drip = new THREE.Vector3(start.x, start.y - 0.14, start.z - 0.05);
      const mastTop = new THREE.Vector3(2.05 + offsetX, 7.80, -6.72);
      const boomMid = new THREE.Vector3(2.05 + offsetX, 7.82, -5.95);
      const railTop = new THREE.Vector3(end.x, 7.78, -5.38);
      const railDrop = new THREE.Vector3(end.x, 0.5 * (7.78 + end.y), -5.36);
      return new THREE.CatmullRomCurve3([start.clone(), drip, mastTop, boomMid, railTop, railDrop, end.clone()]);
    };

    const pickCurve = (start, end, offsetX, dropY, backZ) => {
      if (mountMode === 'lab_pole') return makeLabPoleBoomCurve(start, end, offsetX);
      if (mountMode === 'side_pole') return makeSidePoleBoomCurve(start, end, offsetX);
      return makeSwoopCurve(start, end, dropY * modeScale, backZ * modeScale);
    };

    const routeMap = {
      'ext-lidar': pickCurve(cLidar, pLidar, 0.0, 0.045, -0.02),
      'ext-camera': pickCurve(cCam, pCam, -0.05, 0.035, -0.025),
      'ext-ir': pickCurve(cIr, pIr, 0.05, 0.035, -0.02),
      'wireless-pi-router': new THREE.CatmullRomCurve3([
        tmpPi.clone(),
        tmpPi.clone().lerp(tmpRouter, 0.5).add(new THREE.Vector3(0, 0.14 * modeScale, 0.04 * modeScale)),
        tmpRouter.clone()
      ]),
      'wireless-router-cloud': new THREE.CatmullRomCurve3([
        tmpRouter.clone(),
        tmpRouter.clone().lerp(tmpCloud, 0.5).add(new THREE.Vector3(0.03 * modeScale, 0, 0.02 * modeScale)),
        tmpCloud.clone()
      ])
    };

    externalLinks.forEach((link) => {
      const newCurve = routeMap[link.id];
      if (!newCurve) return;
      link.curve = newCurve;

      const exportedPath = packetPaths.find((p) => p.id === link.id);
      if (exportedPath) exportedPath.curve = newCurve;

      if (link.buildTube) {
        if (link.tubeMesh) {
          link.tubeMesh.geometry.dispose();
          group.remove(link.tubeMesh);
        }
        const tGeo = new THREE.TubeGeometry(newCurve, 28, link.tubeRadius * Math.min(2.2, modeScale * 0.6 + 0.4), 8, false);
        link.tubeMesh = new THREE.Mesh(tGeo, link.tubeMat);
        link.tubeMesh.castShadow = true;
        group.add(link.tubeMesh);
      } else if (link.lineMesh) {
        link.lineMesh.geometry.dispose();
        link.lineMesh.geometry = new THREE.BufferGeometry().setFromPoints(newCurve.getPoints(28));
      }
    });
  }

  // =========================================================================
  // 6) UPDATE LOOP (Animated Pulses, LEDs, Exploded Interior Offset, Links)
  // =========================================================================
  let simClock = 0;

  function update(dt = 0.016, state = {}) {
    simClock += dt;
    const isRiver = state.mode === 'river';
    const modeScale = isRiver ? 2.6 : 1.0;

    // Auto-place router only if main.js has not explicitly moved it
    if (routerGroup.position.distanceToSquared(lastAutoRouterPos) < 1e-6) {
      const targetAuto = isRiver ? defaultRiverRouterPos : defaultLabRouterPos;
      routerGroup.position.copy(targetAuto);
      lastAutoRouterPos.copy(targetAuto);
    }

    // Subtle CAD exploded spacing for internal pods
    const lidarE = lidarPodGroup.userData.explodeFactor || 0;
    tfLunaGroup.position.y = 0.011 + 0.012 * lidarE;

    const camE = cameraPodGroup.userData.explodeFactor || 0;
    camModuleGroup.position.y = 0.0145 + 0.014 * camE;

    const boxE = controlBoxGroup.userData.explodeFactor || 0;
    internalsGroup.position.z = 0.018 * boxE;

    // Refresh world matrices & rebuild umbilical/wireless routes if endpoints moved
    group.updateMatrixWorld(true);
    controlBoxGroup.updateMatrixWorld(true);
    lidarPodGroup.updateMatrixWorld(true);
    cameraPodGroup.updateMatrixWorld(true);
    irIlluminatorGroup.updateMatrixWorld(true);
    routerGroup.updateMatrixWorld(true);

    const mountMode = !isRiver
      ? 'bridge'
      : state.riverMountMode === 'lab_pole'
        ? 'lab_pole'
        : state.riverMountMode === 'side_pole'
          ? 'side_pole'
          : 'bridge';
    const boomTopY = Number(state.sidePoleHeightM ?? 6.00);
    rebuildExternalGeometry(modeScale, mountMode, Number.isFinite(boomTopY) ? boomTopY : 6.00);

    const pipelineOn = state.pipelineActive !== false;
    const wifiOn = state.wifiOnline !== false;
    const nightOn = Boolean(state.nightMode);
    const powerOn = state.powerOn !== false;

    // Animate Raspberry Pi & Router activity LEDs
    const actBlink = pipelineOn && Math.sin(simClock * 18) > 0.15 ? 1.8 : 0.2;
    piActLedMat.emissiveIntensity = powerOn ? actBlink : 0;
    piPwrLedMat.emissiveIntensity = powerOn ? 1.6 : 0;
    ps1LedMat.emissiveIntensity = powerOn ? 1.5 : 0;
    ps2LedMat.emissiveIntensity = powerOn && nightOn ? 1.8 : (powerOn ? 0.6 : 0);

    if (wifiOn) {
      routerWlanLedMat.emissive.setHex(0x38bdf8);
      routerWlanLedMat.emissiveIntensity = pipelineOn && Math.sin(simClock * 14) > 0 ? 2.0 : 0.7;
      routerCloudLedMat.emissive.setHex(0x10b981);
      routerCloudLedMat.emissiveIntensity = pipelineOn ? 1.8 : 0.8;
      wifiArcMat.color.setHex(0x38bdf8);
      wifiArcMat.opacity = pipelineOn ? 0.65 : 0.22;
      cloudArcMat.color.setHex(0x10b981);
      cloudArcMat.opacity = pipelineOn ? 0.68 : 0.22;
      cloudRingMat.color.setHex(0x38bdf8);
      cloudRingMat.opacity = pipelineOn ? 0.72 : 0.3;
      cloudCoreMat.color.setHex(0x7dd3fc);
      cloudCore.rotation.y += dt * 0.9;
    } else {
      // Offline outage state: amber/red cloud alert LED + dimmed offline wireless arc
      routerWlanLedMat.emissive.setHex(0x38bdf8);
      routerWlanLedMat.emissiveIntensity = 0.4;
      routerCloudLedMat.emissive.setHex(0xef4444);
      routerCloudLedMat.emissiveIntensity = Math.sin(simClock * 6) > 0 ? 1.9 : 0.25;
      wifiArcMat.color.setHex(0xf59e0b);
      wifiArcMat.opacity = 0.18;
      cloudArcMat.color.setHex(0xef4444);
      cloudArcMat.opacity = 0.18;
      cloudRingMat.color.setHex(0xef4444);
      cloudRingMat.opacity = 0.28;
      cloudCoreMat.color.setHex(0xf87171);
    }

    // Animate internal CatmullRomCurve3 pulses inside controlBoxGroup
    internalPulses.forEach((p) => {
      let active = powerOn;
      let speedMul = 1.0;

      if (p.id === 'bus-12v-ir') {
        active = powerOn && nightOn;
      } else if (p.kind === 'uart' || p.kind === 'i2c' || p.kind === 'csi') {
        active = powerOn && pipelineOn;
      } else if (p.id === 'bus-usb-ssd') {
        // SSD local SQLite buffering pulses faster during Wi-Fi outage!
        active = powerOn && pipelineOn;
        speedMul = wifiOn ? 0.85 : 1.75;
      }

      p.active = active;
      p.mesh.visible = active;
      if (active) {
        p.phase = (p.phase + dt * p.speed * speedMul) % 1;
        p.curve.getPointAt(p.phase, tmpA);
        p.mesh.position.copy(tmpA);
      }
      const exported = packetPaths.find((item) => item.id === p.id);
      if (exported) exported.active = active;
    });

    // Animate external umbilical & Wi-Fi -> Cloud pulse spheres
    externalLinks.forEach((link) => {
      let active = powerOn && pipelineOn;
      if (link.id === 'ext-ir') {
        active = powerOn && nightOn;
      } else if (link.kind === 'wifi' || link.kind === 'cloud') {
        active = powerOn && pipelineOn && wifiOn;
      }

      const exported = packetPaths.find((item) => item.id === link.id);
      if (exported) exported.active = active;

      const pulseScale = link.kind === 'wifi' || link.kind === 'cloud'
        ? 0.0085 * modeScale
        : 0.0055 * (isRiver ? 1.8 : 1.0);

      link.pulses.forEach((pulse) => {
        pulse.mesh.visible = active;
        if (active && link.curve) {
          pulse.phase = (pulse.phase + dt * link.speed) % 1;
          link.curve.getPointAt(pulse.phase, tmpB);
          pulse.mesh.position.copy(tmpB);
          pulse.mesh.scale.setScalar(pulseScale / 0.006);
        }
      });
    });
  }

  function getComponentMetadata() {
    return Object.values(componentCatalog);
  }

  return {
    group,
    routerGroup,
    packetPaths,
    getComponentMetadata,
    update
  };
}

  return { createHardwareRig };
})(THREE, RiverSimModules.enclosures);

/* === MODULE: src/sim/hydraulics.js === */
RiverSimModules.hydraulics = (function () {
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
  let surfaceVelocity = 0.24;
  let turbidityMode = 'clear';
  let wavePowerSmooth = 0.25;
  let valveSmooth = 0.75;

  // Particle pool for floating foam tracers & debris
  let nextParticleId = 1;
  const particles = [];
  const PARTICLE_TYPES = ['foam', 'foam', 'foam', 'tracer', 'debris_plastic', 'leaf'];

  function spawnParticle(initialStage = 'inflow') {
    const id = nextParticleId++;
    const type = PARTICLE_TYPES[Math.floor(rng() * PARTICLE_TYPES.length)];
    const size =
      type === 'foam'
        ? 0.007 + rng() * 0.006
        : type === 'tracer'
          ? 0.008 + rng() * 0.004
          : 0.011 + rng() * 0.007;

    let x = LAB_GEOMETRY.nozzlePos.x + (rng() - 0.5) * 0.035;
    let z = clamp(LAB_GEOMETRY.nozzlePos.z + (rng() - 0.5) * 0.20, -0.145, 0.145);
    let y = yW1;
    let zone = 'step1';

    if (initialStage === 'distributed') {
      const pick = rng();
      if (pick < 0.34) {
        x = -0.25 + rng() * 0.15;
        y = yW1;
        zone = 'step1';
      } else if (pick < 0.64) {
        x = -0.06 + rng() * 0.15;
        y = yW2;
        zone = 'step2';
      } else if (pick < 0.88) {
        x = 0.13 + rng() * 0.15;
        y = yW3;
        zone = 'step3';
      } else {
        x = 0.33 + rng() * 0.11;
        y = yBasin;
        zone = 'basin';
      }
      z = (rng() - 0.5) * 0.26;
    }

    return {
      id,
      type,
      size,
      x,
      y,
      z,
      vx: 0.16 + rng() * 0.06,
      vy: 0,
      vz: (rng() - 0.5) * 0.03,
      rotY: rng() * Math.PI * 2,
      rotZ: (rng() - 0.5) * 0.25,
      phase: rng() * Math.PI * 2,
      age: 0,
      zone, // 'step1' | 'fall1' | 'step2' | 'fall2' | 'step3' | 'fall3' | 'basin' | 'return'
      basinTime: 0,
      inFov: true,
    };
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
      baseY = yHeadbox;
      localRippleScale = 0.45 * flowNorm;
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

  function updateParticles(dt, pumpActive, targetCount) {
    // Adjust particle count toward target
    const desired = Math.round(clamp(targetCount, 0, 15));
    while (particles.length < desired) {
      // Stagger spawns near inflow if pump active, otherwise distribute
      const p = spawnParticle(particles.length < 2 && pumpActive ? 'inflow' : 'distributed');
      p.x += (rng() - 0.5) * 0.025;
      particles.push(p);
    }
    if (particles.length > desired) {
      particles.length = desired;
    }

    const flowScale = clamp(qInflow / 0.00118, 0, 1.65);
    const waveDrift = wavePowerSmooth * 0.08;
    const baseCascadeSpeed = (0.175 + 0.095 * flowScale + waveDrift) * (qInflow > 1e-5 ? 1 : 0.08);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age += dt;

      // Subtle lateral wave-maker circulation & turbulence
      const swirlZ =
        Math.sin(simTime * 2.3 + p.phase + p.x * 11.0) * (0.025 + 0.055 * wavePowerSmooth) * flowScale;

      if (p.zone === 'step1') {
        const surfSpeed = baseCascadeSpeed * (0.95 + 0.25 * Math.exp(-Math.abs(p.x - LAB_GEOMETRY.nozzlePos.x) * 14));
        p.vx += (surfSpeed - p.vx) * Math.min(1, dt * 6);
        p.vz += (swirlZ - p.vz) * Math.min(1, dt * 4);
        p.x += p.vx * dt;
        p.z = clamp(p.z + p.vz * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.y = sampleSurface(p.x, p.z) + p.size * 0.15;
        p.vy = 0;
        p.rotY += (p.vx * 1.4 + p.vz * 2.5) * dt;

        if (p.x >= LAB_GEOMETRY.step1.xMax && qWeir1 > 1e-5) {
          p.zone = 'fall1';
          p.vx = Math.max(0.18, p.vx * 1.15);
          p.vy = -0.05;
        } else if (p.x >= LAB_GEOMETRY.step1.xMax - 0.01) {
          p.x = LAB_GEOMETRY.step1.xMax - 0.01;
          p.vx *= -0.2;
        }
      } else if (p.zone === 'fall1') {
        p.vy -= G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z = clamp(p.z + p.vz * 0.5 * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.rotZ -= 2.2 * dt;
        if (p.y <= yW2) {
          p.y = yW2;
          p.vy = 0;
          p.rotZ = 0;
          p.zone = 'step2';
        }
      } else if (p.zone === 'step2') {
        const surfSpeed = baseCascadeSpeed * 1.05;
        p.vx += (surfSpeed - p.vx) * Math.min(1, dt * 6);
        p.vz += (swirlZ - p.vz) * Math.min(1, dt * 4);
        p.x += p.vx * dt;
        p.z = clamp(p.z + p.vz * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.y = sampleSurface(p.x, p.z) + p.size * 0.15;
        p.vy = 0;
        p.rotY += (p.vx * 1.5 - p.vz * 2.0) * dt;

        if (p.x >= LAB_GEOMETRY.step2.xMax && qWeir2 > 1e-5) {
          p.zone = 'fall2';
          p.vx = Math.max(0.19, p.vx * 1.15);
          p.vy = -0.05;
        } else if (p.x >= LAB_GEOMETRY.step2.xMax - 0.01) {
          p.x = LAB_GEOMETRY.step2.xMax - 0.01;
          p.vx *= -0.2;
        }
      } else if (p.zone === 'fall2') {
        p.vy -= G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z = clamp(p.z + p.vz * 0.5 * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.rotZ -= 2.4 * dt;
        if (p.y <= yW3) {
          p.y = yW3;
          p.vy = 0;
          p.rotZ = 0;
          p.zone = 'step3';
        }
      } else if (p.zone === 'step3') {
        const surfSpeed = baseCascadeSpeed * 1.1;
        p.vx += (surfSpeed - p.vx) * Math.min(1, dt * 6);
        p.vz += (swirlZ - p.vz) * Math.min(1, dt * 4);
        p.x += p.vx * dt;
        p.z = clamp(p.z + p.vz * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.y = sampleSurface(p.x, p.z) + p.size * 0.15;
        p.vy = 0;
        p.rotY += (p.vx * 1.6 + p.vz * 2.2) * dt;

        if (p.x >= LAB_GEOMETRY.step3.xMax && qWeir3 > 1e-5) {
          p.zone = 'fall3';
          p.vx = Math.max(0.20, p.vx * 1.15);
          p.vy = -0.05;
        } else if (p.x >= LAB_GEOMETRY.step3.xMax - 0.01) {
          p.x = LAB_GEOMETRY.step3.xMax - 0.01;
          p.vx *= -0.2;
        }
      } else if (p.zone === 'fall3') {
        p.vy -= G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z = clamp(p.z + p.vz * 0.5 * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.rotZ -= 2.5 * dt;
        if (p.y <= yBasin) {
          p.y = yBasin;
          p.vy = 0;
          p.rotZ = 0;
          p.zone = 'basin';
          p.basinTime = 0;
        }
      } else if (p.zone === 'basin') {
        p.basinTime += dt;
        // Swirl gently in right basin, then dive into under-shelf return channel when pump active
        const targetZ = Math.sin(p.basinTime * 2.2 + p.phase) * 0.11;
        const targetX = 0.385 + Math.cos(p.basinTime * 1.7 + p.phase) * 0.055;
        p.vx = (targetX - p.x) * 2.2;
        p.vz = (targetZ - p.z) * 2.2;
        p.x = clamp(p.x + p.vx * dt, LAB_GEOMETRY.basin.xMin + 0.012, LAB_GEOMETRY.basin.xMax - 0.015);
        p.z = clamp(p.z + p.vz * dt, LAB_GEOMETRY.tankZMin + 0.015, LAB_GEOMETRY.tankZMax - 0.015);
        p.y = sampleSurface(p.x, p.z) + p.size * 0.12;
        p.rotY += 1.4 * dt;

        if (pumpActive && qReturn > 1e-4 && p.basinTime > 1.4) {
          p.zone = 'return';
          p.x = 0.305;
          p.y = 0.052;
          p.vx = -Math.max(0.14, returnVelocity * 3.0);
        }
      } else if (p.zone === 'return') {
        // Travel leftward (-X) inside the under-shelf return channel (y in [0.02, 0.075])
        const targetRetSpeed = pumpActive ? -Math.max(0.16, returnVelocity * 3.4) : -0.01;
        p.vx += (targetRetSpeed - p.vx) * Math.min(1, dt * 5);
        p.x += p.vx * dt;
        p.y += (0.048 - p.y) * Math.min(1, dt * 5);
        p.vz = Math.sin(simTime * 3.0 + p.phase) * 0.015;
        p.z = clamp(p.z + p.vz * dt, LAB_GEOMETRY.tankZMin + 0.02, LAB_GEOMETRY.tankZMax - 0.02);

        // Sucked into submersible pump at x ~ -0.38 -> recirculated out nozzle into Step 1!
        if (p.x <= -0.37 && pumpActive && riserFill >= 0.85) {
          p.zone = 'step1';
          p.x = LAB_GEOMETRY.nozzlePos.x + (rng() - 0.5) * 0.025;
          p.z = clamp(LAB_GEOMETRY.nozzlePos.z + (rng() - 0.5) * 0.16, -0.14, 0.14);
          p.y = yW1 + 0.005;
          p.vx = 0.16 + rng() * 0.05;
          p.vy = 0;
          p.rotZ = 0;
        } else if (p.x < -0.45) {
          p.x = -0.45;
          p.vx = 0;
        }
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

      const qPumpDraw = pumpActive && hasHeadboxWater ? qInflow * 0.92 + qPumpTarget * 0.08 : 0;
      yBasin = clamp(yBasin + ((qWeir3 - qReturn) / A_BASIN) * hDt, 0.04, 0.28);
      yHeadbox = clamp(yHeadbox + ((qReturn - qPumpDraw) / A_HEADBOX) * hDt, 0.035, 0.48);

      // Headbox top overflow notch into Step 1 if headbox ever exceeds y=0.45
      if (yHeadbox > 0.45) {
        const qNotch = weirDischarge(yHeadbox, 0.45) * 0.4;
        yHeadbox -= (qNotch / A_HEADBOX) * hDt;
        yW1 += (qNotch / A_STEP1) * hDt;
      }
    }

    returnVelocity = qReturn / A_RETURN;
    const flowNorm = clamp(qInflow / 0.0012, 0, 1.6);
    rippleAmp = 0.0005 + 0.0022 * flowNorm + 0.0038 * wavePowerSmooth;

    const step1Depth = Math.max(0.015, yW1 - LAB_GEOMETRY.step1.foamY);
    const step1BulkV = qInflow / (LAB_GEOMETRY.channelWidth * step1Depth);
    // Surface flow speed reflects inlet jet + surface boundary acceleration + wave makers
    surfaceVelocity =
      (qInflow > 1e-5 ? 0.12 + step1BulkV * 1.45 + wavePowerSmooth * 0.08 : wavePowerSmooth * 0.05);

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
    reset,
  };
}

  return { LAB_GEOMETRY, createLabHydraulics };
})();

/* === MODULE: src/sim/realRiverHydraulics.js === */
RiverSimModules.realRiverHydraulics = (function () {
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
  // Skewed Pearson-like pulse peaking around u = 0.34
  let pulse = 0;
  let dPulse = 0;
  if (u < 0.06) {
    pulse = 0.02 * (u / 0.06);
    dPulse = 0.05;
  } else if (u < 0.34) {
    const s = (u - 0.06) / 0.28;
    // Smooth steep rising limb
    pulse = 0.02 + 0.98 * (s * s * (3 - 2 * s));
    dPulse = 6 * s * (1 - s);
  } else {
    const s = (u - 0.34) / 0.66;
    // Exponential recession limb
    pulse = Math.exp(-3.4 * s) * (1 - 0.18 * s);
    dPulse = -0.6 * pulse;
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

  let currentWL = 1.15;
  let manningN = 0.035;
  let channelSlope = 0.0022;
  let velocityCoeffK = 0.85;
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

  function integrateCrossSection(wl) {
    let area = 0;
    let perimeter = 0;
    let width = 0;
    let minSubZ = Z_MAX;
    let maxSubZ = Z_MIN;
    let deepMax = 0;

    // First pass: wetted area, wetted perimeter, top width with sub-cell shoreline interpolation
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

      if (d0 >= 0 && d1 >= 0) {
        area += 0.5 * (d0 + d1) * DZ;
        perimeter += Math.hypot(DZ, b1 - b0);
        width += DZ;
        if (z0 < minSubZ) minSubZ = z0;
        if (z1 > maxSubZ) maxSubZ = z1;
      } else if (d0 > 0 && d1 <= 0) {
        // Shoreline exits between z0 and z1
        const frac = d0 / (d0 - d1);
        const subDz = DZ * frac;
        const zCross = z0 + subDz;
        area += 0.5 * d0 * subDz;
        perimeter += Math.hypot(subDz, wl - b0);
        width += subDz;
        if (z0 < minSubZ) minSubZ = z0;
        if (zCross > maxSubZ) maxSubZ = zCross;
      } else {
        // Shoreline enters between z0 and z1
        const frac = d1 / (d1 - d0);
        const subDz = DZ * frac;
        const zCross = z1 - subDz;
        area += 0.5 * d1 * subDz;
        perimeter += Math.hypot(subDz, b1 - wl);
        width += subDz;
        if (zCross < minSubZ) minSubZ = zCross;
        if (z1 > maxSubZ) maxSubZ = z1;
      }
    }

    wettedArea = Math.max(0.05, area);
    wettedPerimeter = Math.max(0.2, perimeter);
    hydraulicRadius = wettedArea / wettedPerimeter;
    topWidth = Math.max(0.2, width);
    leftEdgeZ = minSubZ < maxSubZ ? minSubZ : -0.5;
    rightEdgeZ = minSubZ < maxSubZ ? maxSubZ : 0.5;
    maxDepth = Math.max(0.05, deepMax);

    // Manning's open-channel equation: V = (1/n) * R_h^(2/3) * S_0^(1/2)
    const rainBoost = 1.0 + 0.04 * rainIntensity;
    meanVelocityV =
      (1.0 / manningN) *
      Math.pow(hydraulicRadius, 2 / 3) *
      Math.pow(channelSlope, 0.5) *
      hydroRisingBoost *
      rainBoost;
    surfaceVelocityVs = meanVelocityV / velocityCoeffK;
    dischargeQ = wettedArea * meanVelocityV;

    // Compute normalization constant so depth-averaged surface profile matches Vs
    let sumWeight = 0;
    let sumRawWeighted = 0;
    let maxRaw = 0;
    for (let i = 0; i <= NUM_SLICES; i++) {
      const z = zGrid[i];
      const d = Math.max(0, wl - bedGrid[i]);
      if (d <= 0) continue;
      const raw = rawLateralShape(z, d, 0.8);
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
    const chop = 0.008 + 0.032 * windChop + 0.015 * rainIntensity;
    const wave =
      Math.sin(x * 0.9 - simTime * 2.6 + z * 0.4) * 0.55 +
      Math.cos(z * 1.4 + simTime * 2.1 - x * 0.35) * 0.45;
    return currentWL + wave * chop;
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

      // Streamline deflection around bridge pier at (x = 0, z = -4.2) when bridge is present
      if (mountMode === 'bridge') {
        const dxPier = p.x - PIER_POS.x;
        const dzPier = p.z - PIER_POS.z;
        if (Math.abs(dxPier) < 1.3 && Math.abs(dzPier) < 1.1) {
          const dist = Math.hypot(dxPier, dzPier);
          if (dist < 1.05 && dist > 1e-4) {
            const pushZ = dzPier >= 0 ? 1 : -1;
            lateralForce += pushZ * (1.05 - dist) * 1.4;
          }
        }
      }

      p.vz += (lateralForce - p.vz) * Math.min(1, dt * 3);
      p.x += p.vx * dt;
      p.z = clamp(p.z + p.vz * dt, leftEdgeZ + safeMargin, rightEdgeZ - safeMargin);
      p.y = sampleSurface(p.x, p.z) + 0.015;
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
    velocityCoeffK = clamp(
      state.velocityCoeffK !== undefined ? Number(state.velocityCoeffK) : 0.85,
      0.6,
      1.0
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
        // When preset switches, follow preset until slider moves again
        if (sliderStage !== null) lastSliderStage = sliderStage;
      } else if (sliderStage !== null && Math.abs(sliderStage - lastSliderStage) > 1e-4) {
        targetStageM = sliderStage;
        lastSliderStage = sliderStage;
      } else if (sliderStage !== null && lastPreset === preset) {
        // Keep aligned with state.riverStageM if state initialized directly to a stage
        targetStageM =
          PRESET_STAGE_M[preset] !== undefined && Math.abs(sliderStage - 1.15) < 1e-4 && preset !== 'normal'
            ? PRESET_STAGE_M[preset]
            : sliderStage;
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
      velocityCoeffK,
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
    sampleSurface,
    getBedY: bedFn,
  };
}

  return { defaultGuimbalBedHeight, createRealRiverHydraulics };
})();

/* === MODULE: src/sim/waterShader.js === */
RiverSimModules.waterShader = (function (THREE, { LAB_GEOMETRY }, { defaultGuimbalBedHeight }) {
const TURBIDITY_PALETTES = {
  clear: {
    labColor: new THREE.Color('#2794b8'),
    labDeep: new THREE.Color('#136582'),
    labOpacity: 0.44,
    riverShallow: new THREE.Color('#349ca6'),
    riverDeep: new THREE.Color('#12576b'),
    riverOpacity: 0.68,
  },
  silty: {
    labColor: new THREE.Color('#7c8762'),
    labDeep: new THREE.Color('#5a6345'),
    labOpacity: 0.72,
    riverShallow: new THREE.Color('#8a835a'),
    riverDeep: new THREE.Color('#5c593c'),
    riverOpacity: 0.86,
  },
  muddy: {
    labColor: new THREE.Color('#8c673e'),
    labDeep: new THREE.Color('#694927'),
    labOpacity: 0.9,
    riverShallow: new THREE.Color('#966f44'),
    riverDeep: new THREE.Color('#664726'),
    riverOpacity: 0.96,
  },
  dark: {
    labColor: new THREE.Color('#303638'),
    labDeep: new THREE.Color('#1c2123'),
    labOpacity: 0.88,
    riverShallow: new THREE.Color('#3b3933'),
    riverDeep: new THREE.Color('#1e1d1a'),
    riverOpacity: 0.95,
  },
};

function getPalette(mode) {
  return TURBIDITY_PALETTES[mode] || TURBIDITY_PALETTES.clear;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* -------------------------------------------------------------------------- */
/*  Custom Shaders: Lab Waterfall Cascade & Guimbal River Surface             */
/* -------------------------------------------------------------------------- */

const WATERFALL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WATERFALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFlow;
  uniform vec3 uWaterColor;
  uniform vec3 uFoamColor;
  uniform float uOpacity;
  uniform float uNightMode;
  varying vec2 vUv;
  varying vec3 vNormalW;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    if (uFlow <= 0.01) discard;
    float fallSpeed = 2.6 + uFlow * 2.4;
    // vUv.y = 1 at crest, 0 at plunge bottom
    vec2 streakUv = vec2(vUv.x * 16.0, vUv.y * 5.0 + uTime * fallSpeed);
    float s1 = vnoise(streakUv);
    float s2 = vnoise(streakUv * vec2(2.3, 1.6) + vec2(3.1, uTime * 1.4));
    float streaks = smoothstep(0.32, 0.85, s1 * 0.6 + s2 * 0.4);

    // Extra aeration foam at weir lip and plunge impact
    float crestFoam = smoothstep(0.84, 1.0, vUv.y) * 0.65;
    float plungeFoam = smoothstep(0.24, 0.0, vUv.y) * 0.85;
    float edgeFade = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);

    float foamAmt = clamp(streaks * 0.62 + crestFoam + plungeFoam, 0.0, 1.0);
    vec3 nightTint = mix(vec3(1.0), vec3(0.45, 0.55, 0.7), uNightMode);
    vec3 col = mix(uWaterColor, uFoamColor, foamAmt) * nightTint;

    float alpha = clamp((uOpacity * 0.72 + foamAmt * 0.42) * clamp(uFlow, 0.0, 1.0), 0.0, 0.95);
    alpha *= mix(0.65, 1.0, edgeFade);
    gl_FragColor = vec4(col, alpha);
  }
`;

const RIVER_VERTEX = /* glsl */ `
  attribute float aBedY;
  attribute float aFlowScroll;
  uniform float uTime;
  uniform float uWaterLevel;
  uniform float uWindChop;
  uniform float uRainIntensity;

  varying vec3 vWorldPos;
  varying float vBedY;
  varying float vFlowScroll;
  varying float vWaveH;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float depth = max(0.0, uWaterLevel - aBedY);
    float shallowDamp = smoothstep(0.0, 0.45, depth);

    float chopAmp = (0.010 + 0.036 * uWindChop + 0.015 * uRainIntensity) * shallowDamp;
    float w1 = sin(wp.x * 1.15 - uTime * 2.8 + wp.z * 0.45);
    float w2 = cos(wp.z * 1.65 + uTime * 2.2 - wp.x * 0.35);
    float w3 = sin((wp.x + wp.z) * 2.4 - uTime * 3.9);
    float disp = (w1 * 0.5 + w2 * 0.32 + w3 * 0.18) * chopAmp;

    wp.y = uWaterLevel + disp;

    vWorldPos = wp.xyz;
    vBedY = aBedY;
    vFlowScroll = aFlowScroll;
    vWaveH = disp;

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RIVER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uWaterLevel;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform float uOpacity;
  uniform float uSunGlare;
  uniform vec3 uSunDir;
  uniform float uNightMode;
  uniform float uRainIntensity;
  uniform float uWindChop;
  uniform vec2 uPierXZ;
  uniform float uBridgeActive;

  varying vec3 vWorldPos;
  varying float vBedY;
  varying float vFlowScroll;
  varying float vWaveH;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.5);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // Procedural raindrop ring ripples returning height & slope gradient
  vec3 rainRipples(vec2 p, float t, float intensity) {
    if (intensity <= 0.02) return vec3(0.0);
    vec2 cell = floor(p * 1.45);
    vec2 local = fract(p * 1.45) - 0.5;
    vec3 acc = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = cell + vec2(float(i), float(j));
        float h = hash21(g);
        float life = fract(t * (1.2 + 0.6 * h) + h * 7.1);
        vec2 center = vec2(float(i), float(j)) + (vec2(h, hash21(g + 13.7)) - 0.5) * 0.65 - local;
        float dist = length(center);
        float radius = life * 0.58;
        float ring = exp(-pow((dist - radius) * 26.0, 2.0)) * (1.0 - life);
        float wave = sin((dist - radius) * 42.0) * ring;
        vec2 dir = dist > 0.001 ? normalize(-center) : vec2(0.0);
        acc.xy += dir * wave * intensity;
        acc.z += ring * intensity;
      }
    }
    return acc;
  }

  void main() {
    float depth = vWorldPos.y - vBedY;
    if (depth <= 0.004) discard;

    // Downstream advection coordinate using cumulative per-lane flow displacement
    vec2 flowUv = vec2(vWorldPos.x - vFlowScroll, vWorldPos.z);
    float n1 = fbm(flowUv * 0.72 + vec2(0.0, uTime * 0.12));
    float n2 = fbm(flowUv * 1.65 - vec2(uTime * 0.25, uTime * 0.18));

    // Rain ripples perturb normal and surface highlights
    vec3 rain = rainRipples(vec2(vWorldPos.x - vFlowScroll * 0.3, vWorldPos.z), uTime, uRainIntensity);

    // Analytic capillary/chop normal perturbation
    float eps = 0.12;
    float nxA = fbm((flowUv + vec2(eps, 0.0)) * 1.2) - fbm((flowUv - vec2(eps, 0.0)) * 1.2);
    float nzA = fbm((flowUv + vec2(0.0, eps)) * 1.2) - fbm((flowUv - vec2(0.0, eps)) * 1.2);
    float normalStrength = 1.6 + 2.4 * uWindChop + 1.4 * uRainIntensity;
    vec3 N = normalize(vec3(-nxA * normalStrength - rain.x * 0.55, 1.0, -nzA * normalStrength - rain.y * 0.55));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // Depth-based turbidity color blending
    float depthMix = smoothstep(0.05, 1.35, depth);
    vec3 baseCol = mix(uShallowColor, uDeepColor, depthMix);
    baseCol *= (0.86 + 0.26 * n1);

    // Fresnel sky reflection
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
    vec3 skyCol = mix(vec3(0.58, 0.76, 0.90), vec3(0.10, 0.14, 0.22), uNightMode);
    vec3 nightAmbient = mix(vec3(1.0), vec3(0.32, 0.38, 0.52), uNightMode);
    vec3 col = mix(baseCol * nightAmbient, skyCol, clamp(fresnel * 0.55, 0.05, 0.65));

    // Specular sun glare highlight (creates authentic optical glare vs turbidity/sunGlare)
    float specPow = mix(95.0, 38.0, clamp(uWindChop * 0.7 + uRainIntensity * 0.4, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), specPow);
    float glareFactor = mix(0.25, 2.8, clamp(uSunGlare, 0.0, 1.0)) * mix(1.0, 0.22, uNightMode);
    vec3 glareCol = mix(vec3(1.0, 0.97, 0.88), vec3(0.7, 0.78, 1.0), uNightMode);
    col += glareCol * spec * glareFactor;

    // Shoreline foam & bridge pier bow/wake foam
    float shoreFoam = smoothstep(0.16, 0.01, depth) * (0.45 + 0.55 * n2);
    float dPierUpstream = length(vec2((vWorldPos.x - (uPierXZ.x - 0.32)) * 1.4, vWorldPos.z - uPierXZ.y));
    float pierBowFoam = uBridgeActive * smoothstep(0.65, 0.18, dPierUpstream) * smoothstep(0.1, 0.5, depth);
    float wakeBand = exp(-pow((vWorldPos.z - uPierXZ.y) / 0.42, 2.0)) * smoothstep(0.0, 0.6, vWorldPos.x - uPierXZ.x) * exp(-(vWorldPos.x - uPierXZ.x) * 0.28);
    float wakeFoam = uBridgeActive * wakeBand * smoothstep(0.42, 0.78, n2) * 0.75;
    float chopFoam = smoothstep(0.66, 0.88, n2) * (0.12 + 0.45 * uWindChop);
    float rainFoam = clamp(rain.z * 0.38, 0.0, 0.55);

    float totalFoam = clamp(shoreFoam * 0.55 + pierBowFoam * 0.8 + wakeFoam + chopFoam + rainFoam, 0.0, 0.9);
    vec3 foamColor = mix(vec3(0.92, 0.95, 0.97), vec3(0.52, 0.58, 0.66), uNightMode);
    col = mix(col, foamColor, totalFoam);

    float shoreAlpha = smoothstep(0.004, 0.10, depth);
    float alpha = clamp(mix(uOpacity * 0.65, uOpacity, depthMix) * shoreAlpha + totalFoam * 0.35 + spec * 0.25 * uSunGlare, 0.0, 0.98);
    gl_FragColor = vec4(col, alpha);
  }
`;

/* -------------------------------------------------------------------------- */
/*  3D Debris Mesh Builders                                                   */
/* -------------------------------------------------------------------------- */

function buildLabDebrisMesh(type, size) {
  const g = new THREE.Group();
  if (type === 'foam' || type === 'tracer') {
    const mat = new THREE.MeshStandardMaterial({
      color: type === 'tracer' ? '#ff9d2e' : '#f4f7fa',
      roughness: type === 'tracer' ? 0.35 : 0.75,
      metalness: 0.05,
    });
    const m1 = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat);
    m1.scale.set(1.2, 0.58, 1.0);
    g.add(m1);
    if (type === 'foam') {
      const m2 = new THREE.Mesh(new THREE.SphereGeometry(size * 0.72, 8, 6), mat);
      m2.position.set(size * 0.65, 0, size * 0.25);
      m2.scale.set(1.0, 0.55, 0.9);
      g.add(m2);
    }
  } else if (type === 'leaf') {
    const mat = new THREE.MeshStandardMaterial({
      color: '#4f8f38',
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const geom = new THREE.PlaneGeometry(size * 1.9, size * 1.1);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, mat);
    g.add(mesh);
  } else {
    // debris_plastic
    const mat = new THREE.MeshStandardMaterial({
      color: '#d8f0ff',
      roughness: 0.25,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, size * 0.55, size * 1.0), mat);
    g.add(mesh);
  }
  return g;
}

function buildRiverDebrisMesh(type, size) {
  const g = new THREE.Group();
  if (type === 'bottle') {
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#cceeff',
      roughness: 0.15,
      transparent: true,
      opacity: 0.8,
      clearcoat: 1.0,
    });
    const capMat = new THREE.MeshStandardMaterial({ color: '#e03131', roughness: 0.4 });
    const r = size * 0.18;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, size * 0.72, 10), bodyMat);
    body.rotation.z = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.92, size * 0.16, 10), bodyMat);
    neck.rotation.z = Math.PI / 2;
    neck.position.x = size * 0.43;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, size * 0.1, 10), capMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = size * 0.53;
    g.add(body, neck, cap);
  } else if (type === 'branch') {
    const woodMat = new THREE.MeshStandardMaterial({ color: '#5c4028', roughness: 0.9 });
    const main = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.04, size * 0.065, size, 8), woodMat);
    main.rotation.z = Math.PI / 2;
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.025, size * 0.04, size * 0.45, 7), woodMat);
    fork.rotation.z = Math.PI / 2 - 0.55;
    fork.rotation.y = 0.4;
    fork.position.set(size * 0.12, 0.01, size * 0.12);
    g.add(main, fork);
  } else if (type === 'bag') {
    const bagMat = new THREE.MeshStandardMaterial({
      color: '#eaf4ff',
      roughness: 0.45,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.45, 0), bagMat);
    lump.scale.set(1.3, 0.38, 1.0);
    g.add(lump);
  } else if (type === 'leaf') {
    const leafMat = new THREE.MeshStandardMaterial({
      color: '#4a8f34',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    for (let k = 0; k < 4; k++) {
      const petal = new THREE.Mesh(new THREE.CircleGeometry(size * 0.28, 7), leafMat);
      petal.rotation.x = -Math.PI / 2;
      const a = (k / 4) * Math.PI * 2 + 0.3;
      petal.position.set(Math.cos(a) * size * 0.18, 0.005 * k, Math.sin(a) * size * 0.18);
      g.add(petal);
    }
  } else {
    // foam
    const foamMat = new THREE.MeshStandardMaterial({
      color: '#f2f5f7',
      roughness: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    for (let k = 0; k < 3; k++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(size * (0.28 - k * 0.04), 8, 6), foamMat);
      blob.scale.set(1.35, 0.28, 1.0);
      blob.position.set((k - 1) * size * 0.26, 0, ((k % 2) - 0.5) * size * 0.18);
      g.add(blob);
    }
  }
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Main Export: createWaterSystem(sceneRefs)                                 */
/* -------------------------------------------------------------------------- */

function createWaterSystem(sceneRefs = {}) {
  const labWaterGroup = new THREE.Group();
  labWaterGroup.name = 'LabWaterSystem';

  const riverWaterGroup = new THREE.Group();
  riverWaterGroup.name = 'RiverWaterSystem';

  // Extract optional geometry overrides from sceneRefs if supplied
  const stepBounds = sceneRefs?.flumeTank?.parts?.stepBounds || sceneRefs?.stepBounds;
  const bedHeightFn =
    sceneRefs?.riverField?.getBedHeightAtZ ||
    sceneRefs?.getBedHeightAtZ ||
    defaultGuimbalBedHeight;

  const G = {
    headbox: LAB_GEOMETRY.headbox,
    step1: stepBounds?.[0] ? { ...LAB_GEOMETRY.step1, ...stepBounds[0] } : LAB_GEOMETRY.step1,
    step2: stepBounds?.[1] ? { ...LAB_GEOMETRY.step2, ...stepBounds[1] } : LAB_GEOMETRY.step2,
    step3: stepBounds?.[2] ? { ...LAB_GEOMETRY.step3, ...stepBounds[2] } : LAB_GEOMETRY.step3,
    basin: LAB_GEOMETRY.basin,
    width: LAB_GEOMETRY.channelWidth - 0.006, // 0.344 m inside glass walls
  };

  /* -------------------- PHASE 1: LAB TANK WATER SYSTEM -------------------- */

  const labVolumeMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2794b8'),
    roughness: 0.12,
    metalness: 0.0,
    transmission: 0.0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const labSurfaceMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#5dc4e2'),
    roughness: 0.05,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.92,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  function createVolumeBox(xMin, xMax, zWidth, bottomY) {
    const w = xMax - xMin;
    const geom = new THREE.BoxGeometry(w, 1, zWidth);
    geom.translate(0, 0.5, 0); // anchor bottom face at y = 0
    const mesh = new THREE.Mesh(geom, labVolumeMat);
    mesh.position.set(0.5 * (xMin + xMax), bottomY, 0);
    mesh.renderOrder = 2;
    return mesh;
  }

  const volHeadbox = createVolumeBox(G.headbox.xMin, G.headbox.xMax, G.width, LAB_GEOMETRY.floorY);
  const volReturn = createVolumeBox(
    G.headbox.xMax - 0.004,
    G.basin.xMin + 0.004,
    G.width,
    LAB_GEOMETRY.floorY
  );
  volReturn.scale.y = LAB_GEOMETRY.returnTopY - LAB_GEOMETRY.floorY;

  const volStep1 = createVolumeBox(G.step1.xMin, G.step1.xMax, G.width, LAB_GEOMETRY.shelfY + 0.003);
  const volStep2 = createVolumeBox(G.step2.xMin, G.step2.xMax, G.width, LAB_GEOMETRY.shelfY + 0.003);
  const volStep3 = createVolumeBox(G.step3.xMin, G.step3.xMax, G.width, LAB_GEOMETRY.shelfY + 0.003);
  const volBasin = createVolumeBox(G.basin.xMin, G.basin.xMax, G.width, LAB_GEOMETRY.floorY);

  labWaterGroup.add(volHeadbox, volReturn, volStep1, volStep2, volStep3, volBasin);

  // Animated top surfaces for Headbox, Step 1, Step 2, Step 3, Basin
  function createSurfaceGrid(xMin, xMax, zWidth, segX = 22, segZ = 14) {
    const w = xMax - xMin;
    const geom = new THREE.PlaneGeometry(w, zWidth, segX, segZ);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, labSurfaceMat);
    mesh.position.set(0.5 * (xMin + xMax), 0, 0);
    mesh.renderOrder = 3;

    // Meniscus highlight line along front glass wall (z = +zWidth/2)
    const linePts = new Float32Array((segX + 1) * 3);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(linePts, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: '#bfefff',
      transparent: true,
      opacity: 0.75,
    });
    const meniscus = new THREE.Line(lineGeom, lineMat);
    meniscus.renderOrder = 4;
    labWaterGroup.add(mesh, meniscus);

    return { mesh, geom, meniscus, lineGeom, xMin, xMax, zWidth, segX, segZ };
  }

  const surfHeadbox = createSurfaceGrid(G.headbox.xMin, G.headbox.xMax, G.width, 14, 12);
  const surfStep1 = createSurfaceGrid(G.step1.xMin, G.step1.xMax, G.width, 22, 14);
  const surfStep2 = createSurfaceGrid(G.step2.xMin, G.step2.xMax, G.width, 22, 14);
  const surfStep3 = createSurfaceGrid(G.step3.xMin, G.step3.xMax, G.width, 22, 14);
  const surfBasin = createSurfaceGrid(G.basin.xMin, G.basin.xMax, G.width, 18, 14);

  const allLabSurfaces = [surfHeadbox, surfStep1, surfStep2, surfStep3, surfBasin];

  function updateLabSurfaceGrid(surf, labHydraulics, fallbackY) {
    const pos = surf.geom.attributes.position;
    const centerX = surf.mesh.position.x;
    const lineAttr = surf.lineGeom.attributes.position;
    const frontZ = surf.zWidth * 0.5 - 0.002;
    let frontIdx = 0;

    for (let i = 0; i < pos.count; i++) {
      const localX = pos.getX(i);
      const localZ = pos.getZ(i);
      const worldX = centerX + localX;
      const y = labHydraulics ? labHydraulics.sampleSurface(worldX, localZ) : fallbackY;
      pos.setY(i, y);

      // Last row corresponds to +Z front edge after rotateX(-PI/2)
      if (Math.abs(localZ - surf.zWidth * 0.5) < 0.005 && frontIdx <= surf.segX) {
        lineAttr.setXYZ(frontIdx, worldX, y + 0.0008, frontZ);
        frontIdx++;
      }
    }
    pos.needsUpdate = true;
    lineAttr.needsUpdate = true;
    surf.geom.computeVertexNormals();
  }

  // 3 Parabolic Cascading Waterfall Sheets (Step 1->2, Step 2->3, Step 3->Basin)
  const waterfallUniforms = {
    uTime: { value: 0 },
    uFlow: { value: 1.0 },
    uWaterColor: { value: new THREE.Color('#53c2e0') },
    uFoamColor: { value: new THREE.Color('#eef9ff') },
    uOpacity: { value: 0.78 },
    uNightMode: { value: 0.0 },
  };
  const waterfallMat = new THREE.ShaderMaterial({
    vertexShader: WATERFALL_VERTEX,
    fragmentShader: WATERFALL_FRAGMENT,
    uniforms: waterfallUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  function createWaterfallSheet(weirX, weirY) {
    const segZ = 14;
    const segV = 16;
    const geom = new THREE.PlaneGeometry(1, 1, segZ, segV);
    const mesh = new THREE.Mesh(geom, waterfallMat);
    mesh.renderOrder = 4;
    labWaterGroup.add(mesh);
    return { mesh, geom, weirX, weirY, segZ, segV };
  }

  const wf1 = createWaterfallSheet(G.step1.xMax + 0.002, G.step1.weirY);
  const wf2 = createWaterfallSheet(G.step2.xMax + 0.002, G.step2.weirY);
  const wf3 = createWaterfallSheet(G.step3.xMax + 0.002, G.step3.weirY);

  function updateWaterfallSheet(wf, upperY, lowerY, qFlow) {
    const head = Math.max(0, upperY - wf.weirY);
    const active = head > 0.0005 && qFlow > 1e-5;
    wf.mesh.visible = active;
    if (!active) return;

    const pos = wf.geom.attributes.position;
    const cols = wf.segZ + 1;
    const rows = wf.segV + 1;
    const drop = Math.max(0.015, upperY - lowerY + 0.004);
    // Horizontal throw proportional to weir head & flow
    const throwDist = 0.022 + clamp(head / 0.02, 0, 1.4) * 0.024;
    const crestY = wf.weirY + head * 0.65;

    for (let r = 0; r < rows; r++) {
      // PlaneGeometry top row is r=0 (v=1), bottom row is r=segV (v=0)
      const s = r / wf.segV; // 0 at crest -> 1 at plunge pool
      const y = crestY - drop * Math.pow(s, 1.58);
      const x = wf.weirX - 0.004 + throwDist * Math.pow(s, 0.72);
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const uZ = c / wf.segZ - 0.5;
        const z = uZ * (G.width - 0.012);
        // Subtle undulating sheet ripple across width
        const rippleX = Math.sin(uZ * 18.0 + s * 8.0 - waterfallMat.uniforms.uTime.value * 7.0) * 0.0012 * s;
        pos.setXYZ(idx, x + rippleX, y, z);
      }
    }
    pos.needsUpdate = true;
    wf.geom.computeVertexNormals();
  }

  // Inlet Jet Stream from blue PVC drop nozzle (-0.21, 0.43, -0.02)
  const inletJetUniforms = {
    uTime: waterfallUniforms.uTime,
    uFlow: { value: 1.0 },
    uWaterColor: waterfallUniforms.uWaterColor,
    uFoamColor: waterfallUniforms.uFoamColor,
    uOpacity: { value: 0.85 },
    uNightMode: waterfallUniforms.uNightMode,
  };
  const inletJetMat = new THREE.ShaderMaterial({
    vertexShader: WATERFALL_VERTEX,
    fragmentShader: WATERFALL_FRAGMENT,
    uniforms: inletJetUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jetGeom = new THREE.CylinderGeometry(0.009, 0.0125, 1.0, 14, 10, true);
  jetGeom.translate(0, -0.5, 0); // top anchored at y = 0, extends downward to y = -1
  const inletJetMesh = new THREE.Mesh(jetGeom, inletJetMat);
  inletJetMesh.position.set(
    LAB_GEOMETRY.nozzlePos.x,
    LAB_GEOMETRY.nozzlePos.y,
    LAB_GEOMETRY.nozzlePos.z
  );
  inletJetMesh.renderOrder = 4;

  // Splash foam ring at jet entry on Step 1 surface
  const splashRingMat = new THREE.MeshBasicMaterial({
    color: '#eef8ff',
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const splashRing = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.026, 20), splashRingMat);
  splashRing.rotation.x = -Math.PI / 2;
  splashRing.position.set(LAB_GEOMETRY.nozzlePos.x, 0.336, LAB_GEOMETRY.nozzlePos.z);
  splashRing.renderOrder = 4;
  labWaterGroup.add(inletJetMesh, splashRing);

  // Aeration Bubbles InstancedMesh (Plunge zones + under-shelf return channel)
  const BUBBLE_COUNT = 220;
  const bubbleGeom = new THREE.SphereGeometry(0.0028, 6, 5);
  const bubbleMat = new THREE.MeshBasicMaterial({
    color: '#e8f8ff',
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  const bubbleInstanced = new THREE.InstancedMesh(bubbleGeom, bubbleMat, BUBBLE_COUNT);
  bubbleInstanced.renderOrder = 4;
  labWaterGroup.add(bubbleInstanced);

  const bubbleStates = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const zoneIdx = i % 5; // 0: inlet plunge, 1: weir1, 2: weir2, 3: weir3, 4: return channel
    bubbleStates.push({
      zoneIdx,
      phase: (i * 0.6180339) % 1,
      seedZ: (((i * 37) % 100) / 100 - 0.5) * (G.width - 0.04),
      speed: 0.6 + ((i * 19) % 10) * 0.09,
      radiusScale: 0.65 + ((i * 13) % 7) * 0.14,
    });
  }
  const dummyObj = new THREE.Object3D();

  function updateLabBubbles(t, metrics) {
    const flowNorm = clamp((metrics?.inflowRate || 0) / 0.0012, 0, 1.6);
    const y1 = metrics?.y_w1 ?? 0.335;
    const y2 = metrics?.y_w2 ?? 0.27;
    const y3 = metrics?.y_w3 ?? 0.205;
    const yB = metrics?.y_basin ?? 0.15;

    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const b = bubbleStates[i];
      if (flowNorm <= 0.02) {
        dummyObj.scale.setScalar(0);
        dummyObj.updateMatrix();
        bubbleInstanced.setMatrixAt(i, dummyObj.matrix);
        continue;
      }

      const life = (t * b.speed * (0.6 + 0.5 * flowNorm) + b.phase) % 1;
      let bx = 0;
      let by = 0;
      let bz = b.seedZ;
      let s = b.radiusScale * clamp(flowNorm, 0.3, 1.2);

      if (b.zoneIdx === 0) {
        // Step 1 inlet jet plunge around (-0.21, y1, -0.02)
        const angle = b.phase * Math.PI * 2 + t * 2.0;
        const spread = 0.01 + life * 0.035;
        bx = LAB_GEOMETRY.nozzlePos.x + Math.cos(angle) * spread;
        bz = LAB_GEOMETRY.nozzlePos.z + Math.sin(angle) * spread;
        by = y1 - 0.036 * (1 - life) + Math.sin(life * Math.PI) * 0.004;
      } else if (b.zoneIdx === 1) {
        bx = -0.058 + life * 0.042;
        by = y2 - 0.038 * (1 - life);
      } else if (b.zoneIdx === 2) {
        bx = 0.132 + life * 0.042;
        by = y3 - 0.038 * (1 - life);
      } else if (b.zoneIdx === 3) {
        bx = 0.322 + life * 0.055;
        by = yB - 0.075 * (1 - life);
      } else {
        // Under-shelf return flow bubbles (-X direction at y = 0.02..0.072)
        const travel = (t * (0.28 + 0.22 * flowNorm) + b.phase) % 1;
        bx = 0.30 - travel * 0.68;
        by = 0.022 + ((b.phase * 7) % 1) * 0.052 + Math.sin(t * 4 + i) * 0.003;
      }

      dummyObj.position.set(bx, by, bz);
      dummyObj.scale.setScalar(s * Math.sin(life * Math.PI + 0.15));
      dummyObj.updateMatrix();
      bubbleInstanced.setMatrixAt(i, dummyObj.matrix);
    }
    bubbleInstanced.instanceMatrix.needsUpdate = true;
  }

  // Lab floating debris mesh pool (max 15)
  const labDebrisGroup = new THREE.Group();
  labWaterGroup.add(labDebrisGroup);
  const labDebrisPool = new Map();

  function syncLabDebrisMeshes(particles) {
    const activeIds = new Set();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      activeIds.add(p.id);
      let mesh = labDebrisPool.get(p.id);
      if (!mesh) {
        mesh = buildLabDebrisMesh(p.type, p.size);
        labDebrisPool.set(p.id, mesh);
        labDebrisGroup.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(0, p.rotY || 0, p.rotZ || 0);
    }
    for (const [id, mesh] of labDebrisPool.entries()) {
      if (!activeIds.has(id)) {
        labDebrisGroup.remove(mesh);
        labDebrisPool.delete(id);
      }
    }
  }

  /* -------------------- PHASE 2: GUIMBAL RIVER SYSTEM --------------------- */

  const RIVER_LEN_X = 28.0; // x in [-14, +14]
  const RIVER_WID_Z = 13.0; // z in [-6.5, +6.5] covering 12.0 m channel & walls cleanly
  const SEG_X = 96;
  const SEG_Z = 88;

  const riverGeom = new THREE.PlaneGeometry(RIVER_LEN_X, RIVER_WID_Z, SEG_X, SEG_Z);
  riverGeom.rotateX(-Math.PI / 2);

  const riverPosAttr = riverGeom.attributes.position;
  const vCount = riverPosAttr.count;
  const bedYArray = new Float32Array(vCount);
  const flowScrollArray = new Float32Array(vCount);

  // Extract unique Z-row coordinates and precompute surveyed bed elevations
  const colsX = SEG_X + 1;
  const rowsZ = SEG_Z + 1;
  const rowZCoords = new Float32Array(rowsZ);
  const rowFlowAccum = new Float32Array(rowsZ);

  for (let r = 0; r < rowsZ; r++) {
    const sampleZ = riverPosAttr.getZ(r * colsX);
    rowZCoords[r] = sampleZ;
    const bY = bedHeightFn(sampleZ);
    for (let c = 0; c < colsX; c++) {
      bedYArray[r * colsX + c] = bY;
    }
  }

  riverGeom.setAttribute('aBedY', new THREE.BufferAttribute(bedYArray, 1));
  const flowScrollAttr = new THREE.BufferAttribute(flowScrollArray, 1);
  riverGeom.setAttribute('aFlowScroll', flowScrollAttr);

  const riverUniforms = {
    uTime: { value: 0 },
    uWaterLevel: { value: 1.15 },
    uShallowColor: { value: new THREE.Color('#8a835a') },
    uDeepColor: { value: new THREE.Color('#5c593c') },
    uOpacity: { value: 0.86 },
    uSunGlare: { value: 0.25 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.72, -0.35).normalize() },
    uNightMode: { value: 0.0 },
    uRainIntensity: { value: 0.0 },
    uWindChop: { value: 0.15 },
    uPierXZ: { value: new THREE.Vector2(0.0, -4.2) },
    uBridgeActive: { value: 1.0 },
  };

  const riverMat = new THREE.ShaderMaterial({
    vertexShader: RIVER_VERTEX,
    fragmentShader: RIVER_FRAGMENT,
    uniforms: riverUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const riverSurfaceMesh = new THREE.Mesh(riverGeom, riverMat);
  riverSurfaceMesh.renderOrder = 2;
  riverWaterGroup.add(riverSurfaceMesh);

  // River floating debris pool (up to 25)
  const riverDebrisGroup = new THREE.Group();
  riverWaterGroup.add(riverDebrisGroup);
  const riverDebrisPool = new Map();

  function syncRiverDebrisMeshes(particles) {
    const activeIds = new Set();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      activeIds.add(p.id);
      let mesh = riverDebrisPool.get(p.id);
      if (!mesh) {
        mesh = buildRiverDebrisMesh(p.type, p.size);
        riverDebrisPool.set(p.id, mesh);
        riverDebrisGroup.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(0, p.rotY || 0, p.rotZ || 0);
    }
    for (const [id, mesh] of riverDebrisPool.entries()) {
      if (!activeIds.has(id)) {
        riverDebrisGroup.remove(mesh);
        riverDebrisPool.delete(id);
      }
    }
  }

  /* -------------------- UNIFIED UPDATE LOOP ------------------------------- */

  let elapsed = 0;

  function update(dt, state = {}, labHydraulics = null, riverHydraulics = null) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    elapsed += clampedDt;

    const isRiver =
      state.mode === 'river' ||
      state.phase === 'river' ||
      state.phase === 2 ||
      state.activeMode === 'river';

    labWaterGroup.visible = !isRiver;
    riverWaterGroup.visible = isRiver;

    const turb = getPalette(state.turbidityMode || (isRiver ? 'silty' : 'clear'));
    const nightTarget = state.nightMode ? 1.0 : 0.0;

    if (!isRiver && labHydraulics) {
      const m = labHydraulics.getMetrics();
      const particles = labHydraulics.getParticles();

      labVolumeMat.color.copy(turb.labDeep);
      labVolumeMat.opacity = turb.labOpacity * 0.62;
      labSurfaceMat.color.copy(turb.labColor);
      labSurfaceMat.opacity = clamp(turb.labOpacity + 0.16, 0.35, 0.92);

      // Update volume heights
      volHeadbox.scale.y = Math.max(0.003, m.y_headbox - LAB_GEOMETRY.floorY);
      volStep1.scale.y = Math.max(0.003, m.y_w1 - (LAB_GEOMETRY.shelfY + 0.003));
      volStep2.scale.y = Math.max(0.003, m.y_w2 - (LAB_GEOMETRY.shelfY + 0.003));
      volStep3.scale.y = Math.max(0.003, m.y_w3 - (LAB_GEOMETRY.shelfY + 0.003));
      volBasin.scale.y = Math.max(0.003, m.y_basin - LAB_GEOMETRY.floorY);

      // Update dynamic wave surfaces
      updateLabSurfaceGrid(surfHeadbox, labHydraulics, m.y_headbox);
      updateLabSurfaceGrid(surfStep1, labHydraulics, m.y_w1);
      updateLabSurfaceGrid(surfStep2, labHydraulics, m.y_w2);
      updateLabSurfaceGrid(surfStep3, labHydraulics, m.y_w3);
      updateLabSurfaceGrid(surfBasin, labHydraulics, m.y_basin);

      // Update waterfalls & inlet jet stream
      const wfU = waterfallMat.uniforms;
      wfU.uTime.value = elapsed;
      wfU.uFlow.value = clamp(m.qFlow / 0.00118, 0, 1.5);
      wfU.uWaterColor.value.copy(turb.labColor);
      wfU.uOpacity.value = clamp(turb.labOpacity + 0.3, 0.5, 0.95);
      wfU.uNightMode.value = nightTarget;

      updateWaterfallSheet(wf1, m.y_w1, m.y_w2, m.qWeir1);
      updateWaterfallSheet(wf2, m.y_w2, m.y_w3, m.qWeir2);
      updateWaterfallSheet(wf3, m.y_w3, m.y_basin, m.qWeir3);

      const jetActive = m.inflowActive && m.inflowRate > 1e-5;
      inletJetMesh.visible = jetActive;
      splashRing.visible = jetActive;
      if (jetActive) {
        const dropH = Math.max(0.01, LAB_GEOMETRY.nozzlePos.y - m.y_w1);
        const jetFlowNorm = clamp(m.inflowRate / 0.00118, 0.3, 1.4);
        const jetU = inletJetMat.uniforms;
        jetU.uTime.value = elapsed;
        jetU.uFlow.value = jetFlowNorm;
        jetU.uWaterColor.value.copy(turb.labColor);
        jetU.uOpacity.value = clamp(turb.labOpacity + 0.35, 0.55, 0.95);
        jetU.uNightMode.value = nightTarget;
        inletJetMesh.scale.set(0.75 + 0.35 * jetFlowNorm, dropH, 0.75 + 0.35 * jetFlowNorm);
        splashRing.position.y = m.y_w1 + 0.0025;
        const pulse = 0.88 + 0.25 * Math.sin(elapsed * 14.0);
        splashRing.scale.setScalar(pulse * (0.7 + 0.35 * jetFlowNorm));
      }

      updateLabBubbles(elapsed, m);
      syncLabDebrisMeshes(particles);
    }

    if (isRiver && riverHydraulics) {
      const m = riverHydraulics.getMetrics();
      const particles = riverHydraulics.getParticles();

      const rU = riverMat.uniforms;
      rU.uTime.value = elapsed;
      rU.uWaterLevel.value = m.waterLevelM;
      rU.uShallowColor.value.copy(turb.riverShallow);
      rU.uDeepColor.value.copy(turb.riverDeep);
      rU.uOpacity.value = turb.riverOpacity;
      rU.uSunGlare.value = clamp(
        state.sunGlare !== undefined ? Number(state.sunGlare) : 0.25,
        0,
        1
      );
      rU.uNightMode.value = nightTarget;
      rU.uRainIntensity.value = clamp(m.rainIntensity || 0, 0, 1);
      rU.uWindChop.value = clamp(m.windChop || 0.15, 0, 1);
      rU.uBridgeActive.value =
        state.riverMountMode !== 'side_pole' && state.riverMountMode !== 'lab_pole' ? 1.0 : 0.0;

      // Update per-Z-row cumulative downstream advection without phase discontinuities
      for (let r = 0; r < rowsZ; r++) {
        const vel = riverHydraulics.getVelocityAtZ(rowZCoords[r], 0.8);
        rowFlowAccum[r] += vel * clampedDt;
        const acc = rowFlowAccum[r];
        const rowBase = r * colsX;
        for (let c = 0; c < colsX; c++) {
          flowScrollArray[rowBase + c] = acc;
        }
      }
      flowScrollAttr.needsUpdate = true;

      syncRiverDebrisMeshes(particles);
    }
  }

  function dispose() {
    labVolumeMat.dispose();
    labSurfaceMat.dispose();
    waterfallMat.dispose();
    inletJetMat.dispose();
    splashRingMat.dispose();
    bubbleGeom.dispose();
    bubbleMat.dispose();
    riverGeom.dispose();
    riverMat.dispose();
    for (const surf of allLabSurfaces) {
      surf.geom.dispose();
      surf.lineGeom.dispose();
    }
  }

  return {
    labWaterGroup,
    riverWaterGroup,
    update,
    dispose,
  };
}

  return { createWaterSystem };
})(THREE, RiverSimModules.hydraulics, RiverSimModules.realRiverHydraulics);

/* === MODULE: src/sim/sensorOptics.js === */
RiverSimModules.sensorOptics = (function (THREE) {
const PIP_WIDTH = 320;
const PIP_HEIGHT = 240;

const DEFAULT_LAB_ANCHORS = {
  lidar: new THREE.Vector3(-0.17, 0.693, 0),
  camera: new THREE.Vector3(0.02, 0.72, -0.02),
  ir: new THREE.Vector3(0.08, 0.72, -0.02),
};

const DEFAULT_RIVER_ANCHORS = {
  lidar: new THREE.Vector3(0.8, 4.5, 0),
  camera: new THREE.Vector3(0.6, 4.4, -0.35),
  ir: new THREE.Vector3(0.95, 4.4, -0.35),
};

const LASER_GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const LASER_GLOW_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormalV);
    vec3 V = normalize(vViewPos);
    float fresnel = pow(abs(dot(N, V)), 1.7);
    // Subtle downward pulse along beam
    float pulse = 0.75 + 0.25 * sin(vUv.y * 26.0 + uTime * 22.0);
    float endFade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    float alpha = fresnel * pulse * endFade * uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const IR_CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  void main() {
    if (uIntensity <= 0.005) discard;
    vec3 N = normalize(vNormalV);
    vec3 V = normalize(vViewPos);
    float edgeSoft = pow(abs(dot(N, V)), 1.45);
    // vUv.y = 1 at emitter top, 0 at water surface bottom
    float longitudinal = smoothstep(0.0, 0.75, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    float shimmer = 0.92 + 0.08 * sin(uTime * 3.2 + vUv.y * 8.0);
    float alpha = edgeSoft * longitudinal * shimmer * uIntensity * 0.26;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function toVector3(v, fallback) {
  if (!v) return fallback.clone();
  if (v.isVector3) return v.clone();
  return new THREE.Vector3(v.x ?? fallback.x, v.y ?? fallback.y, v.z ?? fallback.z);
}

function createSensorOptics(renderer = null) {
  const group = new THREE.Group();
  group.name = 'SensorOpticsOverlay';

  // Live Pi Camera NoIR offscreen render target & matching PerspectiveCamera
  const pipRenderTarget = new THREE.WebGLRenderTarget(PIP_WIDTH, PIP_HEIGHT, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  });

  const pipCamera = new THREE.PerspectiveCamera(48, PIP_WIDTH / PIP_HEIGHT, 0.08, 32);
  pipCamera.name = 'PiCameraNoIR_PIP';

  /* ---------------------- 1. TF-Luna Green LiDAR Beam --------------------- */

  const lidarGroup = new THREE.Group();
  lidarGroup.name = 'LidarBeamGroup';
  group.add(lidarGroup);

  const coreGeom = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  coreGeom.translate(0, -0.5, 0); // anchor top at y = 0, extend down along -Y
  const coreMat = new THREE.MeshBasicMaterial({
    color: '#22ff88',
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lidarCoreMesh = new THREE.Mesh(coreGeom, coreMat);
  lidarCoreMesh.renderOrder = 6;

  const glowGeom = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
  glowGeom.translate(0, -0.5, 0);
  const glowUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00e676') },
    uIntensity: { value: 0.45 },
  };
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: LASER_GLOW_VERTEX,
    fragmentShader: LASER_GLOW_FRAGMENT,
    uniforms: glowUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lidarGlowMesh = new THREE.Mesh(glowGeom, glowMat);
  lidarGlowMesh.renderOrder = 6;

  // Impact dot + 2 pulsing concentric impact rings on water surface
  const impactGroup = new THREE.Group();
  const dotMat = new THREE.MeshBasicMaterial({
    color: '#80ffbb',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const impactDot = new THREE.Mesh(new THREE.CircleGeometry(1, 20), dotMat);
  impactDot.rotation.x = -Math.PI / 2;

  const ringMat1 = new THREE.MeshBasicMaterial({
    color: '#00ff88',
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringMat2 = ringMat1.clone();

  const impactRing1 = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.0, 28), ringMat1);
  impactRing1.rotation.x = -Math.PI / 2;

  const impactRing2 = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.0, 28), ringMat2);
  impactRing2.rotation.x = -Math.PI / 2;

  impactGroup.add(impactDot, impactRing1, impactRing2);
  impactGroup.renderOrder = 7;
  lidarGroup.add(lidarCoreMesh, lidarGlowMesh, impactGroup);

  /* ----------------- 2. Crimson Pi Camera NoIR FOV Frustum ---------------- */

  const frustumGroup = new THREE.Group();
  frustumGroup.name = 'NoirCameraFovFrustum';
  group.add(frustumGroup);

  // 4 triangular side faces (12 vertices) with outward-facing normals (FrontSide)
  // so main camera sees translucent crimson frustum while pipCamera inside isn't tinted!
  const frustumFacePos = new Float32Array(12 * 3);
  const frustumFaceGeom = new THREE.BufferGeometry();
  frustumFaceGeom.setAttribute('position', new THREE.BufferAttribute(frustumFacePos, 3));
  const frustumFaceMat = new THREE.MeshBasicMaterial({
    color: '#e11d48',
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const frustumFaceMesh = new THREE.Mesh(frustumFaceGeom, frustumFaceMat);
  frustumFaceMesh.renderOrder = 5;

  // 8 wireframe edges (4 pyramid rays + 4 footprint edges = 16 vertices)
  const frustumLinePos = new Float32Array(16 * 3);
  const frustumLineGeom = new THREE.BufferGeometry();
  frustumLineGeom.setAttribute('position', new THREE.BufferAttribute(frustumLinePos, 3));
  const frustumLineMat = new THREE.LineBasicMaterial({
    color: '#ff2e55',
    transparent: true,
    opacity: 0.88,
  });
  const frustumLineMesh = new THREE.LineSegments(frustumLineGeom, frustumLineMat);
  frustumLineMesh.renderOrder = 6;

  // Footprint boundary quad outline on water plane (highlighted subtle fill)
  const footprintPos = new Float32Array(6 * 3);
  const footprintGeom = new THREE.BufferGeometry();
  footprintGeom.setAttribute('position', new THREE.BufferAttribute(footprintPos, 3));
  const footprintMat = new THREE.MeshBasicMaterial({
    color: '#ff244c',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const footprintMesh = new THREE.Mesh(footprintGeom, footprintMat);
  footprintMesh.renderOrder = 4;

  frustumGroup.add(frustumFaceMesh, frustumLineMesh, footprintMesh);

  /* ----------------- 3. 850 nm IR Illuminator Volumetric Cone ------------- */

  const irConeGeom = new THREE.CylinderGeometry(0.015, 0.34, 1.0, 24, 1, true);
  irConeGeom.translate(0, -0.5, 0); // top at origin, extends down along -Y
  const irConeUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#c8358a') },
    uIntensity: { value: 0.0 },
  };
  const irConeMat = new THREE.ShaderMaterial({
    vertexShader: LASER_GLOW_VERTEX,
    fragmentShader: IR_CONE_FRAGMENT,
    uniforms: irConeUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const irConeMesh = new THREE.Mesh(irConeGeom, irConeMat);
  irConeMesh.renderOrder = 5;
  irConeMesh.visible = false;
  group.add(irConeMesh);

  /* ----------------- Optical Simulation & Telemetry State ----------------- */

  let simTime = 0;
  let irFade = 0;
  let smoothNoise = 0;
  let dropoutTimer = 0;
  let inDropout = false;
  let lastValidDistance = 0.358;

  let lastReading = {
    trueDistanceM: 0.358,
    trueSlantDistanceM: 0.358,
    rawLaserDistanceM: 0.358,
    distanceM: 0.358,
    lidarDistanceM: 0.358,
    waterLevelM: 0.335,
    surfaceY: 0.335,
    sensorHeightM: 0.693,
    thetaDeg: 0,
    cameraIncidenceDeg: 0,
    slantCompEnabled: true,
    hitDryBank: false,
    snr: 58,
    signalStrengthPct: 58,
    signalStrength: 8236,
    valid: true,
    dropout: false,
    errorM: 0,
    turbidityMode: 'clear',
    impactPoint: { x: -0.17, y: 0.335, z: 0 },
    fovCenterPoint: { x: 0.02, y: 0.27, z: 0 },
    timestamp: 0,
  };

  // Scratch vectors to avoid per-frame allocations
  const _down = new THREE.Vector3(0, -1, 0);
  const _lidarDir = new THREE.Vector3(0, -1, 0);
  const _camDir = new THREE.Vector3(0, -1, 0);
  const _irDir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _camTarget = new THREE.Vector3();
  const _camUp = new THREE.Vector3(0, 0, -1);
  const _sidePoleCamUp = new THREE.Vector3(0, 1, 0);
  const _rayCorner = new THREE.Vector3();
  const _projScratch = new THREE.Vector3();
  const _corners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  // NDC coordinates of camera image corners: TL, TR, BR, BL
  const NDC_CORNERS = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];

  function sampleWaterY(waterSampler, x, z, isRiver) {
    if (typeof waterSampler === 'function') {
      const val = waterSampler(x, z);
      if (Number.isFinite(val)) return val;
    } else if (waterSampler && typeof waterSampler === 'object') {
      if (typeof waterSampler.sampleSurface === 'function') {
        const val = waterSampler.sampleSurface(x, z);
        if (Number.isFinite(val)) return val;
      }
      if (typeof waterSampler.getSurfaceY === 'function') {
        const val = waterSampler.getSurfaceY(x, z);
        if (Number.isFinite(val)) return val;
      }
      if (typeof waterSampler.getMetrics === 'function') {
        const m = waterSampler.getMetrics();
        if (Number.isFinite(m?.waterLevelM)) return m.waterLevelM;
      }
    }
    return isRiver ? 1.15 : 0.335;
  }

  function simulateLidarReading(dt, state, sensorY, surfaceY, isRiver, slantMeta = {}) {
    const thetaRad = slantMeta.thetaRad || 0;
    const thetaDeg = slantMeta.thetaDeg || 0;
    const slantComp = slantMeta.slantComp !== false;
    const trueVerticalDistM = Math.max(0.05, sensorY - surfaceY);
    const trueSlantDistanceM = Math.max(0.05, slantMeta.trueSlantDistanceM || trueVerticalDistM);
    const hitDryBank = Boolean(slantMeta.hitDryBank);

    const turbidity = state.turbidityMode || (isRiver ? 'silty' : 'clear');
    const sunGlare = clamp(state.sunGlare !== undefined ? Number(state.sunGlare) : 0.0, 0, 1);
    const nightMode = Boolean(state.nightMode);
    const rain = clamp(state.rainIntensity !== undefined ? Number(state.rainIntensity) : 0.0, 0, 1);
    const chop = clamp(
      isRiver
        ? state.windChop !== undefined
          ? Number(state.windChop)
          : 0.15
        : state.waveMakerPower !== undefined
          ? Number(state.waveMakerPower)
          : 0.25,
      0,
      1
    );

    // Turbidity optical model (Jannata et al.)
    let baseSnr = 76;
    let stdNoise = 0.0025;
    let turbidityBias = 0.001;
    if (turbidity === 'clear') {
      baseSnr = 58;
      stdNoise = 0.0038;
      turbidityBias = 0.0022;
    } else if (turbidity === 'silty') {
      baseSnr = 78;
      stdNoise = 0.0022;
      turbidityBias = 0.0008;
    } else if (turbidity === 'muddy') {
      baseSnr = 93;
      stdNoise = 0.0014;
      turbidityBias = 0.0;
    } else if (turbidity === 'dark') {
      baseSnr = nightMode ? 74 : 52;
      stdNoise = 0.0032;
      turbidityBias = 0.0016;
    }

    // Sun glare interference (Kupper et al.), grazing angle penalty & night NIR ambient clarity
    const effectiveGlare = nightMode ? 0.0 : sunGlare;
    const glarePenalty = effectiveGlare * 42.0;
    const nightBonus = nightMode ? 8.0 : 0.0;
    const rangePenalty = isRiver ? Math.max(0, trueSlantDistanceM - 1.2) * 1.4 : 0.0;
    const anglePenalty = (1.0 - Math.cos(thetaRad)) * 20.0;
    const rainPenalty = rain * 12.0;

    // Smooth signal strength ripple
    const snrRipple = Math.sin(simTime * 5.2) * 2.1 + Math.cos(simTime * 11.7) * 1.2;
    const snr = clamp(
      baseSnr - glarePenalty + nightBonus - rangePenalty - anglePenalty - rainPenalty + snrRipple,
      8,
      99
    );

    // Sun glare dropout bursts when effectiveGlare > 0.62
    if (dropoutTimer > 0) {
      dropoutTimer -= dt;
      if (dropoutTimer <= 0) inDropout = false;
    } else if (effectiveGlare > 0.62) {
      const pDropPerSec = Math.pow((effectiveGlare - 0.62) / 0.38, 1.8) * 1.25;
      if (Math.random() < pDropPerSec * dt) {
        inDropout = true;
        dropoutTimer = 0.16 + Math.random() * 0.24;
      }
    } else {
      inDropout = false;
    }

    // Ornstein-Uhlenbeck smooth sensor noise
    const extraJitter = (chop * 0.0025 + rain * 0.0035 + effectiveGlare * 0.0055) * (isRiver ? 1.8 : 0.65);
    const totalStd = stdNoise + extraJitter;
    const randWalk = (Math.random() * 2 - 1) * totalStd;
    smoothNoise += (randWalk - smoothNoise) * Math.min(1, dt * 8.0);

    // Note: in lab nominal clear mode at default waveMaker, keep bias mild so 35.8 cm reads clearly
    const bias = isRiver ? turbidityBias * 1.3 : turbidityBias * 0.12;
    const noisySlantDist = Math.max(0.04, trueSlantDistanceM + bias + smoothNoise);
    const rawLaserDistanceM = inDropout ? lastValidDistance : Math.round(noisySlantDist * 1000) / 1000;
    if (!inDropout) lastValidDistance = rawLaserDistanceM;

    // Apply optional slant-range trigonometric compensation: H_water = H_mount - (D_laser * cos(theta))
    const compensatedVerticalM = slantComp ? rawLaserDistanceM * Math.cos(thetaRad) : rawLaserDistanceM;
    const lidarDistanceM = Math.round(compensatedVerticalM * 1000) / 1000;

    const signalStrengthPct = inDropout ? Math.round(snr * 0.25) : Math.round(snr * 10) / 10;
    const signalStrength = Math.round((snr / 100) * 14200 * (inDropout ? 0.12 : 1.0));
    const waterLevelM = sensorY - lidarDistanceM;

    lastReading = {
      trueDistanceM: trueVerticalDistM,
      trueSlantDistanceM,
      rawLaserDistanceM,
      distanceM: lidarDistanceM,
      lidarDistanceM,
      waterLevelM,
      surfaceY,
      sensorHeightM: sensorY,
      thetaDeg,
      cameraIncidenceDeg: 0,
      slantCompEnabled: slantComp,
      hitDryBank,
      snr: signalStrengthPct,
      signalStrengthPct,
      signalStrength,
      valid: !inDropout,
      dropout: inDropout,
      errorM: lidarDistanceM - trueVerticalDistM,
      turbidityMode: turbidity,
      impactPoint: { x: 0, y: surfaceY, z: 0 },
      fovCenterPoint: { x: 0, y: surfaceY, z: 0 },
      timestamp: performance.now(),
    };

    return lastReading;
  }

  function updateFrustumGeometry(cameraPos, targetSurfaceY) {
    // Intersect 4 corner rays from pipCamera with horizontal water plane y = targetSurfaceY
    pipCamera.updateMatrixWorld();
    for (let i = 0; i < 4; i++) {
      const [nx, ny] = NDC_CORNERS[i];
      _rayCorner.set(nx, ny, 0.5).unproject(pipCamera).sub(cameraPos).normalize();
      const dy = _rayCorner.y;
      // Guard against near-horizontal rays
      const safeDy = dy < -0.08 ? dy : -0.08;
      const t = (targetSurfaceY - cameraPos.y) / safeDy;
      _corners[i].copy(cameraPos).addScaledVector(_rayCorner, Math.max(0.1, t));
      _corners[i].y = targetSurfaceY + 0.002;
    }

    // Fill 4 outward-facing triangles: (apex, c_{i+1}, c_i)
    let fIdx = 0;
    for (let i = 0; i < 4; i++) {
      const a = _corners[i];
      const b = _corners[(i + 1) % 4];
      frustumFacePos[fIdx++] = cameraPos.x;
      frustumFacePos[fIdx++] = cameraPos.y;
      frustumFacePos[fIdx++] = cameraPos.z;

      frustumFacePos[fIdx++] = b.x;
      frustumFacePos[fIdx++] = b.y;
      frustumFacePos[fIdx++] = b.z;

      frustumFacePos[fIdx++] = a.x;
      frustumFacePos[fIdx++] = a.y;
      frustumFacePos[fIdx++] = a.z;
    }
    frustumFaceGeom.attributes.position.needsUpdate = true;

    // Fill 8 line segments (4 pyramid edges + 4 footprint edges)
    let lIdx = 0;
    for (let i = 0; i < 4; i++) {
      const c = _corners[i];
      frustumLinePos[lIdx++] = cameraPos.x;
      frustumLinePos[lIdx++] = cameraPos.y;
      frustumLinePos[lIdx++] = cameraPos.z;
      frustumLinePos[lIdx++] = c.x;
      frustumLinePos[lIdx++] = c.y;
      frustumLinePos[lIdx++] = c.z;
    }
    for (let i = 0; i < 4; i++) {
      const a = _corners[i];
      const b = _corners[(i + 1) % 4];
      frustumLinePos[lIdx++] = a.x;
      frustumLinePos[lIdx++] = a.y;
      frustumLinePos[lIdx++] = a.z;
      frustumLinePos[lIdx++] = b.x;
      frustumLinePos[lIdx++] = b.y;
      frustumLinePos[lIdx++] = b.z;
    }
    frustumLineGeom.attributes.position.needsUpdate = true;

    // Footprint quad (2 triangles: c0-c1-c2, c0-c2-c3)
    const [c0, c1, c2, c3] = _corners;
    const fp = [c0, c1, c2, c0, c2, c3];
    for (let i = 0; i < 6; i++) {
      footprintPos[i * 3] = fp[i].x;
      footprintPos[i * 3 + 1] = fp[i].y;
      footprintPos[i * 3 + 2] = fp[i].z;
    }
    footprintGeom.attributes.position.needsUpdate = true;
  }

  function update(dt, state = {}, anchors = null, waterSampler = null) {
    const clampedDt = clamp(dt || 0.016, 0.001, 0.05);
    simTime += clampedDt;

    const isRiver =
      state.mode === 'river' ||
      state.phase === 'river' ||
      state.phase === 2 ||
      state.activeMode === 'river';
    const isLabPole = isRiver && state.riverMountMode === 'lab_pole';
    const isSidePole = isRiver && state.riverMountMode === 'side_pole';
    const isAnySidePole = isLabPole || isSidePole;

    const defaults = isRiver ? DEFAULT_RIVER_ANCHORS : DEFAULT_LAB_ANCHORS;
    const lidarPos = toVector3(anchors?.lidar || anchors?.mountAnchor, defaults.lidar);
    const camPos = toVector3(anchors?.camera || anchors?.cameraAnchor, defaults.camera);
    const irPos = toVector3(
      anchors?.ir,
      isRiver
        ? new THREE.Vector3(camPos.x + 0.35, camPos.y, camPos.z)
        : defaults.ir
    );

    const showOptics = state.showOptics !== false;
    const showLidar = showOptics && state.showLidarBeam !== false;
    const showFov = showOptics && state.showCameraFov !== false;

    // 1. Intersect TF-Luna LiDAR ray (vertical nadir or slant-angled) with water/bank surface
    const thetaDeg = isAnySidePole ? clamp(Number(state.riverLidarTiltDeg ?? 32), 0, 45) : 0;
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const slantComp = isAnySidePole ? state.riverLidarSlantComp !== false : true;
    _lidarDir.set(0, -Math.cos(thetaRad), Math.sin(thetaRad)).normalize();

    const wlEst = sampleWaterY(waterSampler, lidarPos.x, lidarPos.z, isRiver);
    let tHit = Math.max(0.1, (lidarPos.y - wlEst) / Math.max(0.2, -_lidarDir.y));
    let hitX = lidarPos.x;
    let hitZ = lidarPos.z;
    let waterAtHit = wlEst;
    let bedAtHit = -99;
    let hitSurfaceY = wlEst;
    for (let iter = 0; iter < 4; iter++) {
      hitX = lidarPos.x + _lidarDir.x * tHit;
      hitZ = lidarPos.z + _lidarDir.z * tHit;
      waterAtHit = sampleWaterY(waterSampler, hitX, hitZ, isRiver);
      bedAtHit = isRiver && typeof waterSampler?.getBedY === 'function' ? waterSampler.getBedY(hitZ) : -99;
      hitSurfaceY = Math.max(waterAtHit, bedAtHit);
      tHit = Math.max(0.1, (lidarPos.y - hitSurfaceY) / Math.max(0.2, -_lidarDir.y));
    }
    const hitDryBank = isRiver && bedAtHit > waterAtHit + 0.005;

    const reading = simulateLidarReading(clampedDt, state, lidarPos.y, hitSurfaceY, isRiver, {
      thetaRad,
      thetaDeg,
      slantComp,
      trueSlantDistanceM: tHit,
      hitDryBank,
    });

    // 2. Update Green TF-Luna LiDAR Beam & Impact Ring
    lidarGroup.visible = showLidar;
    if (showLidar) {
      const dist = reading.trueSlantDistanceM;
      const coreR = isRiver ? 0.015 : 0.0032;
      const glowR = isRiver ? 0.058 : 0.014;
      const spotR = isRiver ? 0.065 : 0.011;
      const ringBaseR = isRiver ? 0.28 : 0.036;

      _quat.setFromUnitVectors(_down, _lidarDir);
      lidarCoreMesh.position.copy(lidarPos);
      lidarCoreMesh.quaternion.copy(_quat);
      lidarCoreMesh.scale.set(coreR, dist, coreR);

      lidarGlowMesh.position.copy(lidarPos);
      lidarGlowMesh.quaternion.copy(_quat);
      lidarGlowMesh.scale.set(glowR, dist, glowR);

      glowMat.uniforms.uTime.value = simTime;
      const flicker = reading.dropout ? 0.18 : 1.0;
      coreMat.opacity = 0.92 * flicker;
      glowMat.uniforms.uIntensity.value = 0.48 * flicker;

      dotMat.color.setHex(hitDryBank ? 0xf59e0b : 0x80ffbb);
      impactGroup.position.set(hitX, hitSurfaceY + 0.002, hitZ);
      impactDot.scale.setScalar(spotR * (0.9 + 0.15 * Math.sin(simTime * 16.0)));
      dotMat.opacity = 0.95 * flicker;

      const phase1 = (simTime * 1.45) % 1;
      const phase2 = (simTime * 1.45 + 0.5) % 1;
      impactRing1.scale.setScalar(ringBaseR * (0.35 + 0.95 * phase1));
      ringMat1.opacity = (1.0 - phase1) * 0.85 * flicker;
      impactRing2.scale.setScalar(ringBaseR * (0.35 + 0.95 * phase2));
      ringMat2.opacity = (1.0 - phase2) * 0.85 * flicker;
    }

    // 3. Pose Pi Camera Module 3 NoIR & Crimson FOV Frustum
    const camTargetZ = isLabPole
      ? clamp(Number(state.labPoleCamTargetZ ?? -0.95), -2.2, 1.5)
      : isSidePole
        ? clamp(Number(state.sidePoleCamTargetZ ?? -1.2), -2.5, 1.5)
        : 0.0;
    const camTargetX = isLabPole
      ? camPos.x
      : isSidePole
        ? camPos.x + 0.20
        : isRiver
          ? 0.85
          : camPos.x;
    const camCenterSurfaceY = sampleWaterY(waterSampler, camTargetX, camTargetZ, isRiver);

    _camTarget.set(camTargetX, camCenterSurfaceY, camTargetZ);
    _camDir.subVectors(_camTarget, camPos).normalize();
    const cameraIncidenceDeg = (Math.acos(clamp(-_camDir.y, -1, 1)) * 180) / Math.PI;
    reading.cameraIncidenceDeg = Number(cameraIncidenceDeg.toFixed(1));

    pipCamera.near = isRiver ? 0.2 : 0.06;
    pipCamera.far = isRiver ? 28.0 : 4.0;
    pipCamera.updateProjectionMatrix();
    pipCamera.position.copy(camPos);
    pipCamera.up.copy(isAnySidePole ? _sidePoleCamUp : _camUp);
    pipCamera.lookAt(_camTarget);
    pipCamera.updateMatrixWorld();

    frustumGroup.visible = showFov;
    if (showFov) {
      updateFrustumGeometry(camPos, camCenterSurfaceY);
      const pulse = 0.82 + 0.12 * Math.sin(simTime * 3.0);
      frustumLineMat.opacity = pulse;
      frustumFaceMat.opacity = state.nightMode ? 0.16 : 0.11;
    }

    // 4. 850 nm IR Illuminator Volumetric Cone (Night Mode)
    const irTargetAlpha = showOptics && state.nightMode ? 1.0 : 0.0;
    irFade += (irTargetAlpha - irFade) * Math.min(1, clampedDt * 6.0);
    irConeMesh.visible = irFade > 0.01;
    if (irConeMesh.visible) {
      _irDir.subVectors(_camTarget, irPos);
      const irLen = Math.max(0.1, _irDir.length());
      _irDir.normalize();
      _quat.setFromUnitVectors(_down, _irDir);

      irConeMesh.position.copy(irPos);
      irConeMesh.quaternion.copy(_quat);
      const coneSpread = isAnySidePole ? irLen * 0.65 : isRiver ? irLen * 0.72 : irLen * 0.85;
      irConeMesh.scale.set(coneSpread, irLen, coneSpread);
      irConeMat.uniforms.uTime.value = simTime;
      irConeMat.uniforms.uIntensity.value = irFade;
    }

    reading.impactPoint = { x: hitX, y: hitSurfaceY, z: hitZ };
    reading.fovCenterPoint = { x: _camTarget.x, y: _camTarget.y, z: _camTarget.z };

    return reading;
  }

  function renderPip(scene) {
    if (!renderer || !scene) return;
    const prevFrustumVis = frustumGroup.visible;
    const prevIrVis = irConeMesh.visible;
    const prevCoreVis = lidarCoreMesh.visible;
    const prevGlowVis = lidarGlowMesh.visible;

    // Hide frustum overlay & beam cylinder from Pi Camera's own lens while keeping green water dot visible
    frustumGroup.visible = false;
    irConeMesh.visible = false;
    lidarCoreMesh.visible = false;
    lidarGlowMesh.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(pipRenderTarget);
    renderer.clear();
    renderer.render(scene, pipCamera);
    renderer.setRenderTarget(prevTarget);

    frustumGroup.visible = prevFrustumVis;
    irConeMesh.visible = prevIrVis;
    lidarCoreMesh.visible = prevCoreVis;
    lidarGlowMesh.visible = prevGlowVis;
  }

  function projectWorldToPip(vec3) {
    if (!vec3) {
      return { x: 0, y: 0, u: 0, v: 0, visible: false, inBounds: false, depthM: 0 };
    }
    _projScratch.set(vec3.x, vec3.y, vec3.z);
    const depthM = _projScratch.distanceTo(pipCamera.position);
    _projScratch.project(pipCamera);

    const u = (_projScratch.x + 1) * 0.5;
    const v = (1 - _projScratch.y) * 0.5;
    const visible =
      _projScratch.z >= -1 &&
      _projScratch.z <= 1 &&
      u >= 0 &&
      u <= 1 &&
      v >= 0 &&
      v <= 1;

    return {
      x: u * PIP_WIDTH,
      y: v * PIP_HEIGHT,
      u,
      v,
      ndcX: _projScratch.x,
      ndcY: _projScratch.y,
      ndcZ: _projScratch.z,
      visible,
      inBounds: visible,
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      depthM,
    };
  }

  function getLidarReading() {
    return lastReading;
  }

  function dispose() {
    pipRenderTarget.dispose();
    coreGeom.dispose();
    coreMat.dispose();
    glowGeom.dispose();
    glowMat.dispose();
    impactDot.geometry.dispose();
    dotMat.dispose();
    impactRing1.geometry.dispose();
    ringMat1.dispose();
    impactRing2.geometry.dispose();
    ringMat2.dispose();
    frustumFaceGeom.dispose();
    frustumFaceMat.dispose();
    frustumLineGeom.dispose();
    frustumLineMat.dispose();
    footprintGeom.dispose();
    footprintMat.dispose();
    irConeGeom.dispose();
    irConeMat.dispose();
  }

  return {
    group,
    pipRenderTarget,
    pipCamera,
    update,
    renderPip,
    projectWorldToPip,
    getLidarReading,
    dispose,
  };
}

  return { createSensorOptics };
})(THREE);

/* === MODULE: src/sim/pipelineModel.js === */
RiverSimModules.pipelineModel = (function () {
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
    waterLevelM: 0.345,
    surfaceVelocityMs: 0.28,
    dischargeM3s: 0.00145,
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

function createPhaseAccumulator() {
  return {
    samples: 0,
    wlSumAbsErr: 0,
    wlSumSqErr: 0,
    wlSumBias: 0,
    wlMaxAbsErrM: 0,
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

    nExp: 0,
    nRec: 0,
    invalidCount: 0,
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
        estimatedVs: 0.24,
        referenceVr: 0.24,
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
        tableXPass: true,
        tableXRule: '>= 90% exact match',
        detections: [],
        missed: [],
      },
      edgeStorage: {
        wifiOnline: true,
        queuedCount: 0,
        microSdRecords: 0,
        ssdUsedMB: 42.6,
        expectedRecords: 0,
        receivedRecords: 0,
        missingOrInvalid: 0,
        tsrPct: 100,
        tableXPass: true,
        tableXRule: 'TSR >= 90%',
        processingLatencyMs: 185,
        uploadStatus: 'SYNCED',
      },
      functionalityChecks: [
        { name: 'Data acquisition', criterion: 'Reading & video logged on schedule', status: 'PASS' },
        { name: 'Timestamping', criterion: 'DS3231 RTC drift < 100 ms', status: 'PASS' },
        { name: 'Server-side processing', criterion: 'WL, Vs, Q & YOLOv8 outputs ready', status: 'PASS' },
        { name: 'Database storage', criterion: 'Local SQLite & remote sync match', status: 'PASS' },
        { name: 'Dashboard display', criterion: 'HUD values match stored telemetry', status: 'PASS' },
      ],
      loraPayload: encodeLoRa12BytePayload({
        mountMode: 'lab_gantry',
        waterLevelM: 0.335,
        distanceM: 0.358,
        velocityMs: 0.24,
        dischargeM3s: 0.00118,
        debrisCount: 0,
        slantComp: true,
        valid: true,
        nightMode: false,
        hitDryBank: false,
      }),
      alerts: [],
      newAlerts: [],
    };
  }

  function encodeLoRa12BytePayload({
    mountMode = 'bridge',
    waterLevelM = 0,
    distanceM = 0,
    velocityMs = 0,
    dischargeM3s = 0,
    debrisCount = 0,
    slantComp = true,
    valid = true,
    nightMode = false,
    hitDryBank = false,
  }) {
    const modeCode =
      mountMode === 'lab_pole'
        ? 3
        : mountMode === 'side_pole'
          ? 2
          : mountMode === 'bridge'
            ? 1
            : 0;
    const flags =
      (modeCode & 0x03) |
      (slantComp ? 0x04 : 0) |
      (valid ? 0x08 : 0) |
      (nightMode ? 0x10 : 0) |
      (hitDryBank ? 0x20 : 0);

    const wlMm = clamp(Math.round((Number(waterLevelM) || 0) * 1000), 0, 65535);
    const distMm = clamp(Math.round((Number(distanceM) || 0) * 1000), 0, 65535);
    const velMms = clamp(Math.round((Number(velocityMs) || 0) * 1000), 0, 65535);
    // 24-bit unsigned discharge in units of 1e-5 m^3/s (0.01 L/s resolution, up to 167.77 m^3/s)
    const qScaled = clamp(Math.round((Number(dischargeM3s) || 0) * 100000), 0, 16777215);
    const nsByte = clamp(Math.round(Number(debrisCount) || 0), 0, 255);

    const buf = new Uint8Array(12);
    buf[0] = flags & 0xff;
    buf[1] = (wlMm >> 8) & 0xff;
    buf[2] = wlMm & 0xff;
    buf[3] = (distMm >> 8) & 0xff;
    buf[4] = distMm & 0xff;
    buf[5] = (velMms >> 8) & 0xff;
    buf[6] = velMms & 0xff;
    buf[7] = (qScaled >> 16) & 0xff;
    buf[8] = (qScaled >> 8) & 0xff;
    buf[9] = qScaled & 0xff;
    buf[10] = nsByte;

    // CRC-8 (poly 0x07) over payload bytes 0..10
    let crc = 0x00;
    for (let i = 0; i < 11; i++) {
      crc ^= buf[i];
      for (let b = 0; b < 8; b++) {
        crc = (crc & 0x80) ? (((crc << 1) ^ 0x07) & 0xff) : ((crc << 1) & 0xff);
      }
    }
    buf[11] = crc & 0xff;

    const hexParts = Array.from(buf, (b) => b.toString(16).toUpperCase().padStart(2, '0'));
    return {
      bytes: Array.from(buf),
      byteLength: 12,
      hex: hexParts.join(' '),
      compactHex: hexParts.join(''),
      crc8Hex: hexParts[11],
      flagsByte: buf[0],
      waterMm: wlMm,
      distanceMm: distMm,
      velocityMms: velMms,
      dischargeScaled: qScaled,
      debrisCount: nsByte,
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

  function computeSensitivitySweep(isRiver, wlRef, vsEst, areaBase, topWidthM, currentK) {
    const ks = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
    const deltaWL = 0.05;
    const widthEff = Math.max(0.2, topWidthM || (isRiver ? 7.5 : 0.35));
    const areaLow = Math.max(0.002, areaBase - widthEff * deltaWL);
    const areaHigh = areaBase + widthEff * deltaWL;

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
    const uncertaintyBandPct =
      currentQ > 1e-7 ? ((0.5 * (deltaQOverK + deltaQOverWL)) / currentQ) * 100 : 0;

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
    const isNightScene = Boolean(state?.timeOfDay === 'night' || turbidity === 'dark');
    const irActive = Boolean(state?.nightMode);

    // Filter ground truth particles inside camera FOV
    const fovParticles = (visibleParticles || []).filter((p) => p && p.inFov !== false);
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
      rawLaserDistanceM = Math.max(0.05, trueSlantD + turbBias * scaleFactor + waveOsc + jitter);
      rawDistanceM = slantComp ? rawLaserDistanceM * Math.cos(thetaRad) : rawLaserDistanceM;

      const baseSnr =
        turbidity === 'muddy'
          ? 91
          : turbidity === 'silty'
            ? 79
            : turbidity === 'dark'
              ? 75
              : 54;
      signalStrengthPct = clamp(
        baseSnr - glare * 36 - rain * 10 - (1 - Math.cos(thetaRad)) * 18 + (hash01(frameTick, 31) - 0.5) * 6,
        12,
        99
      );
      readingValid = !(glare > 0.78 && hash01(frameTick, 53) < (glare - 0.72) * 1.6);
    }

    const inRange = trueSlantD >= 0.20 && trueSlantD <= 8.00;
    if (!inRange) {
      readingValid = false;
    }

    if (readingValid) {
      lastValidLidarM = rawDistanceM;
      lidarWindow.push(rawDistanceM);
      if (lidarWindow.length > 10) lidarWindow.shift();
    } else if (lidarWindow.length === 0) {
      lidarWindow.push(trueD);
    }

    const filteredDistanceM = medianOf(lidarWindow.length ? lidarWindow : [lastValidLidarM]);
    const calcWlRaw = H - filteredDistanceM;
    smoothedWL = smoothedWL === null ? calcWlRaw : smoothedWL + (calcWlRaw - smoothedWL) * Math.min(1, safeDt * 10);
    const calculatedWL = smoothedWL;

    const wlErrorM = calculatedWL - trueWL;
    const wlAbsErrorM = Math.abs(wlErrorM);
    const wlAbsErrorCm = wlAbsErrorM * 100;
    const distPctError = trueD > 1e-6 ? (Math.abs(filteredDistanceM - trueD) / trueD) * 100 : 0;
    const tableXRule = trueSlantD <= 3.0 ? '<= 6.0 cm (0.2-3 m)' : '<= 2.0% (3-8 m)';
    const wlTableXPass = !inRange
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

    // 2. PyORC / LSPIV Surface Velocity Vs & Discharge Q = k * Vs * A
    const trueVs = Number(hydraulicsMetrics?.trueSurfaceVelocity ?? (isRiver ? 1.2 : 0.24));
    const fovCount = (visibleParticles || []).filter((p) => p && p.inFov !== false).length;
    const isNightScene = Boolean(state?.timeOfDay === 'night' || turbidity === 'dark');
    const irActive = Boolean(state?.nightMode);

    let lspivRelBias = 0.0;
    if (fovCount < 2) lspivRelBias -= 0.065; // sparse tracers (Tlhomole et al. 2025)
    if (isNightScene && !irActive) lspivRelBias -= 0.24; // unlit night footage degrades PIV
    if (glare > 0.45) lspivRelBias -= glare * 0.07;
    if (isAnySidePole && state?.showGcpGrid === false) lspivRelBias -= 0.14; // unrectified oblique perspective
    const gcpUncert = state?.showGcpGrid === false ? (isAnySidePole ? 0.065 : 0.042) : (isAnySidePole ? 0.028 : 0.024);
    const lspivNoise = (hash01(Math.floor(simClock * 4), 73) - 0.5) * 2.0 * (gcpUncert + rain * 0.03);
    const targetVs = Math.max(0, trueVs * (1 + lspivRelBias + lspivNoise));
    smoothedVs = smoothedVs === null ? targetVs : smoothedVs + (targetVs - smoothedVs) * Math.min(1, safeDt * 6);
    const estimatedVs = smoothedVs;

    const vErrorMs = estimatedVs - trueVs;
    const vPctError = trueVs > 1e-4 ? (Math.abs(vErrorMs) / trueVs) * 100 : 0;

    const wettedAreaM2 = Number(hydraulicsMetrics?.wettedAreaM2 ?? (isRiver ? 10.5 : 0.01575));
    const k = clamp(Number(state?.velocityCoeffK ?? 0.85), 0.70, 0.95);
    const estimatedQ = k * estimatedVs * wettedAreaM2;
    const referenceQ = Number(hydraulicsMetrics?.trueVolumetricQ ?? (k * trueVs * wettedAreaM2));
    const qErrorM3s = estimatedQ - referenceQ;
    const qPctError = referenceQ > 1e-7 ? (Math.abs(qErrorM3s) / referenceQ) * 100 : 0;

    // 3. YOLOv8 Debris Detection & Classification Metrics
    const yolo = evaluateYoloFrame(visibleParticles, state, isRiver);

    // 4. Accumulate Phase Statistics (at ~4 Hz cadence to avoid frame-rate dependence)
    const acc = accumulators[phaseKey];
    if (statsClock >= 0.25) {
      statsClock = 0;
      acc.samples++;
      acc.wlSumAbsErr += wlAbsErrorM;
      acc.wlSumSqErr += wlErrorM * wlErrorM;
      acc.wlSumBias += wlErrorM;
      if (wlAbsErrorM > acc.wlMaxAbsErrM) acc.wlMaxAbsErrM = wlAbsErrorM;
      if (wlTableXPass) acc.wlPassCount++;

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
    }

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

    // 5. DS3231 RTC, Local SQLite/SSD Buffering & Cloud Upload (TSR%)
    const nowDate = new Date();
    rtcDriftMs = 0.65 + 0.35 * Math.sin(simClock * 0.25);
    const rtcLabel = formatRtcLabel(nowDate);
    const rtcIso = nowDate.toISOString();

    if (pipelineActive && uploadClock >= 1.0) {
      uploadClock = 0;
      acc.nExp++;
      microSdRecords++;
      ssdUsedMB += isRiver ? 0.42 : 0.18;

      processingLatencyMs = Math.round(
        (isRiver ? 420 : 175) + yolo.nr * 9 + (wifiOnline ? 35 : 0) + hash01(acc.nExp, 11) * 45
      );

      const tsrPreview = acc.nExp > 0 ? (acc.nRec / acc.nExp) * 100 : 100;
      const telemetryPacket = {
        trialId: `${phaseKey === 'phase1' ? 'LAB' : 'GMB'}-${String(acc.nExp).padStart(4, '0')}`,
        phase: phaseKey,
        timestamp: rtcIso,
        lidarDistanceM: Number(filteredDistanceM.toFixed(4)),
        waterLevelM: Number(calculatedWL.toFixed(4)),
        surfaceVelocityMs: Number(estimatedVs.toFixed(4)),
        dischargeM3s: Number(estimatedQ.toFixed(6)),
        debrisCount: yolo.ns,
        tsrPct: Number(tsrPreview.toFixed(2)),
        alerts: pendingNewAlerts,
        refWaterLevelM: Number(trueWL.toFixed(4)),
        wlAbsErrorCm: Number(wlAbsErrorCm.toFixed(2)),
        refVelocityMs: Number(trueVs.toFixed(4)),
        wettedAreaM2: Number(wettedAreaM2.toFixed(4)),
        debrisRefNr: yolo.nr,
        precisionPct: Number(precisionPct.toFixed(1)),
        recallPct: Number(recallPct.toFixed(1)),
        f1Pct: Number(f1Pct.toFixed(1)),
        turbidityMode: turbidity,
        wifiOnline,
      };
      pendingNewAlerts = [];

      if (wifiOnline) {
        if (!readingValid && !inRange) {
          acc.invalidCount++;
        } else {
          acc.nRec++;
          cloudSyncedRecords++;
        }
        // Batch drain any records buffered in SQLite/SSD during an earlier Wi-Fi outage
        let drained = 0;
        let lastDrained = null;
        while (offlineQueue.length > 0 && drained < 4) {
          const queuedItem = offlineQueue.shift();
          acc.nRec++;
          cloudSyncedRecords++;
          drained++;
          lastDrained = queuedItem;
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
    const missingOrInvalid = Math.max(0, acc.nExp - acc.nRec);

    // 6. Sensitivity Sweep (Objective 5A / Table 7)
    latestSensitivity = computeSensitivitySweep(
      isRiver,
      trueWL,
      estimatedVs,
      wettedAreaM2,
      hydraulicsMetrics?.topWidthM,
      k
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
      mountMode: activeMountModeKey,
      waterLevelM: calculatedWL,
      distanceM: filteredDistanceM,
      velocityMs: estimatedVs,
      dischargeM3s: estimatedQ,
      debrisCount: yolo.ns,
      slantComp,
      valid: readingValid,
      nightMode: irActive,
      hitDryBank: Boolean(lidarReading?.hitDryBank),
    });

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
        tableXPass: exactMatchPct >= 90.0,
        tableXRule: '>= 90% exact match',
        detections: yolo.detections,
        missed: yolo.missed,
      },
      edgeStorage: {
        wifiOnline,
        queuedCount: offlineQueue.length,
        microSdRecords,
        cloudSyncedRecords,
        ssdUsedMB: Number(ssdUsedMB.toFixed(1)),
        expectedRecords: acc.nExp,
        receivedRecords: acc.nRec,
        missingOrInvalid,
        tsrPct,
        tableXPass: tsrPct >= 90.0,
        tableXRule: 'TSR >= 90%',
        processingLatencyMs,
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
        },
        {
          name: 'Timestamping',
          criterion: 'DS3231 RTC drift < 100 ms',
          status: Math.abs(rtcDriftMs) < 100 ? 'PASS' : 'FAIL',
        },
        {
          name: 'Server-side processing',
          criterion: 'WL, Vs, Q & YOLOv8 outputs ready',
          status: readingValid ? 'PASS' : 'DEGRADED',
        },
        {
          name: 'Database storage',
          criterion: 'Browser localStorage & edge queue match',
          status: wifiOnline ? 'PASS' : 'BUFFERED',
        },
        {
          name: 'Dashboard display',
          criterion: 'HUD metrics match telemetry store',
          status: 'PASS',
        },
      ],
      loraPayload,
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
      tsrPct: acc.nExp > 0 ? (acc.nRec / acc.nExp) * 100 : 100,
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

  return {
    step,
    getSnapshot,
    getTrialLogs,
    getSensitivityData,
    captureTrial,
    resetLogs,
  };
}

  return { getDefaultThresholds, createPipelineModel };
})();

/* === MODULE: src/ui/timelineController.js === */
RiverSimModules.timelineController = (function () {
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
    subtitle: 'Exploded IP65 CAD: 12V LiFePO4 -> 5A Fuse -> 5.1V/12V Buck -> Pi 3B & DS3231',
    cameraPreset: 'exploded_cad',
  },
  {
    index: 1,
    startSec: 10,
    endSec: 22,
    shortLabel: '1. Pump & Weir',
    title: 'Pump Startup & Stepped Weir Cascade',
    subtitle: 'Submersible pump primes blue PVC riser -> red valve opens -> Steps 1->2->3->Basin',
    cameraPreset: 'video_replica',
  },
  {
    index: 2,
    startSec: 22,
    endSec: 33,
    shortLabel: '2. LiDAR Range',
    title: 'TF-Luna LiDAR Ranging (WL = H - D)',
    subtitle: 'Green ToF laser locks onto Step 1 at 35.8 cm with live signal histogram & waveform',
    cameraPreset: 'video_replica',
  },
  {
    index: 3,
    startSec: 33,
    endSec: 44,
    shortLabel: '3. NoIR + 850nm IR',
    title: 'NoIR Camera + 850 nm IR & Debris Injection',
    subtitle: 'Crimson FOV frustum & foam tracers cascade across Day -> Night 850 nm IR sweep',
    cameraPreset: 'video_replica',
  },
  {
    index: 4,
    startSec: 44,
    endSec: 53,
    shortLabel: '4. Buffer & Sync',
    title: 'Local SQLite/SSD Buffering & Wi-Fi Upload',
    subtitle: 'Simulated Wi-Fi outage queues RTC-stamped records, then reconnects & recovers TSR%',
    cameraPreset: 'exploded_cad',
  },
  {
    index: 5,
    startSec: 53,
    endSec: 63,
    shortLabel: '5. Analytics & Alert',
    title: 'PyORC/LSPIV + YOLOv8 & Threshold Email Alert',
    subtitle: 'High-flow valve surge breaches Q & debris thresholds -> automated Email Alert toast',
    cameraPreset: 'video_replica',
  },
  {
    index: 6,
    startSec: 63,
    endSec: 75,
    shortLabel: '6. Guimbal River',
    title: 'Phase 2 Real River Twin (Guimbal River, Iloilo)',
    subtitle: 'Bridge-mounted station over surveyed bathymetry A(WL), Monsoon Hydrograph & GCP grid',
    cameraPreset: 'river_cross_section',
  },
];

const TOTAL_TIMELINE_DURATION_S = 75.0;

function createTimelineController(state, callbacks = {}) {
  let currentTime = 0;
  let playing = false;
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
        waterLevelM: 0.343,
        surfaceVelocityMs: 0.28,
        dischargeM3s: 0.00145,
        debrisCount: 8,
      };
    } else if (stage.index === 6) {
      // Stage 6: Phase 2 Real River Twin (Guimbal River, Iloilo)
      state.mode = 'river';
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
    };
  }

  function play() {
    if (currentTime >= TOTAL_TIMELINE_DURATION_S - 0.05) {
      currentTime = 0;
      lastStageIndex = -1;
      lastSubPhaseCam = null;
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

  function update(dt) {
    if (!playing) {
      return getCurrentStageInfo();
    }
    const safeDt = clamp(dt || 0.016, 0, 0.2);
    currentTime += safeDt;
    if (currentTime >= TOTAL_TIMELINE_DURATION_S) {
      currentTime = TOTAL_TIMELINE_DURATION_S;
      applyStateAtTime(currentTime, false);
      pause();
    } else {
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
    getCurrentStageInfo,
    getStages: () => TIMELINE_STAGES.map((s) => ({ ...s })),
    isPlaying: () => playing,
  };
}

  return { TIMELINE_STAGES, TOTAL_TIMELINE_DURATION_S, createTimelineController };
})();

/* === MODULE: src/ui/videoHud.js === */
RiverSimModules.videoHud = (function () {
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
      bottom: 84px;
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
    const w = histCanvas.width;
    const h = histCanvas.height;
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
    const w = waveCanvas.width;
    const h = waveCanvas.height;
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

    // Soft area fill below trace
    waveCtx.lineTo(w - 5, h - 4);
    waveCtx.lineTo(5, h - 4);
    waveCtx.closePath();
    const grad = waveCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
    waveCtx.fillStyle = grad;
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
      return;
    }

    const nowMs = performance.now();
    if (nowMs - lastPipRefreshMs < 38) return; // ~26 Hz PIP capture
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
  }

  function approxRiverBedY(z) {
    const az = Math.abs(z);
    if (az >= 6.0) return 3.20;
    const shifted = z - 0.25;
    const innerBowl = 0.92 * Math.pow(clamp(Math.abs(shifted) / 5.45, 0, 1.05), 1.95);
    const wallT = clamp((az - 5.42) / (6.0 - 5.42), 0, 1);
    const wallSmooth = wallT * wallT * (3 - 2 * wallT);
    return clamp(innerBowl + (3.20 - innerBowl) * wallSmooth, 0.0, 3.20);
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
    const waterY = snapshot?.waterLevel?.referenceM ?? (isRiver ? 1.15 : 0.335);
    const vs = snapshot?.velocity?.estimatedVs ?? (isRiver ? 1.2 : 0.24);

    // 1. Optional GCP ortho-rectification grid lines (Bridge Rectangle vs Side-Pole Trapezoidal H_gcp)
    if (state?.showGcpGrid !== false && isRiver) {
      pipOverlayCtx.strokeStyle = isAnySidePole ? 'rgba(56, 189, 248, 0.45)' : 'rgba(250, 204, 21, 0.32)';
      pipOverlayCtx.lineWidth = 1;
      if (isAnySidePole) {
        const c1 = isLabPole ? { x: 0.20, z: -3.55, id: 'GCP-1' } : { x: -0.30, z: -4.6, id: 'GCP-1' };
        const c2 = isLabPole ? { x: 4.10, z: -3.55, id: 'GCP-2' } : { x: 4.50, z: -4.6, id: 'GCP-2' };
        const c3 = isLabPole ? { x: -1.60, z: 4.80, id: 'GCP-3' } : { x: -1.90, z: 4.6, id: 'GCP-3' };
        const c4 = isLabPole ? { x: 5.90, z: 4.80, id: 'GCP-4' } : { x: 6.10, z: 4.6, id: 'GCP-4' };
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
        // Highlight GCP-1..4 trapezoidal perspective markers
        pipOverlayCtx.font = 'bold 8.5px monospace';
        for (const corner of [c1, c2, c3, c4]) {
          const wy = Math.max(waterY + 0.04, approxRiverBedY(corner.z) + 0.14);
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
        const xs = [-1.2, -0.2, 0.8, 1.8, 2.8];
        const zs = [-1.8, -0.9, 0.0, 0.9, 1.8];
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
            ? [-1.3, -0.65, 0.0, 0.65, 1.3]
            : [-0.10, -0.03, 0.04, 0.11];
      const vecDt = isRiver ? 0.42 : 0.24;
      const maxSpeedRef = isRiver ? Math.max(1.8, vs * 1.35) : Math.max(0.35, vs * 1.4);

      for (const gx of gxList) {
        for (const gz of gzList) {
          if (isRiver && approxRiverBedY(gz) >= waterY - 0.06) continue;
          // Local lateral speed profile (faster near central thalweg)
          const zNorm = isRiver ? Math.abs(gz) / (isAnySidePole ? 4.2 : 2.2) : Math.abs(gz) / 0.18;
          const profileFactor = clamp(1.12 - 0.35 * zNorm * zNorm, 0.35, 1.15);
          const localSpeed = vs * profileFactor;
          const localY = !isRiver && gx > -0.08 ? (gx > 0.11 ? 0.205 : 0.270) : waterY;

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
      // Lightweight perspective/view projection using Three Vector3 math if clone available
      const v = cam.position.clone().set(wx, wy, wz).project(cam);
      const visible = v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
      return {
        x: (v.x * 0.5 + 0.5) * vw,
        y: (-v.y * 0.5 + 0.5) * vh,
        visible,
      };
    };

    const lidarRect = lidarCard.getBoundingClientRect();
    const camRect = camCard.getBoundingClientRect();

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

    renderHistogram(lidar.histogramBins || []);
    renderDistanceWaveform(lidar.waveformCm || []);

    // 2. Camera NoIR PIP Card
    const isNight = Boolean(state?.nightMode);
    camTitle.textContent = isNight ? 'Camera NoIR: 850nm IR' : 'Camera NoIR: STREAMING';
    camDot.className = isNight ? 'vhud-dot noir' : 'vhud-dot';

    if (!pipCollapsed) {
      copyPipRenderTarget(sensorOptics, renderer, scene, isNight);
      drawPipOverlays(state, snapshot, sensorOptics);
    }

    const vs = snapshot.velocity.estimatedVs;
    const q = snapshot.discharge.estimatedQ;
    const qStr = q < 0.05 ? q.toFixed(4) : q.toFixed(2);
    pivSummary.textContent = `Vs: ${vs.toFixed(2)} m/s | Q: ${qStr} m³/s`;
    yoloSummary.textContent = `Ns: ${snapshot.debris.systemCountNs}/${snapshot.debris.manualCountNr} | F1: ${snapshot.debris.f1Pct.toFixed(0)}%`;

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

  return { createVideoHud };
})();

/* === MODULE: src/ui/dashboardPanel.js === */
RiverSimModules.dashboardPanel = (function ({ getDefaultThresholds }, { TIMELINE_STAGES, TOTAL_TIMELINE_DURATION_S }) {
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
  { id: 'video_replica', label: 'Video Replica' },
  { id: 'side_profile', label: 'Side Profile' },
  { id: 'overhead_gantry', label: 'Overhead Gantry' },
  { id: 'exploded_cad', label: 'Exploded IP65 CAD' },
  { id: 'hydraulic_cutaway', label: 'Hydraulic Cutaway' },
  { id: 'noir_pov', label: 'NoIR Camera POV' },
  { id: 'river_cross_section', label: 'River Cross-Section' },
  { id: 'gcp_aerial', label: 'GCP Aerial' },
];

const TABLE3_PINOUT = [
  { id: 'BT1', comp: 'BT1: 12V LiFePO4 w/ BMS', pin: '+ / -', target: 'F1 Pin 1 / Common GND' },
  { id: 'F1', comp: 'F1: 5A Inline Fuse', pin: 'Pin 1 / Pin 2', target: 'BT1 + / PS1 IN+ & PS2 VIN+' },
  { id: 'PS1', comp: 'PS1: LM2596 Buck (5.1V)', pin: 'IN+ / OUT+', target: 'F1 Pin 2 / Pi 5V & TF-Luna VCC' },
  { id: 'PS2', comp: 'PS2: DC-DC Buck-Boost (12V)', pin: 'VIN+ / OUT+', target: 'F1 Pin 2 / 850nm IR Illuminator VCC' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'GPIO 2, 3 (I2C)', target: 'U4 DS3231 SDA, SCL (3V3)' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'GPIO 14, 15 (UART)', target: 'U2 TF-Luna RX, TX (5V)' },
  { id: 'U1', comp: 'U1: Raspberry Pi 3 Model B', pin: 'CSI / USB / SDIO', target: 'U3 Cam 3 NoIR / SATA SSD / 32GB microSD' },
  { id: 'U2', comp: 'U2: Benewake TF-Luna LiDAR', pin: 'VCC, GND, TX, RX', target: 'PS1 5V, GND, GPIO15, GPIO14' },
  { id: 'U4', comp: 'U4: DS3231 RTC Module', pin: 'VCC, GND, DAT, CLK', target: 'Pi 3V3, GND, GPIO2, GPIO3' },
  { id: 'IR1', comp: 'IR Illuminator (850 nm)', pin: 'VCC / GND', target: 'PS2 OUT+ (12V) / Common GND' },
  { id: 'AP1', comp: 'AP1: Wi-Fi Router / AP', pin: '2.4 GHz WLAN', target: 'Separately Powered Wireless Uplink' },
];

const THESIS_BOM = [
  { item: 'Raspberry Pi 3 Model B (1 GB)', qty: '1', cost: '₱4,849', spec: 'BCM2837, 40-pin GPIO, CSI, Wi-Fi' },
  { item: 'Pi Camera Module 3 NoIR', qty: '1', cost: '₱2,191', spec: 'Sony IMX708 11.9MP, No IR-Cut, CSI-2' },
  { item: '850 nm IR Illuminator (4-LED)', qty: '1', cost: '₱517', spec: '12V DC, 10–40 m Night Vision' },
  { item: 'Benewake TF-Luna ToF LiDAR', qty: '1', cost: '₱1,650', spec: '0.2–8 m Range, UART, 850 nm ToF' },
  { item: 'Custom Aquarium w/ Pump', qty: '1', cost: '₱6,500', spec: 'Stepped-Weir Flume + Submersible Pump' },
  { item: 'Aquarium Wave Makers', qty: '2', cost: '₱420', spec: 'Controlled Surface Turbulence' },
  { item: '32 GB microSD Card (Class 10)', qty: '1', cost: '₱399', spec: 'Raspberry Pi OS & Local Logs' },
  { item: 'DS3231 Precision RTC Module', qty: '1', cost: '₱180', spec: 'I2C TCXO + CR2032 Backup' },
  { item: 'External 2.5" SATA SSD', qty: '1', cost: '₱2,003', spec: 'USB 2.0 Video & SQLite Archive' },
  { item: 'LM2596 DC-DC Buck Converter', qty: '1', cost: '₱125', spec: 'Regulated 5.1 V DC Rail' },
  { item: '12V Regulated DC-DC Converter', qty: '1', cost: '₱155', spec: 'Buck-Boost for 850nm IR Array' },
  { item: '3S2P Li-ion / LiFePO4 Battery', qty: '1', cost: '₱547', spec: '12V Pack w/ 3S BMS (~6 Ah)' },
  { item: '5 A Inline Fuse Holder', qty: '1', cost: '₱50', spec: 'Battery Positive Overcurrent Guard' },
  { item: 'PVC/Al Mounting Bracket', qty: '1', cost: '₱384', spec: 'Height & Angle Adjustable Gantry' },
  { item: 'IP65 Weatherproof Enclosures', qty: '2', cost: 'Custom', spec: 'Dust & Water-Jet Protected CAD' },
  { item: 'JST GH 1.25mm & Harnesses', qty: '2', cost: '₱153', spec: 'Color-Coded Power & Sensor Bus' },
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
    <!-- TOP BAR: Drawer Toggle, Phase Mode Switcher & 8 Camera Presets -->
    <header class="top-bar">
      <div class="top-bar-group">
        <button type="button" class="btn active" data-act="toggle-drawer" title="Show/Hide Left Controls & Thesis Drawer">☰ Studio Panel</button>
        <div class="dash-sep"></div>
        <button type="button" class="btn active" data-mode="lab">Phase 1: Controlled Lab Tank</button>
        <button type="button" class="btn" data-mode="river">Phase 2: Guimbal River (Field)</button>
      </div>
      <div class="top-bar-group">
        <div class="dash-preset-strip" data-el="preset-strip">
          ${CAMERA_PRESETS.map(
            (p) => `<button type="button" class="btn dash-preset-btn" data-preset="${p.id}">${p.label}</button>`
          ).join('')}
        </div>
        <div class="dash-sep"></div>
        <button type="button" class="btn" data-act="quick-ir" title="Toggle Day / 850nm Night IR">850nm IR</button>
        <button type="button" class="btn active" data-act="quick-hud" title="Toggle Video Telemetry HUD">HUD</button>
      </div>
    </header>

    <!-- LEFT COLLAPSIBLE THESIS & CONTROLS DRAWER -->
    <aside class="drawer-shell" data-el="drawer">
      <nav class="dash-tabs" role="tablist">
        <button type="button" class="dash-tab-btn active" data-tab="controls">Controls</button>
        <button type="button" class="dash-tab-btn" data-tab="telemetry">Telemetry</button>
        <button type="button" class="dash-tab-btn" data-tab="tables">Tables 1–9</button>
        <button type="button" class="dash-tab-btn" data-tab="hardware">Pinout &amp; BOM</button>
        <button type="button" class="dash-tab-btn" data-tab="alerts">Alerts (<span data-el="alert-tab-count">0</span>)</button>
      </nav>

      <div class="drawer-scroll">
        <!-- TAB 1: SIMULATION CONTROLS -->
        <div class="dash-pane active" data-pane="controls">
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
                  <option value="night">Nighttime (850nm IR)</option>
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
                <span>Water Turbidity / Color</span>
                <select data-input="turbidityMode">
                  <option value="clear">Clear (&lt; 50 NTU)</option>
                  <option value="silty">Silty (200–500 NTU)</option>
                  <option value="muddy">Muddy (&gt;= 700 NTU)</option>
                  <option value="dark">Dark / Nocturnal</option>
                </select>
              </div>
            </div>
            <div class="dash-toggle-grid">
              <button type="button" class="btn" data-ctrl="nightMode">850nm Night IR: OFF</button>
              <button type="button" class="btn btn-emerald" data-ctrl="wifiOnline">Wi-Fi: ONLINE</button>
              <button type="button" class="btn active" data-ctrl="showOptics">Laser &amp; FOV: ON</button>
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
              <div class="dash-kpi-name">YOLOv8 Debris (Ns / Nr)</div>
              <div class="dash-kpi-val mono" data-kpi="ns">0 / 0</div>
              <div class="dash-kpi-sub mono" data-kpi="f1">P:100% R:100% F1:100%</div>
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
              <div>TSR: <span data-kpi="tsr" style="color:#6ee7b7;">100.0%</span></div>
              <div>Local Queue: <span data-kpi="queue">0</span> rec</div>
              <div>Latency: <span data-kpi="latency">185 ms</span></div>
              <div>microSD Logs: <span data-kpi="sd-logs">0</span></div>
              <div>SATA SSD: <span data-kpi="ssd-mb">42.6 MB</span></div>
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(148,163,184,0.14);font-size:10.5px;line-height:1.4;" class="mono">
              <div>LoRa 12B Frame: <span data-kpi="lora-hex" style="color:#7dd3fc;word-break:break-all;">--</span></div>
              <div style="color:#94a3b8;" data-kpi="lora-meta">Flags -- | WL -- mm | D -- mm | CRC --</div>
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
            <button type="button" class="btn btn-danger" data-act="reset-logs">Reset</button>
          </div>
          <div style="font-size:10.5px;color:#94a3b8;">
            Offline Standalone Mode: trials &amp; alerts persist in browser <code>localStorage</code> and export directly to CSV/JSON.
          </div>

          <div class="dash-section">
            <div class="dash-section-title">
              <span>Table 1: Controlled WL &amp; Velocity</span>
              <span class="mono" data-kpi="t1-stats" style="font-size:10px;color:#94a3b8;">MAE: --</span>
            </div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>D(m)</th><th>WL(m)</th><th>Ref(m)</th><th>Vs</th><th>Vr</th></tr></thead>
                <tbody data-tbody="t1"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section">
            <div class="dash-section-title"><span>Table 2: Controlled Discharge (m³/s)</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>A(m²)</th><th>k</th><th>Qs</th><th>Qr</th><th>Err%</th></tr></thead>
                <tbody data-tbody="t2"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section">
            <div class="dash-section-title"><span>Table 3 &amp; 4: Controlled Debris &amp; TSR%</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Light</th><th>Ns/Nr</th><th>P%</th><th>R%</th><th>TSR%</th></tr></thead>
                <tbody data-tbody="t34"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section">
            <div class="dash-section-title"><span>Table 5: Functionality Checklist</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>Function</th><th>Pass Criterion</th><th>Status</th></tr></thead>
                <tbody data-tbody="t5"></tbody>
              </table>
            </div>
          </div>

          <div class="dash-section">
            <div class="dash-section-title"><span>Tables 6–9: Field Guimbal River Logs</span></div>
            <div class="dash-table-wrap">
              <table class="data-table">
                <thead><tr><th>ID</th><th>Stage</th><th>WL(m)</th><th>Vs</th><th>Q(m³/s)</th><th>Ns/Nr</th><th>TSR%</th></tr></thead>
                <tbody data-tbody="field"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB 4: HARDWARE PINOUT (TABLE 3) & BOM -->
        <div class="dash-pane" data-pane="hardware">
          <div class="dash-section">
            <div class="dash-section-title"><span>Table 3: Prototype Pin Connection Table</span></div>
            <div class="dash-table-wrap" style="max-height:240px;">
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
              <span>Appendix: Bill of Materials</span>
              <span class="badge badge-ok mono">Total: ₱20,278</span>
            </div>
            <div class="dash-table-wrap" style="max-height:260px;">
              <table class="data-table">
                <thead><tr><th>Material</th><th>Qty</th><th>Cost</th><th>Specification</th></tr></thead>
                <tbody>
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
        <input type="range" min="0" max="1000" step="1" value="0" data-input="timeline-scrub" />
      </div>
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
  const sensCanvas = q('[data-el="sens-canvas"]');
  const sensCtx = sensCanvas.getContext('2d');
  const alertListEl = q('[data-el="alert-list"]');
  const alertTabCount = q('[data-el="alert-tab-count"]');

  const playPauseBtn = q('[data-act="play-pause"]');
  const scrubInput = q('[data-input="timeline-scrub"]');
  const stageTitleEl = q('[data-el="stage-title"]');
  const stageTimeEl = q('[data-el="stage-time"]');

  const quickIrBtn = q('[data-act="quick-ir"]');
  const quickHudBtn = q('[data-act="quick-hud"]');

  let drawerOpen = true;
  let hudVisible = true;
  let lastLoggedTrialSig = '';
  let lastAlertCount = -1;
  let lastModeRendered = null;

  function emitChange(key, value) {
    actions.onStateChange?.(key, value, state);
  }

  // Top Bar Interactions
  toggleDrawerBtn.addEventListener('click', () => {
    drawerOpen = !drawerOpen;
    drawerEl.classList.toggle('collapsed', !drawerOpen);
    toggleDrawerBtn.classList.toggle('active', drawerOpen);
  });

  qa('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextMode = btn.dataset.mode;
      state.mode = nextMode;
      state.lidarHeightM = nextMode === 'river' ? (state.riverLidarHeightM || 4.5) : 0.693;
      state.thresholds = getDefaultThresholds(nextMode);
      if (nextMode === 'river' && state.turbidityMode === 'clear') {
        state.turbidityMode = 'silty';
      }
      actions.onModeChange?.(nextMode);
      syncControlWidgets();
    });
  });

  qa('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetId = btn.dataset.preset;
      state.cameraPreset = presetId;
      actions.setCameraPreset?.(presetId);
      qa('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === presetId));
    });
  });

  quickIrBtn.addEventListener('click', () => {
    state.nightMode = !state.nightMode;
    state.timeOfDay = state.nightMode ? 'night' : 'day';
    emitChange('nightMode', state.nightMode);
    syncControlWidgets();
  });

  quickHudBtn.addEventListener('click', () => {
    hudVisible = !hudVisible;
    quickHudBtn.classList.toggle('active', hudVisible);
    actions.onToggleHud?.(hudVisible);
  });

  // Tab Switching
  qa('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      qa('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      qa('[data-pane]').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
    });
  });

  // Toggle Buttons inside Controls
  const bindToggleBtn = (ctrlKey, onToggle) => {
    const btn = q(`[data-ctrl="${ctrlKey}"]`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      state[ctrlKey] = !state[ctrlKey];
      onToggle?.(state[ctrlKey]);
      emitChange(ctrlKey, state[ctrlKey]);
      syncControlWidgets();
    });
  };

  bindToggleBtn('pumpActive');
  bindToggleBtn('nightMode', (v) => {
    state.timeOfDay = v ? 'night' : 'day';
  });
  bindToggleBtn('wifiOnline');
  bindToggleBtn('showOptics');
  bindToggleBtn('pipelineActive');
  bindToggleBtn('showBathymetrySlice');
  bindToggleBtn('showGcpGrid');
  bindToggleBtn('riverLidarSlantComp');

  // River Mounting Placement Segmented Selector (Overhead Bridge Mount vs Riverbank Side-Pole vs Lab-Style Side Pole)
  qa('[data-mount]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mount;
      const mountMode = m === 'lab_pole' ? 'lab_pole' : m === 'side_pole' ? 'side_pole' : 'bridge';
      state.riverMountMode = mountMode;
      emitChange('riverMountMode', mountMode);
      actions.onMountModeChange?.(mountMode);
      syncControlWidgets();
    });
  });

  // Quick LiDAR Aim Buttons in Side-Pole Mode (0° Straight Down vs 32° Slant Channel)
  qa('[data-lidar-aim]').forEach((btn) => {
    btn.addEventListener('click', () => {
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
    } else if (val === 'night') {
      state.sunGlare = 0.0;
      state.nightMode = true;
    }
    emitChange('timeOfDay', val);
  });

  // Table & Alert Actions
  q('[data-act="capture-trial"]')?.addEventListener('click', () => actions.onCaptureTrial?.());
  q('[data-act="reset-logs"]')?.addEventListener('click', () => actions.onResetLogs?.());
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
      'Vs_ms', 'Vr_ms', 'Area_m2', 'k', 'Q_m3s', 'Ref_Q_m3s',
      'Ns', 'Nr', 'TP', 'FP', 'FN', 'Precision_Pct', 'Recall_Pct', 'F1_Pct',
      'TSR_Pct', 'AlertsCount', 'LoRa_12B_Hex'
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
        r.systemDebrisNs, r.manualDebrisNr, r.tp, r.fp, r.fn,
        Number(r.precisionPct ?? 0).toFixed(1),
        Number(r.recallPct ?? 0).toFixed(1),
        Number(r.f1Pct ?? 0).toFixed(1),
        Number(r.tsrPct ?? 0).toFixed(1),
        r.alertsCount ?? 0,
        r.loraPayloadHex || '',
      ].map(csvCell).join(','));
    }
    return lines.join('\n');
  }

  function setIfUnfocused(sel, val) {
    const el = q(sel);
    if (el && document.activeElement !== el) {
      el.value = String(val);
    }
  }

  function syncControlWidgets() {
    const isRiver = state.mode === 'river';

    qa('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === (isRiver ? 'river' : 'lab')));
    phase1Box.style.display = isRiver ? 'none' : '';
    phase2Box.style.display = isRiver ? '' : 'none';

    if (state.cameraPreset) {
      qa('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.cameraPreset));
    }

    // Phase 1 values
    const valvePct = Math.round((state.valveOpening ?? 0.75) * 100);
    const wavePct = Math.round((state.waveMakerPower ?? 0.25) * 100);
    const debrisN = Math.round(state.debrisCountTarget ?? (isRiver ? 12 : 6));
    const hVal = Number(state.lidarHeightM ?? (isRiver ? 4.5 : 0.693));

    setIfUnfocused('[data-input="valveOpening"]', valvePct);
    q('[data-val="valveOpening"]').textContent = `${valvePct}%`;

    setIfUnfocused('[data-input="waveMakerPower"]', wavePct);
    q('[data-val="waveMakerPower"]').textContent = `${wavePct}%`;

    setIfUnfocused('[data-input="debrisCountTarget"]', Math.min(15, debrisN));
    q('[data-val="debrisCountTarget"]').textContent = `${debrisN} items`;

    setIfUnfocused('[data-input="lidarHeightM"]', hVal);
    q('[data-val="lidarHeightM"]').textContent = `${hVal.toFixed(3)} m`;

    const pumpBtn = q('[data-ctrl="pumpActive"]');
    const pumpOn = state.pumpActive !== false;
    pumpBtn.textContent = pumpOn ? 'Pump: ON' : 'Pump: OFF';
    pumpBtn.classList.toggle('btn-emerald', pumpOn);
    pumpBtn.classList.toggle('btn-danger', !pumpOn);

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
    const mountLabelEl = q('[data-val="riverMountMode"]');
    if (mountLabelEl) mountLabelEl.textContent = mountValLabel;
    qa('[data-mount]').forEach((b) =>
      b.classList.toggle('active', b.dataset.mount === activeMountKey)
    );
    if (sidePoleBox) sidePoleBox.style.display = isAnySidePole ? '' : 'none';

    const sideH = Number(state.sidePoleHeightM ?? 6.00);
    setIfUnfocused('[data-input="sidePoleHeightM"]', sideH);
    const sideHVal = q('[data-val="sidePoleHeightM"]');
    if (sideHVal) sideHVal.textContent = `${sideH.toFixed(2)} m`;

    const tiltDeg = Math.round(Number(state.riverLidarTiltDeg ?? 32));
    setIfUnfocused('[data-input="riverLidarTiltDeg"]', tiltDeg);
    const tiltValEl = q('[data-val="riverLidarTiltDeg"]');
    if (tiltValEl) {
      tiltValEl.textContent = tiltDeg <= 0 ? '0° (Nadir)' : `${tiltDeg}° (Slant)`;
    }
    qa('[data-lidar-aim]').forEach((b) => {
      const want = b.dataset.lidarAim === 'nadir' ? tiltDeg === 0 : tiltDeg > 0;
      b.classList.toggle('active', want);
    });

    const slantCompBtn = q('[data-ctrl="riverLidarSlantComp"]');
    if (slantCompBtn) {
      const compOn = state.riverLidarSlantComp !== false;
      slantCompBtn.textContent = compOn ? 'cos(θ) Comp: ON' : 'cos(θ) Comp: OFF';
      slantCompBtn.classList.toggle('active', compOn);
    }

    setIfUnfocused('[data-input="riverStagePreset"]', state.riverStagePreset || 'normal');
    const stageM = Number(state.riverStageM ?? 1.15);
    setIfUnfocused('[data-input="riverStageM"]', stageM);
    q('[data-val="riverStageM"]').textContent = `${stageM.toFixed(2)} m`;

    const nVal = Number(state.manningN ?? 0.035);
    setIfUnfocused('[data-input="manningN"]', nVal);
    q('[data-val="manningN"]').textContent = nVal.toFixed(3);

    const s0Val = Number(state.channelSlope ?? 0.0022);
    setIfUnfocused('[data-input="channelSlope"]', s0Val);
    q('[data-val="channelSlope"]').textContent = s0Val.toFixed(4);

    const kVal = Number(state.velocityCoeffK ?? 0.85);
    setIfUnfocused('[data-input="velocityCoeffK"]', kVal);
    q('[data-val="velocityCoeffK"]').textContent = kVal.toFixed(2);

    const rainPct = Math.round((state.rainIntensity ?? 0) * 100);
    setIfUnfocused('[data-input="rainIntensity"]', rainPct);
    q('[data-val="rainIntensity"]').textContent = `${rainPct}%`;

    setIfUnfocused('[data-input="riverDebrisTarget"]', debrisN);
    q('[data-val="riverDebrisTarget"]').textContent = `${debrisN} items`;

    const sliceBtn = q('[data-ctrl="showBathymetrySlice"]');
    sliceBtn.classList.toggle('active', state.showBathymetrySlice !== false);
    const gcpBtn = q('[data-ctrl="showGcpGrid"]');
    gcpBtn.classList.toggle('active', state.showGcpGrid !== false);

    // Shared values
    const expPct = Math.round((state.explodeFactor ?? 0) * 100);
    setIfUnfocused('[data-input="explodeFactor"]', expPct);
    q('[data-val="explodeFactor"]').textContent = `${expPct}%`;

    setIfUnfocused('[data-input="turbidityMode"]', state.turbidityMode || (isRiver ? 'silty' : 'clear'));
    const tod = state.nightMode
      ? 'night'
      : (state.sunGlare ?? 0) > 0.5
        ? 'glare'
        : state.timeOfDay || 'day';
    setIfUnfocused('[data-input="timeOfDayPreset"]', tod);

    const nightOn = Boolean(state.nightMode);
    const nightBtn = q('[data-ctrl="nightMode"]');
    nightBtn.textContent = nightOn ? '850nm Night IR: ON' : '850nm Night IR: OFF';
    nightBtn.classList.toggle('active', nightOn);
    quickIrBtn.classList.toggle('active', nightOn);

    const wifiOn = state.wifiOnline !== false;
    const wifiBtn = q('[data-ctrl="wifiOnline"]');
    wifiBtn.textContent = wifiOn ? 'Wi-Fi: ONLINE' : 'Wi-Fi: OUTAGE';
    wifiBtn.classList.toggle('btn-emerald', wifiOn);
    wifiBtn.classList.toggle('btn-danger', !wifiOn);

    const opticsBtn = q('[data-ctrl="showOptics"]');
    const opticsOn = state.showOptics !== false;
    opticsBtn.textContent = opticsOn ? 'Laser & FOV: ON' : 'Laser & FOV: OFF';
    opticsBtn.classList.toggle('active', opticsOn);

    const pipeBtn = q('[data-ctrl="pipelineActive"]');
    const pipeOn = state.pipelineActive !== false;
    pipeBtn.textContent = pipeOn ? 'Logging: ON' : 'Logging: PAUSED';
    pipeBtn.classList.toggle('active', pipeOn);

    // Threshold sliders adapt range cleanly between Lab and River
    const th = state.thresholds || getDefaultThresholds(isRiver ? 'river' : 'lab');
    const thQInput = q('[data-input="th-q"]');
    if (isRiver !== lastModeRendered && thQInput) {
      lastModeRendered = isRiver;
      thQInput.min = isRiver ? '2.0' : '0.0005';
      thQInput.max = isRiver ? '65.0' : '0.0040';
      thQInput.step = isRiver ? '0.5' : '0.00005';
    }
    setIfUnfocused('[data-input="th-wl"]', th.waterLevelM);
    q('[data-val="th-wl"]').textContent = `${Number(th.waterLevelM).toFixed(3)} m`;
    setIfUnfocused('[data-input="th-vs"]', th.surfaceVelocityMs);
    q('[data-val="th-vs"]').textContent = `${Number(th.surfaceVelocityMs).toFixed(2)} m/s`;
    setIfUnfocused('[data-input="th-q"]', th.dischargeM3s);
    q('[data-val="th-q"]').textContent = `${Number(th.dischargeM3s).toFixed(isRiver ? 1 : 5)} m³/s`;
    setIfUnfocused('[data-input="th-n"]', th.debrisCount);
    q('[data-val="th-n"]').textContent = `${Math.round(th.debrisCount)} items`;
  }

  function renderSensitivityChart(sens) {
    if (!sens || !sens.points || !sens.points.length) return;
    const w = sensCanvas.width;
    const h = sensCanvas.height;
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
    q('[data-kpi="sens-summary"]').textContent =
      `ΔQ(k): ${fmtQ(sens.deltaQOverK)} | ΔQ(±5cm): ${fmtQ(sens.deltaQOverWL)} | Band: ±${sens.uncertaintyBandPct.toFixed(1)}%`;
  }

  function renderTables(trialLogs, snapshot) {
    if (!trialLogs) return;
    const p1 = trialLogs.phase1 || [];
    const p2 = trialLogs.phase2 || [];
    const sig = `${p1.length}-${p2.length}-${p1[p1.length - 1]?.trialId || ''}-${p2[p2.length - 1]?.trialId || ''}-${snapshot.edgeStorage.tsrPct.toFixed(1)}`;
    if (sig === lastLoggedTrialSig) return;
    lastLoggedTrialSig = sig;

    const s1 = trialLogs.stats?.phase1;
    if (s1) {
      q('[data-kpi="t1-stats"]').textContent =
        `MAE: ${s1.wlMaeCm.toFixed(2)}cm | RMSE: ${s1.wlRmseCm.toFixed(2)}cm | Bias: ${s1.wlBiasCm.toFixed(2)}cm`;
    }

    q('[data-tbody="t1"]').innerHTML = p1
      .slice(-10)
      .reverse()
      .map(
        (r) =>
          `<tr><td class="mono">${r.trialId}</td><td class="mono">${r.lidarDistanceM.toFixed(3)}</td><td class="mono">${r.calculatedWlM.toFixed(3)}</td><td class="mono">${r.referenceWlM.toFixed(3)}</td><td class="mono">${r.estimatedVsMs.toFixed(2)}</td><td class="mono">${r.referenceVsMs.toFixed(2)}</td></tr>`
      )
      .join('');

    q('[data-tbody="t2"]').innerHTML = p1
      .slice(-10)
      .reverse()
      .map(
        (r) =>
          `<tr><td class="mono">${r.trialId}</td><td class="mono">${r.wettedAreaM2.toFixed(4)}</td><td class="mono">${r.velocityCoeffK.toFixed(2)}</td><td class="mono">${r.estimatedQM3s.toFixed(5)}</td><td class="mono">${r.referenceQM3s.toFixed(5)}</td><td class="mono">${r.qPercentError.toFixed(1)}%</td></tr>`
      )
      .join('');

    q('[data-tbody="t34"]').innerHTML = p1
      .slice(-10)
      .reverse()
      .map(
        (r) =>
          `<tr><td class="mono">${r.trialId}</td><td>${r.lightingCondition}</td><td class="mono">${r.systemDebrisNs}/${r.manualDebrisNr}</td><td class="mono">${r.precisionPct.toFixed(0)}%</td><td class="mono">${r.recallPct.toFixed(0)}%</td><td class="mono">${r.tsrPct.toFixed(1)}%</td></tr>`
      )
      .join('');

    q('[data-tbody="t5"]').innerHTML = (snapshot.functionalityChecks || [])
      .map(
        (c) =>
          `<tr><td>${c.name}</td><td>${c.criterion}</td><td><span class="badge ${c.status === 'PASS' ? 'badge-ok' : 'badge-warn'}">${c.status}</span></td></tr>`
      )
      .join('');

    q('[data-tbody="field"]').innerHTML = p2.length
      ? p2
          .slice(-10)
          .reverse()
          .map(
            (r) =>
              `<tr><td class="mono">${r.trialId}</td><td>${r.flowStage}</td><td class="mono">${r.calculatedWlM.toFixed(2)}</td><td class="mono">${r.estimatedVsMs.toFixed(2)}</td><td class="mono">${r.estimatedQM3s.toFixed(2)}</td><td class="mono">${r.systemDebrisNs}/${r.manualDebrisNr}</td><td class="mono">${r.tsrPct.toFixed(1)}%</td></tr>`
          )
          .join('')
      : `<tr><td colspan="7" style="color:#94a3b8;text-align:center;">Switch to Phase 2 or Stage 6 to record Guimbal River field trials.</td></tr>`;
  }

  function renderAlertInbox(alerts = []) {
    alertTabCount.textContent = String(alerts.length);
    if (alerts.length === lastAlertCount) return;
    lastAlertCount = alerts.length;

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

  function update(snapshot, sensitivityData, trialLogs, timelineInfoArg) {
    lastSnapshot = snapshot;
    cachedTrialLogs = trialLogs;

    syncControlWidgets();

    // Update Timeline Bar
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
      qa('[data-stage]').forEach((b) =>
        b.classList.toggle('active', Number(b.dataset.stage) === tInfo.index)
      );
    }

    if (!snapshot) return;

    // Telemetry KPI Cards
    const isRiver = snapshot.phase === 'phase2';
    q('[data-kpi="wl"]').textContent = `${snapshot.waterLevel.calculatedM.toFixed(3)} m`;
    q('[data-kpi="wl-err"]').textContent = `AE: ${snapshot.waterLevel.absErrorCm.toFixed(2)} cm | ${snapshot.waterLevel.tableXPass ? 'PASS' : 'FAIL'}`;

    q('[data-kpi="vs"]').textContent = `${snapshot.velocity.estimatedVs.toFixed(2)} m/s`;
    q('[data-kpi="vs-err"]').textContent = `rRMSE: ${snapshot.velocity.rRrmsePct.toFixed(1)}% (<=20%)`;

    const qVal = snapshot.discharge.estimatedQ;
    q('[data-kpi="q"]').textContent = `${qVal < 0.05 ? qVal.toFixed(5) : qVal.toFixed(2)} m³/s`;
    q('[data-kpi="q-sub"]').textContent = `A: ${snapshot.discharge.wettedAreaM2.toFixed(isRiver ? 2 : 4)} m² | k: ${snapshot.discharge.velocityCoeffK.toFixed(2)}`;

    q('[data-kpi="ns"]').textContent = `${snapshot.debris.systemCountNs} / ${snapshot.debris.manualCountNr}`;
    q('[data-kpi="f1"]').textContent = `P:${snapshot.debris.precisionPct.toFixed(0)}% R:${snapshot.debris.recallPct.toFixed(0)}% F1:${snapshot.debris.f1Pct.toFixed(0)}%`;

    // Mounting Location & Incidence Telemetry
    const mnt = snapshot.mounting;
    if (mnt) {
      const mBadge = q('[data-kpi="mount-badge"]');
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
      const mLoc = q('[data-kpi="mount-loc"]');
      if (mLoc) mLoc.textContent = mnt.label;
      const mH = q('[data-kpi="mount-h"]');
      if (mH) mH.textContent = `${mnt.heightM.toFixed(2)} m`;
      const mLAng = q('[data-kpi="lidar-ang"]');
      if (mLAng) {
        mLAng.textContent = mnt.lidarIncidenceDeg > 0.1
          ? `${mnt.lidarIncidenceDeg.toFixed(1)}° Slant`
          : '0.0° Nadir';
      }
      const mCAng = q('[data-kpi="cam-ang"]');
      if (mCAng) mCAng.textContent = `${mnt.cameraIncidenceDeg.toFixed(1)}°`;
      const mDL = q('[data-kpi="d-laser"]');
      if (mDL) {
        mDL.textContent = mnt.lidarIncidenceDeg > 0.1
          ? `${mnt.rawLaserDistanceM.toFixed(2)}m → ${mnt.compensatedDistanceM.toFixed(2)}m`
          : `${mnt.rawLaserDistanceM.toFixed(3)} m`;
      }
      const mComp = q('[data-kpi="gcp-comp"]');
      if (mComp) {
        mComp.textContent = (mnt.mode === 'side_pole' || mnt.mode === 'lab_pole')
          ? `H_gcp | ${mnt.slantCompEnabled ? 'cos(θ) ON' : 'RAW OFF'}`
          : mnt.gcpLayout;
      }
    }

    // Edge Storage & RTC
    const edge = snapshot.edgeStorage;
    const syncBadge = q('[data-kpi="sync-badge"]');
    syncBadge.textContent = edge.uploadStatus;
    syncBadge.className = `badge mono ${edge.wifiOnline ? 'badge-ok' : 'badge-warn'}`;
    q('[data-kpi="rtc-time"]').textContent = snapshot.rtcLocalLabel;
    q('[data-kpi="tsr"]').textContent = `${edge.tsrPct.toFixed(1)}%`;
    q('[data-kpi="queue"]').textContent = String(edge.queuedCount);
    q('[data-kpi="latency"]').textContent = `${edge.processingLatencyMs} ms`;
    q('[data-kpi="sd-logs"]').textContent = String(edge.microSdRecords);
    q('[data-kpi="ssd-mb"]').textContent = `${edge.ssdUsedMB.toFixed(1)} MB`;
    const lora = snapshot.loraPayload;
    const loraHexEl = q('[data-kpi="lora-hex"]');
    if (loraHexEl && lora) {
      loraHexEl.textContent = lora.hex || lora.compactHex || '--';
    }
    const loraMetaEl = q('[data-kpi="lora-meta"]');
    if (loraMetaEl && lora) {
      const fHex = `0x${Number(lora.flagsByte ?? 0).toString(16).toUpperCase().padStart(2, '0')}`;
      loraMetaEl.textContent = `Flags ${fHex} | WL ${lora.waterMm} mm | D ${lora.distanceMm} mm | Vs ${lora.velocityMms} mm/s | CRC ${lora.crc8Hex}`;
    }

    // Table X Acceptance List
    const txItems = [
      { label: 'Water Level', rule: snapshot.waterLevel.tableXRule, pass: snapshot.waterLevel.tableXPass },
      { label: 'Surface Velocity', rule: snapshot.velocity.tableXRule, pass: snapshot.velocity.tableXPass },
      { label: 'Discharge', rule: snapshot.discharge.tableXRule, pass: snapshot.discharge.tableXPass },
      { label: 'YOLOv8 Exact Match', rule: snapshot.debris.tableXRule, pass: snapshot.debris.tableXPass },
      { label: 'Data Transmission TSR', rule: edge.tableXRule, pass: edge.tableXPass },
    ];
    q('[data-el="tablex-list"]').innerHTML = txItems
      .map(
        (it) =>
          `<div style="display:flex;justify-content:space-between;align-items:center;"><span>${it.label} <span class="mono" style="color:#94a3b8;font-size:10px;">(${it.rule})</span></span><span class="badge ${it.pass ? 'badge-ok' : 'badge-alert'}">${it.pass ? 'PASS' : 'CHECK'}</span></div>`
      )
      .join('');

    renderSensitivityChart(sensitivityData);
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
  };
}

  return { createDashboardPanel };
})(RiverSimModules.pipelineModel, RiverSimModules.timelineController);

/* === BOOTSTRAP: src/main.js === */
(function (THREE, OrbitControls, RoomEnvironment, { createFlumeTank }, { createGantryFrame }, { createRiverField }, { createEnclosures }, { createHardwareRig }, { createLabHydraulics }, { createRealRiverHydraulics }, { createWaterSystem }, { createSensorOptics }, { createPipelineModel, getDefaultThresholds }, { createVideoHud }, { createDashboardPanel }, { createTimelineController }) {
const LAB_ONLY_PRESETS = new Set([
  'video_replica',
  'side_profile',
  'overhead_gantry',
  'hydraulic_cutaway',
]);

const RIVER_ONLY_PRESETS = new Set([
  'river_cross_section',
  'gcp_aerial',
]);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function initApp() {
  const canvas = document.getElementById('sim-canvas');
  const hudRoot = document.getElementById('hud-overlay-root');
  const dashboardRoot = document.getElementById('dashboard-root');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');

  if (!canvas) {
    throw new Error('Missing #sim-canvas element');
  }

  /* ------------------------------------------------------------------------ */
  /*  1. Shared Simulation State                                              */
  /* ------------------------------------------------------------------------ */

  const state = {
    mode: 'lab', // 'lab' | 'river'
    cameraPreset: 'video_replica',
    pumpActive: true,
    valveOpening: 0.75,
    waveMakerPower: 0.25,
    debrisCountTarget: 6,
    lidarHeightM: 0.693,
    labLidarHeightM: 0.693,
    riverLidarHeightM: 4.5,
    riverMountMode: 'bridge', // 'bridge' (Overhead Bridge Mount) | 'side_pole' (Riverbank Side-Pole) | 'lab_pole' (Lab-Style Side Pole)
    sidePoleHeightM: 6.00,
    riverLidarTiltDeg: 32,
    riverLidarSlantComp: true,
    sidePoleCamTargetZ: -1.2,
    labPoleCamTargetZ: -0.95,

    riverStagePreset: 'normal',
    riverStageM: 1.15,
    manningN: 0.035,
    channelSlope: 0.0022,
    velocityCoeffK: 0.85,
    rainIntensity: 0.0,
    windChop: 0.15,
    hydrographTime: 0.0,

    turbidityMode: 'clear',
    explodeFactor: 0.0,
    nightMode: false,
    timeOfDay: 'day', // 'day' | 'glare' | 'dusk' | 'night'
    sunGlare: 0.0,

    wifiOnline: true,
    pipelineActive: true,
    powerOn: true,

    showOptics: true,
    showLidarBeam: true,
    showCameraFov: true,
    showPivVectors: true,
    showYoloBoxes: true,
    showBathymetrySlice: true,
    showGcpGrid: true,
    hudVisible: true,

    thresholds: getDefaultThresholds('lab'),
    hoveredComponent: null,
    selectedComponent: null,
    mainCamera: null,
  };

  /* ------------------------------------------------------------------------ */
  /*  2. Three.js Renderer, Scene, Camera, Environment & Lighting             */
  /* ------------------------------------------------------------------------ */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c121e');

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.03,
    140
  );
  camera.position.set(0.38, 0.56, 1.08);
  state.mainCamera = camera;
  scene.userData.mainCamera = camera;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.target.set(-0.04, 0.28, -0.02);
  controls.minDistance = 0.16;
  controls.maxDistance = 4.5;
  controls.maxPolarAngle = Math.PI * 0.88;

  // IBL Studio Environment for crisp glass, anodized aluminum, & water reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.52;
  pmremGenerator.dispose();

  // Dynamic Lighting Rig (Daylight / Noon Glare / Dusk / 850nm Night IR)
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f3728, 0.92);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff7ed, 2.15);
  sunLight.position.set(2.4, 4.2, 2.8);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.012;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
  fillLight.position.set(-2.5, 1.8, -1.5);
  scene.add(fillLight);

  // Active 850 nm IR Illuminator SpotLight (activates in Night IR mode)
  const irSpotLight = new THREE.SpotLight(0xe879f9, 0, 14, Math.PI * 0.32, 0.55, 1.2);
  irSpotLight.position.set(0.08, 0.72, -0.02);
  scene.add(irSpotLight);
  scene.add(irSpotLight.target);

  const riverFog = new THREE.FogExp2(0x9ec6de, 0.0);

  /* ------------------------------------------------------------------------ */
  /*  3. Build Scene Geometry, Hydraulics, Optics, Pipeline & HUD             */
  /* ------------------------------------------------------------------------ */

  if (loadingStatus) loadingStatus.textContent = 'Building Phase 1/2 CAD & hydraulics…';

  const flumeTank = createFlumeTank();
  const gantryFrame = createGantryFrame();
  const riverField = createRiverField();

  const enclosures = createEnclosures();
  const hardwareRig = createHardwareRig(enclosures);

  const labHydraulics = createLabHydraulics();
  const riverHydraulics = createRealRiverHydraulics(riverField.getBedHeightAtZ);
  const waterSystem = createWaterSystem({ flumeTank, riverField });
  const sensorOptics = createSensorOptics(renderer);
  const pipelineModel = createPipelineModel();

  const labSceneGroup = new THREE.Group();
  labSceneGroup.name = 'Phase1LabSceneGroup';
  labSceneGroup.add(flumeTank.group, gantryFrame.group, waterSystem.labWaterGroup);
  scene.add(labSceneGroup);

  const riverSceneGroup = new THREE.Group();
  riverSceneGroup.name = 'Phase2RiverSceneGroup';
  riverSceneGroup.add(riverField.group, waterSystem.riverWaterGroup);
  riverSceneGroup.visible = false;
  scene.add(riverSceneGroup);

  const hardwareRootGroup = new THREE.Group();
  hardwareRootGroup.name = 'PrototypeHardwareRoot';
  hardwareRootGroup.add(
    enclosures.controlBoxGroup,
    enclosures.lidarPodGroup,
    enclosures.cameraPodGroup,
    enclosures.irIlluminatorGroup,
    hardwareRig.group
  );
  scene.add(hardwareRootGroup);
  scene.add(sensorOptics.group);

  const componentById = new Map();
  for (const item of hardwareRig.getComponentMetadata()) {
    componentById.set(item.id, item);
  }

  /* ------------------------------------------------------------------------ */
  /*  4. Camera Presets & Smooth Lerping                                      */
  /* ------------------------------------------------------------------------ */

  const camTransition = {
    active: false,
    posGoal: new THREE.Vector3().copy(camera.position),
    targetGoal: new THREE.Vector3().copy(controls.target),
    speed: 5.5,
  };

  controls.addEventListener('start', () => {
    camTransition.active = false;
  });

  function computeCameraPresetPose(presetId) {
    const isRiver = state.mode === 'river';
    const isLabPole = isRiver && state.riverMountMode === 'lab_pole';
    const isSidePole = isRiver && state.riverMountMode === 'side_pole';
    const isAnySidePole = isLabPole || isSidePole;

    if (presetId === 'exploded_cad') {
      hardwareRootGroup.updateMatrixWorld(true);
      const boxPos = new THREE.Vector3();
      enclosures.controlBoxGroup.getWorldPosition(boxPos);
      if (!isRiver) {
        // Angle from +X so the foreground drop rail (x=-0.04, z=-0.055) stays well to the left of the open enclosure
        return {
          pos: new THREE.Vector3(0.28, boxPos.y + 0.06, 0.08),
          target: new THREE.Vector3(-0.07, boxPos.y - 0.01, -0.21),
        };
      }
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
        enclosures.controlBoxGroup.quaternion
      );
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(
        enclosures.controlBoxGroup.quaternion
      );
      const camOffset = forward.multiplyScalar(0.56).add(side.multiplyScalar(0.18));
      camOffset.y += 0.08;
      camOffset.multiplyScalar(enclosures.controlBoxGroup.scale.x || 1);
      return {
        pos: boxPos.clone().add(camOffset),
        target: boxPos.clone().add(new THREE.Vector3(0, -0.01, 0)),
      };
    }

    if (presetId === 'noir_pov') {
      if (isLabPole) {
        return {
          pos: new THREE.Vector3(
            riverField.labPoleCameraAnchor.x - 0.85,
            riverField.labPoleCameraAnchor.y + 0.45,
            riverField.labPoleCameraAnchor.z - 0.95
          ),
          target: new THREE.Vector3(
            riverField.labPoleCameraAnchor.x,
            state.riverStageM || 1.15,
            clamp(Number(state.labPoleCamTargetZ ?? -0.95), -3.5, 2.5)
          ),
        };
      }
      if (isSidePole) {
        return {
          pos: new THREE.Vector3(
            riverField.sideCameraAnchor.x - 0.40,
            riverField.sideCameraAnchor.y + 0.45,
            riverField.sideCameraAnchor.z - 0.90
          ),
          target: new THREE.Vector3(
            2.10,
            state.riverStageM || 1.15,
            clamp(Number(state.sidePoleCamTargetZ ?? -1.2), -2.5, 1.5)
          ),
        };
      }
      if (isRiver) {
        return {
          pos: new THREE.Vector3(0.45, riverField.cameraAnchor.y + 0.65, 1.05),
          target: new THREE.Vector3(0.85, state.riverStageM || 1.15, 0.0),
        };
      }
      return {
        pos: new THREE.Vector3(-0.02, gantryFrame.sensorMountPos.camera.y + 0.14, 0.36),
        target: new THREE.Vector3(-0.04, 0.27, -0.02),
      };
    }

    const presets = {
      video_replica: {
        pos: new THREE.Vector3(0.38, 0.56, 1.08),
        target: new THREE.Vector3(-0.04, 0.28, -0.02),
      },
      side_profile: {
        pos: new THREE.Vector3(0.0, 0.34, 1.32),
        target: new THREE.Vector3(0.0, 0.26, 0.0),
      },
      overhead_gantry: {
        pos: new THREE.Vector3(0.24, 1.58, 0.94),
        target: new THREE.Vector3(-0.02, 0.46, -0.05),
      },
      hydraulic_cutaway: {
        pos: new THREE.Vector3(0.06, 0.17, 0.72),
        target: new THREE.Vector3(0.02, 0.16, 0.0),
      },
      river_cross_section: isLabPole
        ? {
            pos: new THREE.Vector3(8.6, 5.3, 8.2),
            target: new THREE.Vector3(1.5, 2.7, -2.0),
          }
        : isSidePole
          ? {
              pos: new THREE.Vector3(7.8, 4.75, 7.6),
              target: new THREE.Vector3(1.1, 2.35, -1.8),
            }
          : {
              pos: new THREE.Vector3(6.8, 3.85, 6.4),
              target: new THREE.Vector3(0.65, 1.75, -0.6),
            },
      gcp_aerial: isAnySidePole
        ? {
            pos: new THREE.Vector3(-2.2, 12.2, 9.4),
            target: new THREE.Vector3(1.9, 1.3, -1.0),
          }
        : {
            pos: new THREE.Vector3(-2.6, 11.4, 8.9),
            target: new THREE.Vector3(0.8, 1.2, 0.0),
          },
    };

    return presets[presetId] || (isRiver ? presets.river_cross_section : presets.video_replica);
  }

  function applyModeEnvironment(nextMode) {
    const isRiver = nextMode === 'river';
    labSceneGroup.visible = !isRiver;
    riverSceneGroup.visible = isRiver;

    if (isRiver) {
      controls.minDistance = 0.35;
      controls.maxDistance = 32.0;
      controls.maxPolarAngle = Math.PI * 0.492;
      sunLight.shadow.camera.left = -15;
      sunLight.shadow.camera.right = 15;
      sunLight.shadow.camera.top = 15;
      sunLight.shadow.camera.bottom = -15;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 45;
    } else {
      controls.minDistance = 0.16;
      controls.maxDistance = 4.6;
      controls.maxPolarAngle = Math.PI * 0.88;
      sunLight.shadow.camera.left = -1.2;
      sunLight.shadow.camera.right = 1.2;
      sunLight.shadow.camera.top = 1.6;
      sunLight.shadow.camera.bottom = -1.2;
      sunLight.shadow.camera.near = 0.2;
      sunLight.shadow.camera.far = 12;
    }
    sunLight.shadow.camera.updateProjectionMatrix();
  }

  function switchMode(nextMode, options = {}) {
    const normalized = nextMode === 'river' ? 'river' : 'lab';
    const changed = state.mode !== normalized;
    state.mode = normalized;

    if (normalized === 'river') {
      state.lidarHeightM = state.riverLidarHeightM || 4.5;
      if (state.turbidityMode === 'clear') state.turbidityMode = 'silty';
      state.thresholds = getDefaultThresholds('river');
    } else {
      state.lidarHeightM = state.labLidarHeightM || 0.693;
      if (state.turbidityMode === 'muddy' && changed) state.turbidityMode = 'clear';
      state.thresholds = getDefaultThresholds('lab');
    }

    applyModeEnvironment(normalized);

    if (!options.skipCamera) {
      const targetPreset =
        options.preset || (normalized === 'river' ? 'river_cross_section' : 'video_replica');
      setCameraPreset(targetPreset, Boolean(options.instant));
    }
  }

  function setCameraPreset(presetId, instant = false, fromTimeline = false) {
    if (!fromTimeline) {
      if (RIVER_ONLY_PRESETS.has(presetId) && state.mode !== 'river') {
        switchMode('river', { skipCamera: true });
      } else if (LAB_ONLY_PRESETS.has(presetId) && state.mode !== 'lab') {
        switchMode('lab', { skipCamera: true });
      }
      if (presetId === 'exploded_cad' && state.explodeFactor < 0.25) {
        state.explodeFactor = 0.85;
      }
    }

    state.cameraPreset = presetId;
    if (state.mode === 'river') {
      riverField.update(0.001, state, riverHydraulics.getMetrics());
    }
    syncHardwareMounts();

    const { pos, target } = computeCameraPresetPose(presetId);
    if (instant) {
      camTransition.active = false;
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
    } else {
      camTransition.posGoal.copy(pos);
      camTransition.targetGoal.copy(target);
      camTransition.active = true;
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  5. Hardware Anchors & Lighting Smooth Transition Helpers                */
  /* ------------------------------------------------------------------------ */

  const activeAnchors = {
    lidar: new THREE.Vector3(),
    camera: new THREE.Vector3(),
    ir: new THREE.Vector3(),
  };

  const _mountDown = new THREE.Vector3(0, -1, 0);
  const _mountAimDir = new THREE.Vector3();
  const _mountTarget = new THREE.Vector3();

  function syncHardwareMounts() {
    const isRiver = state.mode === 'river';
    if (!isRiver) {
      gantryFrame.update(state);
      enclosures.controlBoxGroup.scale.setScalar(1);
      enclosures.lidarPodGroup.scale.setScalar(1);
      enclosures.cameraPodGroup.scale.setScalar(1);
      enclosures.irIlluminatorGroup.scale.setScalar(1);
      hardwareRig.routerGroup.scale.setScalar(1);

      enclosures.controlBoxGroup.position.copy(gantryFrame.sensorMountPos.controlBox);
      enclosures.controlBoxGroup.rotation.set(0, 0, 0);

      enclosures.lidarPodGroup.position.copy(gantryFrame.sensorMountPos.lidar);
      enclosures.lidarPodGroup.rotation.set(0, 0, 0);

      enclosures.cameraPodGroup.position.copy(gantryFrame.sensorMountPos.camera);
      enclosures.cameraPodGroup.rotation.set(0, 0, 0);

      enclosures.irIlluminatorGroup.position.copy(gantryFrame.sensorMountPos.ir);
      enclosures.irIlluminatorGroup.rotation.set(0, 0, 0);

      hardwareRig.routerGroup.position.set(0.57, 0.018, -0.05);
      hardwareRig.routerGroup.rotation.set(0, 0, 0);

      activeAnchors.lidar.copy(gantryFrame.sensorMountPos.lidar);
      activeAnchors.camera.copy(gantryFrame.sensorMountPos.camera);
      activeAnchors.ir.copy(gantryFrame.sensorMountPos.ir);
    } else if (state.riverMountMode === 'lab_pole') {
      const s = riverField.labPoleEnclosureScale || 2.2526;
      enclosures.controlBoxGroup.scale.setScalar(s);
      enclosures.lidarPodGroup.scale.setScalar(s);
      enclosures.cameraPodGroup.scale.setScalar(s);
      enclosures.irIlluminatorGroup.scale.setScalar(s);
      hardwareRig.routerGroup.scale.setScalar(s);

      enclosures.controlBoxGroup.position.copy(riverField.labPoleControlBoxAnchor);
      enclosures.controlBoxGroup.rotation.set(0, 0, 0);

      hardwareRig.routerGroup.position.copy(riverField.labPoleRouterAnchor);
      hardwareRig.routerGroup.rotation.set(0, 0, 0);

      const thetaDeg = clamp(Number(state.riverLidarTiltDeg ?? 32), 0, 45);
      const thetaRad = (thetaDeg * Math.PI) / 180;
      _mountAimDir.set(0, -Math.cos(thetaRad), Math.sin(thetaRad)).normalize();
      enclosures.lidarPodGroup.position.copy(riverField.labPoleMountAnchor);
      enclosures.lidarPodGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      const waterY = riverHydraulics.getMetrics()?.waterLevelM ?? (state.riverStageM || 1.15);
      const camTargetZ = clamp(Number(state.labPoleCamTargetZ ?? -0.95), -3.5, 2.5);
      _mountTarget.set(riverField.labPoleCameraAnchor.x, waterY, camTargetZ);

      enclosures.cameraPodGroup.position.copy(riverField.labPoleCameraAnchor);
      _mountAimDir.subVectors(_mountTarget, riverField.labPoleCameraAnchor).normalize();
      enclosures.cameraPodGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      enclosures.irIlluminatorGroup.position.copy(riverField.labPoleIrAnchor);
      _mountAimDir.subVectors(_mountTarget, riverField.labPoleIrAnchor).normalize();
      enclosures.irIlluminatorGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      activeAnchors.lidar.copy(riverField.labPoleMountAnchor);
      activeAnchors.camera.copy(riverField.labPoleCameraAnchor);
      activeAnchors.ir.copy(riverField.labPoleIrAnchor);
    } else if (state.riverMountMode === 'side_pole') {
      enclosures.controlBoxGroup.scale.setScalar(1);
      enclosures.lidarPodGroup.scale.setScalar(1);
      enclosures.cameraPodGroup.scale.setScalar(1);
      enclosures.irIlluminatorGroup.scale.setScalar(1);
      hardwareRig.routerGroup.scale.setScalar(1);

      const sideHDelta = (riverField.sideMountAnchor?.y ?? 6.0) - 6.0;
      enclosures.controlBoxGroup.position.copy(riverField.sideControlBoxAnchor);
      enclosures.controlBoxGroup.rotation.set(0, 0.16, 0);

      hardwareRig.routerGroup.position.copy(riverField.sideRouterAnchor);
      hardwareRig.routerGroup.rotation.set(0, 0.16, 0);

      // LiDAR pod angled along theta (0° straight down .. 45° slant toward channel)
      const thetaDeg = clamp(Number(state.riverLidarTiltDeg ?? 32), 0, 45);
      const thetaRad = (thetaDeg * Math.PI) / 180;
      _mountAimDir.set(0, -Math.cos(thetaRad), Math.sin(thetaRad)).normalize();
      enclosures.lidarPodGroup.position.copy(riverField.sideMountAnchor);
      enclosures.lidarPodGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      // Camera & 850nm IR pods aimed obliquely across the channel toward mid-channel water
      const waterY = riverHydraulics.getMetrics()?.waterLevelM ?? (state.riverStageM || 1.15);
      const camTargetZ = clamp(Number(state.sidePoleCamTargetZ ?? -1.2), -2.5, 1.5);
      _mountTarget.set(2.10, waterY, camTargetZ);

      enclosures.cameraPodGroup.position.copy(riverField.sideCameraAnchor);
      _mountAimDir.subVectors(_mountTarget, riverField.sideCameraAnchor).normalize();
      enclosures.cameraPodGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      enclosures.irIlluminatorGroup.position.copy(riverField.sideIrAnchor);
      _mountAimDir.subVectors(_mountTarget, riverField.sideIrAnchor).normalize();
      enclosures.irIlluminatorGroup.quaternion.setFromUnitVectors(_mountDown, _mountAimDir);

      activeAnchors.lidar.copy(riverField.sideMountAnchor);
      activeAnchors.camera.copy(riverField.sideCameraAnchor);
      activeAnchors.ir.copy(riverField.sideIrAnchor);
      void sideHDelta;
    } else {
      enclosures.controlBoxGroup.scale.setScalar(1);
      enclosures.lidarPodGroup.scale.setScalar(1);
      enclosures.cameraPodGroup.scale.setScalar(1);
      enclosures.irIlluminatorGroup.scale.setScalar(1);
      hardwareRig.routerGroup.scale.setScalar(1);

      const deltaH = riverField.mountAnchor.y - 4.5;
      enclosures.controlBoxGroup.position.set(0.80, 4.92 + deltaH, -0.425);
      enclosures.controlBoxGroup.rotation.set(0, Math.PI, 0);

      hardwareRig.routerGroup.position.set(0.99, 5.35, -0.45);
      hardwareRig.routerGroup.rotation.set(0, 0, 0);

      enclosures.lidarPodGroup.position.copy(riverField.mountAnchor);
      enclosures.lidarPodGroup.rotation.set(0, 0, 0);

      enclosures.cameraPodGroup.position.copy(riverField.cameraAnchor);
      enclosures.cameraPodGroup.rotation.set(0.08, 0, 0.06);

      const irPos = new THREE.Vector3(0.95, riverField.cameraAnchor.y, -0.35);
      enclosures.irIlluminatorGroup.position.copy(irPos);
      enclosures.irIlluminatorGroup.rotation.set(0.06, 0, -0.03);

      activeAnchors.lidar.copy(riverField.mountAnchor);
      activeAnchors.camera.copy(riverField.cameraAnchor);
      activeAnchors.ir.copy(irPos);
    }
  }

  const _bgTarget = new THREE.Color();
  const _sunColorTarget = new THREE.Color();
  const _hemiSkyTarget = new THREE.Color();
  const _hemiGroundTarget = new THREE.Color();
  const _sunPosTarget = new THREE.Vector3();
  const _sunLookTarget = new THREE.Vector3();

  function updateLighting(dt) {
    const isRiver = state.mode === 'river';
    const isNight = Boolean(state.nightMode);
    const tod = isNight
      ? 'night'
      : (state.sunGlare ?? 0) > 0.45
        ? 'glare'
        : state.timeOfDay || 'day';

    let hemiIntensity = 0.92;
    let sunIntensity = isRiver ? 2.55 : 2.1;
    let fillIntensity = 0.65;
    let envIntensity = 0.52;
    let exposure = 1.08;
    let fogDensity = isRiver ? 0.013 : 0.0;

    if (tod === 'night') {
      _bgTarget.set(isRiver ? '#040812' : '#050811');
      _hemiSkyTarget.set('#384d78');
      _hemiGroundTarget.set('#0e1526');
      _sunColorTarget.set('#6d89bd');
      hemiIntensity = 0.24;
      sunIntensity = 0.42;
      fillIntensity = 0.18;
      envIntensity = 0.14;
      exposure = 0.88;
      fogDensity = isRiver ? 0.018 : 0.0;
      _sunPosTarget.set(isRiver ? -6 : -1.5, isRiver ? 10 : 3.2, isRiver ? 6 : 2.2);
    } else if (tod === 'dusk') {
      _bgTarget.set(isRiver ? '#2b334f' : '#121826');
      _hemiSkyTarget.set('#8094c4');
      _hemiGroundTarget.set('#2c2420');
      _sunColorTarget.set('#ff9b54');
      hemiIntensity = 0.50;
      sunIntensity = isRiver ? 1.35 : 1.15;
      fillIntensity = 0.45;
      envIntensity = 0.30;
      exposure = 0.98;
      fogDensity = isRiver ? 0.017 : 0.0;
      _sunPosTarget.set(isRiver ? -11 : -2.2, isRiver ? 3.8 : 1.5, isRiver ? -4 : 2.0);
    } else if (tod === 'glare') {
      _bgTarget.set(isRiver ? '#b6d8ed' : '#141c2b');
      _hemiSkyTarget.set('#ffffff');
      _hemiGroundTarget.set('#695c48');
      _sunColorTarget.set('#fffbe8');
      hemiIntensity = 1.12;
      sunIntensity = isRiver ? 3.75 : 3.0;
      fillIntensity = 0.78;
      envIntensity = 0.68;
      exposure = 1.20;
      fogDensity = isRiver ? 0.010 : 0.0;
      // Overhead/forward angle inducing crisp water glare reflections
      _sunPosTarget.set(isRiver ? 2.5 : 0.4, isRiver ? 14.0 : 4.8, isRiver ? -6.5 : -1.4);
    } else {
      // Daylight clear
      _bgTarget.set(isRiver ? '#89bddc' : '#0c121e');
      _hemiSkyTarget.set('#dbeafe');
      _hemiGroundTarget.set('#443c30');
      _sunColorTarget.set('#fff6eb');
      hemiIntensity = isRiver ? 1.02 : 0.92;
      sunIntensity = isRiver ? 2.55 : 2.15;
      fillIntensity = 0.65;
      envIntensity = 0.54;
      exposure = 1.08;
      fogDensity = isRiver ? 0.013 : 0.0;
      _sunPosTarget.set(isRiver ? 8.5 : 2.2, isRiver ? 13.5 : 4.2, isRiver ? 7.5 : 2.8);
    }

    _sunLookTarget.set(isRiver ? 0.8 : 0.0, isRiver ? 1.0 : 0.25, 0.0);

    const k = clamp(dt * 4.5, 0.02, 1.0);
    scene.background.lerp(_bgTarget, k);
    hemiLight.color.lerp(_hemiSkyTarget, k);
    hemiLight.groundColor.lerp(_hemiGroundTarget, k);
    hemiLight.intensity += (hemiIntensity - hemiLight.intensity) * k;

    sunLight.color.lerp(_sunColorTarget, k);
    sunLight.intensity += (sunIntensity - sunLight.intensity) * k;
    sunLight.position.lerp(_sunPosTarget, k);
    sunLight.target.position.lerp(_sunLookTarget, k);
    sunLight.target.updateMatrixWorld();

    fillLight.intensity += (fillIntensity - fillLight.intensity) * k;
    scene.environmentIntensity += (envIntensity - scene.environmentIntensity) * k;
    renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * k;

    if (fogDensity > 0.0005) {
      if (scene.fog !== riverFog) scene.fog = riverFog;
      riverFog.color.copy(scene.background);
      riverFog.density += (fogDensity - riverFog.density) * k;
    } else if (scene.fog) {
      scene.fog = null;
    }

    // 850nm IR SpotLight illuminates water + tracers in Night mode
    const isLabPole = isRiver && state.riverMountMode === 'lab_pole';
    const isSidePole = isRiver && state.riverMountMode === 'side_pole';
    irSpotLight.position.copy(activeAnchors.ir);
    irSpotLight.target.position.set(
      isLabPole
        ? (riverField.labPoleCameraAnchor?.x ?? 2.10)
        : isSidePole
          ? 2.10
          : isRiver
            ? 0.85
            : 0.02,
      isRiver ? (state.riverStageM || 1.15) : 0.31,
      isLabPole
        ? clamp(Number(state.labPoleCamTargetZ ?? -0.95), -3.5, 2.5)
        : isSidePole
          ? clamp(Number(state.sidePoleCamTargetZ ?? -1.2), -2.5, 1.5)
          : 0.0
    );
    irSpotLight.target.updateMatrixWorld();
    const targetIrIntensity = isNight ? (isRiver ? 14.0 : 2.4) : 0.0;
    irSpotLight.intensity += (targetIrIntensity - irSpotLight.intensity) * clamp(dt * 6, 0.05, 1.0);
    irSpotLight.distance = isRiver ? 16 : 3.0;
  }

  /* ------------------------------------------------------------------------ */
  /*  6. UI Wiring: Video HUD, Timeline Controller & Dashboard Panel          */
  /* ------------------------------------------------------------------------ */

  const videoHud = createVideoHud(hudRoot);
  let dashboardPanel = null;

  const timeline = createTimelineController(state, {
    onResetHydraulics: () => {
      labHydraulics.reset(false);
    },
    onCameraPreset: (presetId) => {
      applyModeEnvironment(state.mode);
      setCameraPreset(presetId, false, true);
    },
    onStageChange: (info) => {
      applyModeEnvironment(state.mode);
      if (dashboardPanel) {
        dashboardPanel.update(
          pipelineModel.getSnapshot(),
          pipelineModel.getSensitivityData(),
          pipelineModel.getTrialLogs(),
          info
        );
      }
    },
  });

  function selectComponentById(compId) {
    const info = componentById.get(compId) || null;
    state.selectedComponent = info;
    videoHud.setSelectedComponent(info);
    if (info && compId !== 'AP1' && compId !== 'IR1') {
      if (state.explodeFactor < 0.5) state.explodeFactor = 0.85;
      setCameraPreset('exploded_cad', false);
    }
  }

  dashboardPanel = createDashboardPanel(dashboardRoot, state, {
    onModeChange: (nextMode) => {
      if (timeline.isPlaying()) timeline.pause();
      switchMode(nextMode);
    },
    onMountModeChange: () => {
      if (state.mode === 'river') {
        riverField.update(0.001, state, riverHydraulics.getMetrics());
        syncHardwareMounts();
        if (
          state.cameraPreset === 'river_cross_section' ||
          state.cameraPreset === 'noir_pov' ||
          state.cameraPreset === 'gcp_aerial' ||
          state.cameraPreset === 'exploded_cad'
        ) {
          setCameraPreset(state.cameraPreset, false);
        }
      }
    },
    setCameraPreset: (presetId) => {
      setCameraPreset(presetId, false);
    },
    togglePlay: () => {
      if (timeline.isPlaying()) timeline.pause();
      else timeline.play();
    },
    seekStage: (idx) => {
      timeline.seekStage(idx);
      applyModeEnvironment(state.mode);
    },
    setTimelineProgress: (p) => {
      timeline.setProgress(p);
      applyModeEnvironment(state.mode);
    },
    onStateChange: (key, value) => {
      if (key === 'lidarHeightM') {
        if (state.mode === 'river') state.riverLidarHeightM = value;
        else state.labLidarHeightM = value;
      }
    },
    onToggleHud: (visible) => {
      state.hudVisible = Boolean(visible);
      videoHud.setVisible(state.hudVisible);
    },
    onCaptureTrial: () => {
      pipelineModel.captureTrial(state);
    },
    onResetLogs: () => {
      pipelineModel.resetLogs();
    },
    onSelectComponent: (compId) => {
      selectComponentById(compId);
    },
    getTimelineInfo: () => timeline.getCurrentStageInfo(),
  });

  function syncHudChromeClearance() {
    const topBar = dashboardRoot?.querySelector('.top-bar');
    const bottomBar = dashboardRoot?.querySelector('.bottom-timeline-bar');
    if (topBar) {
      const rect = topBar.getBoundingClientRect();
      if (rect.height > 0) {
        document.documentElement.style.setProperty('--top-bar-clear', `${Math.ceil(rect.bottom + 8)}px`);
      }
    }
    if (bottomBar) {
      const rect = bottomBar.getBoundingClientRect();
      if (rect.height > 0) {
        document.documentElement.style.setProperty(
          '--bottom-bar-clear',
          `${Math.ceil(window.innerHeight - rect.top + 8)}px`
        );
      }
    }
  }

  syncHudChromeClearance();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(syncHudChromeClearance);
    const tb = dashboardRoot?.querySelector('.top-bar');
    const bb = dashboardRoot?.querySelector('.bottom-timeline-bar');
    if (tb) ro.observe(tb);
    if (bb) ro.observe(bb);
  }

  /* ------------------------------------------------------------------------ */
  /*  7. Raycasting for Exploded CAD Hardware Hover & Click Inspection        */
  /* ------------------------------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const inspectRoots = [
    enclosures.controlBoxGroup,
    enclosures.lidarPodGroup,
    enclosures.cameraPodGroup,
    enclosures.irIlluminatorGroup,
    hardwareRig.routerGroup,
  ];
  let downPos = { x: 0, y: 0 };

  function pickHardwareComponent(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(inspectRoots, true);
    if (!hits.length) return null;

    const candidates = [];
    for (const hit of hits) {
      let cur = hit.object;
      let info = null;
      while (cur) {
        if (cur.userData && cur.userData.componentInfo) {
          info = cur.userData.componentInfo;
          break;
        }
        cur = cur.parent;
      }
      if (info) candidates.push(info);
    }

    if (!candidates.length) return null;

    // When exploded, prefer internal PCB/power components over outer housing/lid hits
    if (state.explodeFactor > 0.15) {
      const internalHit = candidates.find(
        (c) => c.id && !c.id.startsWith('ENC-')
      );
      if (internalHit) return internalHit;
    }
    return candidates[0];
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    const info = pickHardwareComponent(e.clientX, e.clientY);
    if (info?.id !== state.hoveredComponent?.id) {
      state.hoveredComponent = info;
      videoHud.setHoveredComponent(info);
      renderer.domElement.style.cursor = info ? 'pointer' : 'grab';
    }
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    if (dx * dx + dy * dy <= 25) {
      const info = pickHardwareComponent(e.clientX, e.clientY);
      state.selectedComponent = info;
      videoHud.setSelectedComponent(info);
    }
  });

  /* ------------------------------------------------------------------------ */
  /*  8. Window Resize & Core Simulation Loop                                 */
  /* ------------------------------------------------------------------------ */

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    syncHudChromeClearance();
  });

  let lastModeSynced = state.mode;
  let lastHudTickMs = 0;

  function stepSimulation(dt) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.05);

    const timelineInfo = timeline.update(safeDt);

    if (state.mode !== lastModeSynced) {
      lastModeSynced = state.mode;
      state.thresholds = getDefaultThresholds(state.mode === 'river' ? 'river' : 'lab');
      applyModeEnvironment(state.mode);
    }

    const isRiver = state.mode === 'river';

    if (!isRiver) {
      labHydraulics.update(safeDt, state);
      const labMetrics = labHydraulics.getMetrics();
      flumeTank.update(safeDt, { ...state, riserFill: labMetrics.riserFill });
      gantryFrame.update(state);
    } else {
      riverHydraulics.update(safeDt, state);
      const riverMetrics = riverHydraulics.getMetrics();
      riverField.update(safeDt, state, riverMetrics);
    }

    waterSystem.update(safeDt, state, labHydraulics, riverHydraulics);
    syncHardwareMounts();
    enclosures.updateExplode(state.explodeFactor, safeDt, state);
    hardwareRig.update(safeDt, state);

    const activeHydraulics = isRiver ? riverHydraulics : labHydraulics;
    const activeMetrics = activeHydraulics.getMetrics();
    const activeParticles = activeHydraulics.getParticles();

    const lidarReading = sensorOptics.update(
      safeDt,
      state,
      activeAnchors,
      activeHydraulics
    );

    const snapshot = pipelineModel.step(
      safeDt,
      state,
      activeMetrics,
      lidarReading,
      activeParticles
    );

    updateLighting(safeDt);

    if (camTransition.active) {
      const k = clamp(safeDt * camTransition.speed, 0.02, 0.35);
      camera.position.lerp(camTransition.posGoal, k);
      controls.target.lerp(camTransition.targetGoal, k);
      if (
        camera.position.distanceToSquared(camTransition.posGoal) < 1e-5 &&
        controls.target.distanceToSquared(camTransition.targetGoal) < 1e-5
      ) {
        camera.position.copy(camTransition.posGoal);
        controls.target.copy(camTransition.targetGoal);
        camTransition.active = false;
      }
    }
    controls.update();

    if (state.hudVisible !== false) {
      videoHud.update(state, snapshot, sensorOptics, renderer, scene, activeParticles);
    }

    const nowMs = performance.now();
    if (nowMs - lastHudTickMs > 75 || (snapshot.newAlerts && snapshot.newAlerts.length > 0)) {
      lastHudTickMs = nowMs;
      dashboardPanel.update(
        snapshot,
        pipelineModel.getSensitivityData(),
        pipelineModel.getTrialLogs(),
        timelineInfo
      );
    }

    renderer.render(scene, camera);
    return snapshot;
  }

  // Initial pose & warm-up frame
  applyModeEnvironment(state.mode);
  setCameraPreset('video_replica', true);
  stepSimulation(0.016);

  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }

  let prevTimeMs = performance.now();
  function animate(nowMs) {
    requestAnimationFrame(animate);
    const dt = (nowMs - prevTimeMs) / 1000;
    prevTimeMs = nowMs;
    stepSimulation(dt);
  }
  requestAnimationFrame(animate);

  /* ------------------------------------------------------------------------ */
  /*  9. Automated Verification & Debug Hook                                  */
  /* ------------------------------------------------------------------------ */

  window.__SIM_DEBUG__ = {
    getState: () => ({ ...state }),
    setState: (patch = {}) => {
      Object.assign(state, patch);
      if (patch.mode) switchMode(patch.mode, { skipCamera: Boolean(patch.cameraPreset) });
      if (patch.cameraPreset) setCameraPreset(patch.cameraPreset, Boolean(patch.instantCamera));
    },
    setMode: (mode, instant = true) => switchMode(mode, { instant }),
    setMountMode: (mountMode, instant = true) => {
      state.riverMountMode = mountMode === 'lab_pole' ? 'lab_pole' : mountMode === 'side_pole' ? 'side_pole' : 'bridge';
      if (state.mode === 'river') {
        riverField.update(0.001, state, riverHydraulics.getMetrics());
        syncHardwareMounts();
        if (instant && state.cameraPreset) setCameraPreset(state.cameraPreset, true);
      }
    },
    setCameraPreset: (presetId, instant = true) => setCameraPreset(presetId, instant),
    getSnapshot: () => pipelineModel.getSnapshot(),
    getTrialLogs: () => pipelineModel.getTrialLogs(),
    getSensitivityData: () => pipelineModel.getSensitivityData(),
    getTimelineInfo: () => timeline.getCurrentStageInfo(),
    seekStage: (idx) => {
      timeline.seekStage(idx);
      applyModeEnvironment(state.mode);
    },
    playTimeline: () => timeline.play(),
    pauseTimeline: () => timeline.pause(),
    setTimelineProgress: (p) => {
      timeline.setProgress(p);
      applyModeEnvironment(state.mode);
    },
    getAnchors: () => ({
      lidar: activeAnchors.lidar.toArray(),
      camera: activeAnchors.camera.toArray(),
      ir: activeAnchors.ir.toArray(),
      controlBox: enclosures.controlBoxGroup.position.toArray(),
      gcpCorners: riverField.getActiveGcpCorners(),
    }),
    getComponentMetadata: () => hardwareRig.getComponentMetadata(),
    inspectComponent: (compId) => selectComponentById(compId),
    getMetrics: () =>
      (state.mode === 'river' ? riverHydraulics : labHydraulics).getMetrics(),
    getRenderStats: () => {
      const gl = renderer.getContext();
      return {
        glError: gl ? gl.getError() : -1,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        cameraPos: camera.position.toArray(),
        targetPos: controls.target.toArray(),
      };
    },
    stepFrames: (n = 1, dt = 0.016) => {
      let snap = null;
      for (let i = 0; i < n; i++) {
        snap = stepSimulation(dt);
      }
      return snap;
    },
  };
}

try {
  initApp();
} catch (err) {
  console.error('Initialization failed:', err);
  const statusEl = document.getElementById('loading-status');
  if (statusEl) {
    statusEl.textContent = `Initialization error: ${err?.message || err}`;
    statusEl.style.color = '#fca5a5';
  }
}

})(THREE, OrbitControls, RoomEnvironment, RiverSimModules.flumeTank, RiverSimModules.gantryFrame, RiverSimModules.riverField, RiverSimModules.enclosures, RiverSimModules.hardwareRig, RiverSimModules.hydraulics, RiverSimModules.realRiverHydraulics, RiverSimModules.waterShader, RiverSimModules.sensorOptics, RiverSimModules.pipelineModel, RiverSimModules.videoHud, RiverSimModules.dashboardPanel, RiverSimModules.timelineController);
