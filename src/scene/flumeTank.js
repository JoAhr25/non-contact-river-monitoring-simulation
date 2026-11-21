import * as THREE from 'three';

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
  const topPad = edges.top ? rim * 0.5 : 0;
  const botPad = edges.bottom ? rim * 0.5 : 0;
  const sideH = Math.max(0.002, h - topPad - botPad);
  const sideCenterY = (botPad - topPad) * 0.5;
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
    const strip = new THREE.Mesh(new THREE.BoxGeometry(rim, sideH, d + 0.0004), edgeMat);
    strip.position.set(-w * 0.5, sideCenterY, 0);
    strip.renderOrder = 9;
    g.add(strip);
  }
  if (edges.right) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(rim, sideH, d + 0.0004), edgeMat);
    strip.position.set(w * 0.5, sideCenterY, 0);
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
    opacity: 0.14,
    roughness: 0.04,
    metalness: 0.02,
    ior: 1.49,
    reflectivity: 0.95,
    envMapIntensity: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    depthWrite: false,
    side: THREE.FrontSide,
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

    const headSide = buildGlassPanel(0.21, 0.508, T, glassMat, glassEdgeMat, {
      top: true,
      left: true,
      right: true,
      bottom: true,
    });
    headSide.position.set(-0.375, 0.266, zPos);
    glassTankGroup.add(headSide);

    const mainSide = buildGlassPanel(0.75, 0.408, T, glassMat, glassEdgeMat, {
      top: true,
      left: false,
      right: true,
      bottom: true,
    });
    mainSide.position.set(0.105, 0.216, zPos);
    glassTankGroup.add(mainSide);
  }

  // Objective 3A Front-Glass Metric Scale Ruler (0..40 cm above datum y = 0.012 m)
  const glassRulerTex = createCanvasTexture(128, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.86)';
    ctx.fillRect(0, 0, w * 0.48, h);
    ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px monospace';
    ctx.textBaseline = 'middle';
    for (let cm = 0; cm <= 40; cm++) {
      const y = h - (cm / 40) * h;
      const isMajor = cm % 5 === 0;
      const tickW = isMajor ? w * 0.34 : w * 0.18;
      ctx.lineWidth = isMajor ? 2.5 : 1.3;
      ctx.beginPath();
      ctx.moveTo(w * 0.48 - tickW, y);
      ctx.lineTo(w * 0.48, y);
      ctx.stroke();
      if (isMajor && cm > 0 && cm < 40) {
        ctx.fillText(String(cm), w * 0.54, y);
      }
    }
    // Nominal 33.5 cm marker line
    const yNom = h - (33.5 / 40) * h;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, yNom);
    ctx.lineTo(w * 0.48, yNom);
    ctx.stroke();
  });
  const glassRuler = new THREE.Mesh(
    new THREE.PlaneGeometry(0.024, 0.40),
    new THREE.MeshBasicMaterial({ map: glassRulerTex, transparent: true, depthWrite: false })
  );
  glassRuler.name = 'Objective3AMetricRuler';
  glassRuler.position.set(-0.252, 0.212, 0.1806);
  glassRuler.renderOrder = 10;
  glassTankGroup.add(glassRuler);

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
    top: false,
    bottom: true,
  });
  dividerMain.position.set(-0.270, 0.265, 0);
  glassTankGroup.add(dividerMain);

  const notchSill = new THREE.Mesh(new THREE.BoxGeometry(T + 0.0004, 0.0024, 0.18), glassEdgeMat);
  notchSill.position.set(-0.270, 0.450, 0);
  notchSill.renderOrder = 9;
  glassTankGroup.add(notchSill);

  for (const zSign of [-1, 1]) {
    const wing = buildGlassPanel(T, 0.070, 0.085, glassMat, glassEdgeMat, {
      top: true,
      bottom: false,
    });
    wing.position.set(-0.270, 0.485, zSign * 0.1325);
    glassTankGroup.add(wing);
  }

  // Raised Horizontal Glass Return Shelf: x in [-0.2675, +0.2975] at y = 0.080 .. 0.085 (top y = 0.085)
  const returnShelf = buildGlassPanel(0.565, T, 0.35, glassMat, glassEdgeMat, {
    top: false,
    bottom: false,
    left: true,
    right: true,
  });
  returnShelf.position.set(0.015, 0.0825, 0);
  glassTankGroup.add(returnShelf);

  // Subtle vertical glass support ribs along front/back inner faces under the shelf (y = 0.012 .. 0.080)
  for (const rx of [-0.08, 0.11, 0.293]) {
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
    roughness: 0.52,
    metalness: 0.04,
  });

  const rockTextures = createRockTextures();
  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTextures.map,
    bumpMap: rockTextures.bumpMap,
    bumpScale: 0.0024,
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.05,
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

        // Leave small clearance around back-wall WaveMakers in Step 1 and Step 3
        if (spec.id === 'step1' && Math.hypot(candX + 0.23, candZ + 0.141) < 0.044) {
          continue;
        }
        if (spec.id === 'step3' && Math.hypot(candX - 0.22, candZ + 0.141) < 0.042) {
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
    opacity: 0.72,
    depthWrite: false,
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
  riserPipe.renderOrder = 4;
  pvcGroup.add(riserPipe);

  // Blue mid-riser coupling collar (visible in Photo 2)
  const riserCoupler = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.032, 18), bluePvcMat);
  riserCoupler.position.set(-0.38, 0.29, -0.02);
  riserCoupler.renderOrder = 4;
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
  riserWaterColumn.renderOrder = 3;
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
  dropPipe.renderOrder = 4;
  pvcGroup.add(dropPipe);

  // Subtle dark inner bore ring at nozzle exit
  const nozzleLip = new THREE.Mesh(
    new THREE.TorusGeometry(PIPE_R * 0.9, 0.002, 8, 16),
    bluePvcMat
  );
  nozzleLip.rotation.x = Math.PI / 2;
  nozzleLip.position.set(-0.21, 0.43, -0.02);
  nozzleLip.renderOrder = 4;
  pvcGroup.add(nozzleLip);

  group.add(pvcGroup);

  /* -------------------- 5. 2x Submersible Aquarium Wave Makers -------------------- */

  const waveMakers = [];
  const wmDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1d2228,
    roughness: 0.46,
    metalness: 0.14,
  });
  const wmShroudMat = new THREE.MeshStandardMaterial({
    color: 0x1d2228,
    roughness: 0.46,
    metalness: 0.14,
    side: THREE.DoubleSide,
  });
  const wmAccentMat = new THREE.MeshStandardMaterial({
    color: 0x2692b8,
    roughness: 0.35,
  });

  // Submerged cleanly above Step 1 & Step 3 rock beds and below nominal water surfaces
  const wmPositions = [
    { x: -0.23, y: 0.310, z: -0.141 },
    { x: 0.22, y: 0.181, z: -0.141 },
  ];

  for (let idx = 0; idx < wmPositions.length; idx++) {
    const pos = wmPositions[idx];
    const wmGroup = new THREE.Group();
    wmGroup.name = `WaveMaker_${idx + 1}`;
    wmGroup.position.set(pos.x, pos.y, pos.z);

    // Magnetic suction base flush with back inner glass wall (z = -0.175)
    const suctionPad = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.010, 16), rubberMat);
    suctionPad.rotation.x = Math.PI / 2;
    suctionPad.position.z = -0.029;
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
      wmShroudMat
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

  function update(dt, state = {}, riserFillOverride = undefined) {
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
    const rawRiser = riserFillOverride !== undefined ? riserFillOverride : state.riserFill;
    const targetFill =
      rawRiser !== undefined
        ? clamp(Number(rawRiser), 0, 1)
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

export { createFlumeTank };
