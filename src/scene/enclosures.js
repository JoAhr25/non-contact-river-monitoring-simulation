import * as THREE from 'three';

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
    darkBodyDouble: new THREE.MeshStandardMaterial({
      color: 0x242932,
      roughness: 0.46,
      metalness: 0.35,
      side: THREE.DoubleSide
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
    stainlessDouble: new THREE.MeshStandardMaterial({
      color: 0xcfd6de,
      roughness: 0.24,
      metalness: 0.88,
      side: THREE.DoubleSide
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
      mat.darkBodyDouble
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
    mat.darkBodyDouble
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
    mat.stainlessDouble
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

  // 4 high-power 850nm IR LED domes (unified deep crimson-rose NIR palette)
  const irLedMat = new THREE.MeshStandardMaterial({
    color: 0x26050c,
    emissive: new THREE.Color(0xe11d48),
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

  // Soft radial-gradient 850nm NIR halo disc under face when nightMode is true
  const irHaloTex = createBadgeTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, w * 0.5);
    g.addColorStop(0.0, 'rgba(255, 80, 130, 1.0)');
    g.addColorStop(0.45, 'rgba(225, 29, 72, 0.55)');
    g.addColorStop(1.0, 'rgba(190, 24, 93, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const irGlowHaloMat = new THREE.MeshBasicMaterial({
    map: irHaloTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const irGlowHalo = new THREE.Mesh(
    new THREE.CircleGeometry(0.036, 28),
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
    new THREE.MeshStandardMaterial({ map: lidLabelTex, roughness: 0.45, metalness: 0.05 })
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

export { tagComponentInfo, createEnclosures };
