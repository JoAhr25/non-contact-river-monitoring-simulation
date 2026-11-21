import * as THREE from 'three';

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
  sleeve.receiveShadow = true;
  tee.add(sleeve);

  const bDir = branchDir.clone().normalize();
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.048 * scale, 18),
    mat
  );
  branch.position.copy(bDir).multiplyScalar(0.024 * scale);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bDir);
  branch.castShadow = true;
  branch.receiveShadow = true;
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
  sphere.receiveShadow = true;
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
    leg.receiveShadow = true;
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

  const plainAluminumMat = new THREE.MeshStandardMaterial({
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

    // Bench rear clamp bracket tying gantry post to bamboo apron rail (Lab mode only)
    if (!isRiverLabPole) {
      const benchClamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.054 * S, 0.036 * S, 0.058 * S),
        darkClampMat
      );
      benchClamp.position.set(px, -0.08, POST_Z + 0.025 * S);
      benchClamp.castShadow = true;
      group.add(benchClamp);
    }

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
    isRiverLabPole ? FLOOR_Y + (1.0195 + 0.018) * S : FLOOR_Y + 1.02 * S,
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
    plainAluminumMat
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

    // Keep telescoping inner aluminum bar cleanly inside the upper PVC rail
    const topCapWorld = TOP_Y - 0.018 * S;
    const curCarrierWorld = CARRIER_Y + deltaY;
    const barH = Math.max(0.06 * S, Math.min(innerBarLen, topCapWorld - curCarrierWorld));
    innerBar.scale.y = barH / innerBarLen;
    innerBar.position.y = CARRIER_Y + barH * 0.5;

    sensorMountPos.lidar.y = DEFAULT_LIDAR_Y + deltaY;
    sensorMountPos.camera.y = DEFAULT_CAMERA_Y + deltaY;
    sensorMountPos.ir.y = DEFAULT_IR_Y + deltaY;
  }

  // Initialize innerBar scale immediately at default height
  update({});

  return {
    group,
    topY: TOP_Y,
    sensorMountPos,
    enclosureScale: ES,
    update,
  };
}

export { createGantryFrame };
