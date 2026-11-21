import * as THREE from 'three';

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

function toVector3(v, fallback, out = null) {
  const dst = out || new THREE.Vector3();
  if (!v) return dst.copy(fallback);
  if (v.isVector3) return dst.copy(v);
  return dst.set(v.x ?? fallback.x, v.y ?? fallback.y, v.z ?? fallback.z);
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
    uColor: { value: new THREE.Color('#be185d') },
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
  const _lidarAnchor = new THREE.Vector3();
  const _camAnchor = new THREE.Vector3();
  const _irAnchor = new THREE.Vector3();
  const _riverIrFallback = new THREE.Vector3();
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

    // Turbidity & water surface color optical model (Obj 3E/5D & Jannata et al. 2021)
    let baseSnr = 76;
    let stdNoise = 0.0025;
    let turbidityBias = 0.001;
    if (turbidity === 'clear') {
      baseSnr = 56;
      stdNoise = 0.0038;
      turbidityBias = 0.0042;
    } else if (turbidity === 'turbid_white') {
      baseSnr = 95;
      stdNoise = 0.0012;
      turbidityBias = -0.0022;
    } else if (turbidity === 'silty') {
      baseSnr = 78;
      stdNoise = 0.0022;
      turbidityBias = 0.0008;
    } else if (turbidity === 'muddy') {
      baseSnr = 93;
      stdNoise = 0.0014;
      turbidityBias = 0.0;
    } else if (turbidity === 'algal_green') {
      baseSnr = 80;
      stdNoise = 0.0020;
      turbidityBias = 0.0005;
    } else if (turbidity === 'dark') {
      baseSnr = 48;
      stdNoise = 0.0044;
      turbidityBias = 0.0025;
    }

    // Sun glare interference (Kupper et al.), grazing clear-water reflection loss & 1/R^2 falloff
    const isDarkSky = state.timeOfDay === 'night' || state.timeOfDay === 'night_no_ir';
    const effectiveGlare = isDarkSky ? 0.0 : sunGlare;
    const glarePenalty = effectiveGlare * 42.0;
    const irShotPenalty = nightMode ? 2.5 : 0.0;
    const rangePenalty = isRiver ? 6.5 * Math.log10(Math.max(1.0, trueSlantDistanceM)) : 0.0;
    const clearGrazingLoss =
      turbidity === 'clear'
        ? Math.pow(Math.sin(thetaRad), 1.5) * 28.0
        : Math.pow(Math.sin(thetaRad), 2.0) * 14.0;
    const rainPenalty = rain * 12.0;

    // Smooth signal strength ripple
    const snrRipple = Math.sin(simTime * 5.2) * 2.1 + Math.cos(simTime * 11.7) * 1.2;
    const snr = clamp(
      baseSnr - glarePenalty - irShotPenalty - rangePenalty - clearGrazingLoss - rainPenalty + snrRipple,
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

    // FPS-independent Ornstein-Uhlenbeck smooth sensor noise
    const extraJitter = (chop * 0.0025 + rain * 0.0035 + effectiveGlare * 0.0055) * (isRiver ? 1.8 : 0.65);
    const totalStd = stdNoise + extraJitter;
    const ouAlpha = 1 - Math.exp(-8.0 * dt);
    const ouSigma = totalStd / Math.sqrt(Math.max(0.01, ouAlpha));
    const randWalk = (Math.random() * 2 - 1) * ouSigma;
    smoothNoise += (randWalk - smoothNoise) * ouAlpha;

    // TF-Luna ToF 1 cm native resolution (edge_node/laser_sensor.py) + optional debris beam spike
    const debrisSpike = Number(slantMeta.debrisSpikeM) || 0;
    const bias = isRiver ? turbidityBias * 1.3 : turbidityBias;
    const noisySlantDist = Math.max(0.04, trueSlantDistanceM + bias + smoothNoise - debrisSpike);
    const quantizedM = Math.round(noisySlantDist * 100) / 100;
    const rawLaserDistanceM = inDropout ? lastValidDistance : quantizedM;
    if (!inDropout) lastValidDistance = rawLaserDistanceM;

    // Apply optional slant-range trigonometric compensation: H_water = H_mount - (D_laser * cos(theta))
    const compensatedVerticalM = slantComp ? rawLaserDistanceM * Math.cos(thetaRad) : rawLaserDistanceM;
    const lidarDistanceM = Math.round(compensatedVerticalM * 1000) / 1000;

    const signalStrengthPct = inDropout ? Math.round(snr * 0.25) : Math.round(snr * 10) / 10;
    const signalStrength = Math.round((snr / 100) * 14200 * (inDropout ? 0.12 : 1.0));
    const waterLevelM = Math.max(0, sensorY - lidarDistanceM);

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
    const minReachY = Math.min(targetSurfaceY, cameraPos.y - 0.15);
    for (let i = 0; i < 4; i++) {
      const [nx, ny] = NDC_CORNERS[i];
      _rayCorner.set(nx, ny, 0.5).unproject(pipCamera).sub(cameraPos).normalize();
      let t;
      if (_rayCorner.y < -0.05) {
        t = (minReachY - cameraPos.y) / _rayCorner.y;
      } else {
        // Near-horizon ray: clamp smoothly along forward view direction up to far clip
        t = pipCamera.far * 0.55;
      }
      t = clamp(t, 0.1, pipCamera.far * 0.65);
      _corners[i].copy(cameraPos).addScaledVector(_rayCorner, t);
      _corners[i].y = Math.max(targetSurfaceY + 0.002, _corners[i].y);
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

  function update(dt, state = {}, anchors = null, waterSampler = null, particles = null) {
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
    const lidarPos = toVector3(anchors?.lidar || anchors?.mountAnchor, defaults.lidar, _lidarAnchor);
    const camPos = toVector3(anchors?.camera || anchors?.cameraAnchor, defaults.camera, _camAnchor);
    _riverIrFallback.set(camPos.x + 0.35, camPos.y, camPos.z);
    const irPos = toVector3(anchors?.ir, isRiver ? _riverIrFallback : defaults.ir, _irAnchor);

    const showOptics = state.showOptics !== false;
    const showLidar = showOptics && state.showLidarBeam !== false;
    const showFov = showOptics && state.showCameraFov !== false;

    // 1. Intersect TF-Luna LiDAR ray using 16-step bracketed ray-march + 6 binary refinements
    const thetaDeg = isAnySidePole ? clamp(Number(state.riverLidarTiltDeg ?? 32), 0, 45) : 0;
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const slantComp = isAnySidePole ? state.riverLidarSlantComp !== false : true;
    _lidarDir.set(0, -Math.cos(thetaRad), Math.sin(thetaRad)).normalize();

    const evalRayClearance = (tVal) => {
      const px = lidarPos.x + _lidarDir.x * tVal;
      const py = lidarPos.y + _lidarDir.y * tVal;
      const pz = lidarPos.z + _lidarDir.z * tVal;
      const wY = sampleWaterY(waterSampler, px, pz, isRiver);
      const bY = isRiver && typeof waterSampler?.getBedY === 'function' ? waterSampler.getBedY(pz) : -99;
      return { clearance: py - Math.max(wY, bY), wY, bY, surfY: Math.max(wY, bY), px, pz };
    };

    const tMax = isRiver ? 12.0 : 2.5;
    let tLo = 0.05;
    let tHi = tMax;
    let bracketFound = false;
    let prevRes = evalRayClearance(tLo);
    for (let s = 1; s <= 16; s++) {
      const tCur = 0.05 + (tMax - 0.05) * (s / 16);
      const curRes = evalRayClearance(tCur);
      if (prevRes.clearance >= 0 && curRes.clearance <= 0) {
        tHi = tCur;
        bracketFound = true;
        break;
      }
      tLo = tCur;
      prevRes = curRes;
    }

    if (!bracketFound) {
      const wlFallback = sampleWaterY(waterSampler, lidarPos.x, lidarPos.z, isRiver);
      tLo = Math.max(0.05, (lidarPos.y - wlFallback) / Math.max(0.2, -_lidarDir.y));
    } else {
      for (let b = 0; b < 6; b++) {
        const tMid = 0.5 * (tLo + tHi);
        const midRes = evalRayClearance(tMid);
        if (midRes.clearance > 0) tLo = tMid;
        else tHi = tMid;
      }
    }

    const tHit = clamp(bracketFound ? 0.5 * (tLo + tHi) : tLo, 0.05, tMax);
    const hitRes = evalRayClearance(tHit);
    const hitX = hitRes.px;
    const hitZ = hitRes.pz;
    const waterAtHit = hitRes.wY;
    const bedAtHit = hitRes.bY;
    const hitSurfaceY = hitRes.surfY;
    const hitDryBank = isRiver && bedAtHit > waterAtHit + 0.005;

    // 2° full-angle TF-Luna beam footprint transient debris occlusion spike
    let debrisSpikeM = 0;
    const activeList = Array.isArray(particles)
      ? particles
      : typeof waterSampler?.getParticles === 'function'
        ? waterSampler.getParticles()
        : null;
    if (Array.isArray(activeList)) {
      const beamHalfR = Math.max(0.015, tHit * Math.tan((1.0 * Math.PI) / 180));
      for (let i = 0; i < activeList.length; i++) {
        const pt = activeList[i];
        const rad = beamHalfR + (pt.size || 0.02) * 0.5;
        const dxP = pt.x - hitX;
        const dzP = pt.z - hitZ;
        if (dxP * dxP + dzP * dzP <= rad * rad) {
          debrisSpikeM = Math.max(debrisSpikeM, clamp((pt.size || 0.02) * 0.45, 0.008, 0.045));
        }
      }
    }

    const reading = simulateLidarReading(clampedDt, state, lidarPos.y, hitSurfaceY, isRiver, {
      thetaRad,
      thetaDeg,
      slantComp,
      trueSlantDistanceM: tHit,
      hitDryBank,
      debrisSpikeM,
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

export { createSensorOptics };
