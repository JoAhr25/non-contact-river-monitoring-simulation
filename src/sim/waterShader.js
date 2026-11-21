import * as THREE from 'three';
import { LAB_GEOMETRY } from './hydraulics.js';
import { defaultGuimbalBedHeight } from './realRiverHydraulics.js';

const TURBIDITY_PALETTES = {
  clear: {
    labColor: new THREE.Color('#2794b8'),
    labDeep: new THREE.Color('#136582'),
    labOpacity: 0.44,
    riverShallow: new THREE.Color('#349ca6'),
    riverDeep: new THREE.Color('#12576b'),
    riverOpacity: 0.68,
  },
  turbid_white: {
    labColor: new THREE.Color('#d4e0e6'),
    labDeep: new THREE.Color('#95aab6'),
    labOpacity: 0.84,
    riverShallow: new THREE.Color('#c7d3d9'),
    riverDeep: new THREE.Color('#86969f'),
    riverOpacity: 0.90,
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
  algal_green: {
    labColor: new THREE.Color('#3f7d4a'),
    labDeep: new THREE.Color('#24542e'),
    labOpacity: 0.82,
    riverShallow: new THREE.Color('#4d8047'),
    riverDeep: new THREE.Color('#274f29'),
    riverOpacity: 0.90,
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
    vec3 nightTint = mix(vec3(1.0), vec3(0.32, 0.40, 0.54), uNightMode);
    float rim = pow(1.0 - clamp(abs(normalize(vNormalW).z), 0.0, 1.0), 1.8);
    vec3 col = mix(uWaterColor, uFoamColor, foamAmt) * nightTint + uFoamColor * rim * 0.22 * nightTint;

    float alpha = clamp((uOpacity * 0.72 + foamAmt * 0.42) * clamp(uFlow, 0.0, 1.0), 0.0, 0.95);
    alpha *= mix(0.65, 1.0, edgeFade);
    gl_FragColor = vec4(col, alpha);
  }
`;

const RIVER_VERTEX = /* glsl */ `
  attribute float aBedY;
  attribute float aRowIdx;
  uniform float uTime;
  uniform float uWaterLevel;
  uniform float uWindChop;
  uniform float uRainIntensity;
  uniform float uRowFlow[97];

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

    int rowIdx = int(clamp(aRowIdx + 0.5, 0.0, 96.0));
    vWorldPos = wp.xyz;
    vBedY = aBedY;
    vFlowScroll = uRowFlow[rowIdx];
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
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNightMode;
  uniform float uRainIntensity;
  uniform float uWindChop;
  uniform vec2 uPierXZ;
  uniform float uBridgeActive;
  uniform vec3 uIrSpotPos;
  uniform vec3 uIrSpotDir;
  uniform float uIrSpotIntensity;
  uniform float uIrSpotCosCone;

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

    // Time-varying capillary/chop normal perturbation (keeps calm margins alive)
    float eps = 0.12;
    vec2 normUv = flowUv * 1.2 + vec2(uTime * 0.14, -uTime * 0.10);
    float nxA = fbm(normUv + vec2(eps, 0.0)) - fbm(normUv - vec2(eps, 0.0));
    float nzA = fbm(normUv + vec2(0.0, eps)) - fbm(normUv - vec2(0.0, eps));
    float normalStrength = 1.6 + 2.4 * uWindChop + 1.4 * uRainIntensity;
    vec3 N = normalize(vec3(-nxA * normalStrength - rain.x * 0.55, 1.0, -nzA * normalStrength - rain.y * 0.55));

    vec3 toCam = cameraPosition - vWorldPos;
    float viewDist = length(toCam);
    vec3 V = toCam / max(0.001, viewDist);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    // Analytic bridge deck shadow projected along sun direction onto water surface
    float shadowShiftX = -(5.10 - uWaterLevel) * (L.x / max(0.25, L.y));
    float shadowShiftZ = -(5.10 - uWaterLevel) * (L.z / max(0.25, L.y));
    float underDeckX = 1.0 - smoothstep(0.95, 1.45, abs(vWorldPos.x - shadowShiftX));
    float underDeckZ = 1.0 - smoothstep(10.8, 11.6, abs(vWorldPos.z - shadowShiftZ));
    float sunVis = 1.0 - 0.74 * uBridgeActive * underDeckX * underDeckZ;

    // Depth-based turbidity color blending
    float depthMix = smoothstep(0.05, 1.35, depth);
    vec3 baseCol = mix(uShallowColor, uDeepColor, depthMix);
    baseCol *= (0.86 + 0.26 * n1);

    // Fresnel sky reflection synced to active sky palette
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
    vec3 nightAmbient = mix(vec3(1.0), vec3(0.26, 0.32, 0.44), uNightMode);
    vec3 diffuseLit = baseCol * nightAmbient * mix(0.62, 1.0, sunVis);
    vec3 col = mix(diffuseLit, uSkyColor, clamp(fresnel * 0.56, 0.05, 0.65));

    // Specular sun glare highlight (blocked cleanly under bridge deck shadow)
    float specPow = mix(95.0, 38.0, clamp(uWindChop * 0.7 + uRainIntensity * 0.4, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), specPow) * sunVis;
    float glareFactor = mix(0.25, 2.8, clamp(uSunGlare, 0.0, 1.0)) * mix(1.0, 0.20, uNightMode);
    vec3 glareCol = mix(vec3(1.0, 0.97, 0.88), vec3(0.7, 0.78, 1.0), uNightMode);
    col += glareCol * spec * glareFactor;

    // Active 850 nm IR spotlight pool on water surface (Night Mode)
    if (uIrSpotIntensity > 0.01) {
      vec3 toFrag = vWorldPos - uIrSpotPos;
      float irDist = length(toFrag);
      vec3 irRay = toFrag / max(0.01, irDist);
      float cosAng = dot(irRay, normalize(uIrSpotDir));
      float coneFall = smoothstep(uIrSpotCosCone, mix(uIrSpotCosCone, 1.0, 0.45), cosAng);
      float atten = 1.0 / (1.0 + 0.045 * irDist * irDist);
      col += vec3(0.86, 0.24, 0.56) * (coneFall * atten * uIrSpotIntensity * (0.28 + 0.35 * spec));
    }

    // Shoreline foam & bridge pier bow/wake foam
    float shoreFoam = smoothstep(0.16, 0.01, depth) * (0.45 + 0.55 * n2);
    float dPierUpstream = length(vec2((vWorldPos.x - (uPierXZ.x - 0.32)) * 1.4, vWorldPos.z - uPierXZ.y));
    float pierBowFoam = uBridgeActive * smoothstep(0.65, 0.18, dPierUpstream) * smoothstep(0.1, 0.5, depth);
    float wakeBand = exp(-pow((vWorldPos.z - uPierXZ.y) / 0.42, 2.0)) * smoothstep(0.0, 0.6, vWorldPos.x - uPierXZ.x) * exp(-(vWorldPos.x - uPierXZ.x) * 0.28);
    float wakeFoam = uBridgeActive * wakeBand * smoothstep(0.42, 0.78, n2) * 0.75;
    float chopFoam = smoothstep(0.66, 0.88, n2) * (0.12 + 0.45 * uWindChop);
    float rainFoam = clamp(rain.z * 0.38, 0.0, 0.55);

    float totalFoam = clamp(shoreFoam * 0.55 + pierBowFoam * 0.8 + wakeFoam + chopFoam + rainFoam, 0.0, 0.9);
    vec3 foamColor = mix(vec3(0.92, 0.95, 0.97), vec3(0.42, 0.48, 0.58), uNightMode) * mix(0.75, 1.0, sunVis);
    col = mix(col, foamColor, totalFoam);

    // Match exponential horizon fog of river scene
    float fogFactor = clamp(1.0 - exp(-uFogDensity * uFogDensity * viewDist * viewDist), 0.0, 1.0);
    col = mix(col, uFogColor, fogFactor);

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

  // Tileable subtle ripple bump texture for lab surface reflections
  const labRippleCanvas = document.createElement('canvas');
  labRippleCanvas.width = 128;
  labRippleCanvas.height = 128;
  const lrCtx = labRippleCanvas.getContext('2d');
  lrCtx.fillStyle = '#808080';
  lrCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 420; i++) {
    const rx = (i * 73) % 128;
    const ry = (i * 119) % 128;
    const rr = 5 + (i % 9);
    const v = 104 + (i % 52);
    lrCtx.strokeStyle = `rgba(${v},${v},${v},0.35)`;
    lrCtx.lineWidth = 1.5;
    for (const ox of [-128, 0, 128]) {
      for (const oy of [-128, 0, 128]) {
        lrCtx.beginPath();
        lrCtx.arc(rx + ox, ry + oy, rr, 0, Math.PI * 2);
        lrCtx.stroke();
      }
    }
  }
  const labRippleTex = new THREE.CanvasTexture(labRippleCanvas);
  labRippleTex.wrapS = THREE.RepeatWrapping;
  labRippleTex.wrapT = THREE.RepeatWrapping;
  labRippleTex.repeat.set(3, 2);

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
    bumpMap: labRippleTex,
    bumpScale: 0.0022,
    roughness: 0.06,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
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

  // Keep step water volume inside styrofoam/sand footprint so dry white foam isn't wrapped in blue water
  const stepVolWidthZ = G.width - 0.006;
  const volStep1 = createVolumeBox(G.step1.xMin, G.step1.xMax, stepVolWidthZ, G.step1.sandTopY);
  const volStep2 = createVolumeBox(G.step2.xMin, G.step2.xMax, stepVolWidthZ, G.step2.sandTopY);
  const volStep3 = createVolumeBox(G.step3.xMin, G.step3.xMax, stepVolWidthZ, G.step3.sandTopY);
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
  const waterfallBaseUniforms = {
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
    uniforms: waterfallBaseUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  function createWaterfallSheet(weirX, weirY) {
    const segZ = 14;
    const segV = 16;
    const geom = new THREE.PlaneGeometry(1, 1, segZ, segV);
    const mat = new THREE.ShaderMaterial({
      vertexShader: WATERFALL_VERTEX,
      fragmentShader: WATERFALL_FRAGMENT,
      uniforms: {
        uTime: waterfallBaseUniforms.uTime,
        uFlow: { value: 1.0 },
        uWaterColor: waterfallBaseUniforms.uWaterColor,
        uFoamColor: waterfallBaseUniforms.uFoamColor,
        uOpacity: waterfallBaseUniforms.uOpacity,
        uNightMode: waterfallBaseUniforms.uNightMode,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 4;
    labWaterGroup.add(mesh);
    return { mesh, mat, geom, weirX, weirY, segZ, segV };
  }

  const wf1 = createWaterfallSheet(G.step1.xMax + 0.002, G.step1.weirY);
  const wf2 = createWaterfallSheet(G.step2.xMax + 0.002, G.step2.weirY);
  const wf3 = createWaterfallSheet(G.step3.xMax + 0.002, G.step3.weirY);

  function updateWaterfallSheet(wf, upperY, lowerY, qFlow) {
    const head = Math.max(0, upperY - wf.weirY);
    const active = head > 0.0005 && qFlow > 1e-5;
    wf.mesh.visible = active;
    if (!active) return;

    wf.mat.uniforms.uFlow.value = clamp(qFlow / 0.00118, 0.05, 1.5);
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
        const rippleX = Math.sin(uZ * 18.0 + s * 8.0 - waterfallBaseUniforms.uTime.value * 7.0) * 0.0012 * s;
        pos.setXYZ(idx, x + rippleX, y, z);
      }
    }
    pos.needsUpdate = true;
    wf.geom.computeVertexNormals();
  }

  // Inlet Jet Stream from blue PVC drop nozzle (-0.21, 0.43, -0.02)
  const inletJetUniforms = {
    uTime: waterfallBaseUniforms.uTime,
    uFlow: { value: 1.0 },
    uWaterColor: waterfallBaseUniforms.uWaterColor,
    uFoamColor: waterfallBaseUniforms.uFoamColor,
    uOpacity: { value: 0.85 },
    uNightMode: waterfallBaseUniforms.uNightMode,
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

  // Soft radial foam splash sprite at jet entry on Step 1 surface
  const splashCanvas = document.createElement('canvas');
  splashCanvas.width = 128;
  splashCanvas.height = 128;
  const spCtx = splashCanvas.getContext('2d');
  const spGrad = spCtx.createRadialGradient(64, 64, 10, 64, 64, 62);
  spGrad.addColorStop(0.0, 'rgba(238, 248, 255, 0.10)');
  spGrad.addColorStop(0.45, 'rgba(238, 248, 255, 0.88)');
  spGrad.addColorStop(0.75, 'rgba(210, 238, 255, 0.42)');
  spGrad.addColorStop(1.0, 'rgba(200, 235, 255, 0.0)');
  spCtx.fillStyle = spGrad;
  spCtx.fillRect(0, 0, 128, 128);
  const splashTex = new THREE.CanvasTexture(splashCanvas);
  const splashRingMat = new THREE.MeshBasicMaterial({
    map: splashTex,
    color: '#eef8ff',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const splashRing = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.064), splashRingMat);
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

  // Lab floating debris mesh pool (reuses GPU geometries/materials across despawns)
  const labDebrisGroup = new THREE.Group();
  labWaterGroup.add(labDebrisGroup);
  const labDebrisPool = new Map();
  const labDebrisFreeByKey = new Map();
  const labActiveIdSet = new Set();

  function syncLabDebrisMeshes(particles) {
    labActiveIdSet.clear();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      labActiveIdSet.add(p.id);
      let mesh = labDebrisPool.get(p.id);
      if (!mesh) {
        const key = `${p.type}:${(p.size || 0.01).toFixed(3)}`;
        const freeList = labDebrisFreeByKey.get(key);
        if (freeList && freeList.length > 0) {
          mesh = freeList.pop();
        } else {
          mesh = buildLabDebrisMesh(p.type, p.size);
          mesh.userData._poolKey = key;
          labDebrisGroup.add(mesh);
        }
        labDebrisPool.set(p.id, mesh);
      }
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(0, p.rotY || 0, p.rotZ || 0);
    }
    for (const [id, mesh] of labDebrisPool.entries()) {
      if (!labActiveIdSet.has(id)) {
        mesh.visible = false;
        const key = mesh.userData._poolKey || 'default';
        let list = labDebrisFreeByKey.get(key);
        if (!list) {
          list = [];
          labDebrisFreeByKey.set(key, list);
        }
        list.push(mesh);
        labDebrisPool.delete(id);
      }
    }
  }

  /* -------------------- PHASE 2: GUIMBAL RIVER SYSTEM --------------------- */

  const RIVER_LEN_X = 28.0; // x in [-14, +14]
  const RIVER_WID_Z = 19.0; // z in [-9.5, +9.5] covering 12 m channel & overbank floods
  const SEG_X = 96;
  const SEG_Z = 96;

  const riverGeom = new THREE.PlaneGeometry(RIVER_LEN_X, RIVER_WID_Z, SEG_X, SEG_Z);
  riverGeom.rotateX(-Math.PI / 2);

  const riverPosAttr = riverGeom.attributes.position;
  const vCount = riverPosAttr.count;
  const bedYArray = new Float32Array(vCount);
  const rowIdxArray = new Float32Array(vCount);

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
      const idx = r * colsX + c;
      bedYArray[idx] = bY;
      rowIdxArray[idx] = r;
    }
  }

  riverGeom.setAttribute('aBedY', new THREE.BufferAttribute(bedYArray, 1));
  riverGeom.setAttribute('aRowIdx', new THREE.BufferAttribute(rowIdxArray, 1));

  const riverUniforms = {
    uTime: { value: 0 },
    uWaterLevel: { value: 1.15 },
    uShallowColor: { value: new THREE.Color('#8a835a') },
    uDeepColor: { value: new THREE.Color('#5c593c') },
    uOpacity: { value: 0.86 },
    uSunGlare: { value: 0.25 },
    uSunDir: { value: new THREE.Vector3(8.5, 13.5, 7.5).normalize() },
    uSkyColor: { value: new THREE.Color('#89bddc') },
    uFogColor: { value: new THREE.Color('#89bddc') },
    uFogDensity: { value: 0.013 },
    uNightMode: { value: 0.0 },
    uRainIntensity: { value: 0.0 },
    uWindChop: { value: 0.15 },
    uPierXZ: { value: new THREE.Vector2(0.0, -4.2) },
    uBridgeActive: { value: 1.0 },
    uRowFlow: { value: rowFlowAccum },
    uIrSpotPos: { value: new THREE.Vector3(0.95, 4.4, -0.35) },
    uIrSpotDir: { value: new THREE.Vector3(0, -1, 0) },
    uIrSpotIntensity: { value: 0.0 },
    uIrSpotCosCone: { value: Math.cos(Math.PI * 0.34) },
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

  // River floating debris pool (reuses GPU geometries/materials across despawns)
  const riverDebrisGroup = new THREE.Group();
  riverWaterGroup.add(riverDebrisGroup);
  const riverDebrisPool = new Map();
  const riverDebrisFreeByKey = new Map();
  const riverActiveIdSet = new Set();

  function syncRiverDebrisMeshes(particles) {
    riverActiveIdSet.clear();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      riverActiveIdSet.add(p.id);
      let mesh = riverDebrisPool.get(p.id);
      if (!mesh) {
        const key = `${p.type}:${(p.size || 0.25).toFixed(2)}`;
        const freeList = riverDebrisFreeByKey.get(key);
        if (freeList && freeList.length > 0) {
          mesh = freeList.pop();
        } else {
          mesh = buildRiverDebrisMesh(p.type, p.size);
          mesh.userData._poolKey = key;
          riverDebrisGroup.add(mesh);
        }
        riverDebrisPool.set(p.id, mesh);
      }
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(0, p.rotY || 0, p.rotZ || 0);
    }
    for (const [id, mesh] of riverDebrisPool.entries()) {
      if (!riverActiveIdSet.has(id)) {
        mesh.visible = false;
        const key = mesh.userData._poolKey || 'default';
        let list = riverDebrisFreeByKey.get(key);
        if (!list) {
          list = [];
          riverDebrisFreeByKey.set(key, list);
        }
        list.push(mesh);
        riverDebrisPool.delete(id);
      }
    }
  }

  /* -------------------- UNIFIED UPDATE LOOP ------------------------------- */

  let elapsed = 0;

  function update(dt, state = {}, labHydraulics = null, riverHydraulics = null, env = null) {
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
    const isNightSky = state.timeOfDay === 'night' || state.timeOfDay === 'night_no_ir' || Boolean(state.nightMode);
    const labDarken = isNightSky ? (state.nightMode ? 0.54 : 0.36) : 1.0;

    if (!isRiver && labHydraulics) {
      const m = env?.metrics || labHydraulics.getMetrics();
      const particles = env?.particles || labHydraulics.getParticles();

      labVolumeMat.color.copy(turb.labDeep).multiplyScalar(labDarken);
      labVolumeMat.opacity = turb.labOpacity * 0.62;
      labSurfaceMat.color.copy(turb.labColor).multiplyScalar(labDarken);
      labSurfaceMat.opacity = clamp(turb.labOpacity + 0.16, 0.35, 0.92);
      labRippleTex.offset.x = (elapsed * 0.32) % 1;
      labRippleTex.offset.y = Math.sin(elapsed * 0.6) * 0.05;

      // Update volume heights cleanly below wave troughs
      volHeadbox.scale.y = Math.max(0.003, m.y_headbox - LAB_GEOMETRY.floorY - 0.003);
      volReturn.scale.y = Math.max(
        0.004,
        Math.min(LAB_GEOMETRY.returnTopY, Math.max(m.y_headbox, m.y_basin)) - LAB_GEOMETRY.floorY
      );
      volStep1.scale.y = Math.max(0.002, m.y_w1 - G.step1.sandTopY - 0.004);
      volStep2.scale.y = Math.max(0.002, m.y_w2 - G.step2.sandTopY - 0.004);
      volStep3.scale.y = Math.max(0.002, m.y_w3 - G.step3.sandTopY - 0.004);
      volBasin.scale.y = Math.max(0.003, m.y_basin - LAB_GEOMETRY.floorY - 0.003);

      // Update dynamic wave surfaces
      updateLabSurfaceGrid(surfHeadbox, labHydraulics, m.y_headbox);
      updateLabSurfaceGrid(surfStep1, labHydraulics, m.y_w1);
      updateLabSurfaceGrid(surfStep2, labHydraulics, m.y_w2);
      updateLabSurfaceGrid(surfStep3, labHydraulics, m.y_w3);
      updateLabSurfaceGrid(surfBasin, labHydraulics, m.y_basin);

      // Update waterfalls & inlet jet stream
      waterfallBaseUniforms.uTime.value = elapsed;
      waterfallBaseUniforms.uWaterColor.value.copy(turb.labColor);
      waterfallBaseUniforms.uOpacity.value = clamp(turb.labOpacity + 0.3, 0.5, 0.95);
      waterfallBaseUniforms.uNightMode.value = isNightSky ? 1.0 : 0.0;

      updateWaterfallSheet(wf1, m.y_w1, m.y_w2, m.qWeir1);
      updateWaterfallSheet(wf2, m.y_w2, m.y_w3, m.qWeir2);
      updateWaterfallSheet(wf3, m.y_w3, m.y_basin, m.qWeir3);

      const jetActive = m.inflowActive && m.inflowRate > 1e-5;
      inletJetMesh.visible = jetActive;
      splashRing.visible = jetActive;
      if (jetActive) {
        const dropH = Math.max(0.01, LAB_GEOMETRY.nozzlePos.y - m.y_w1);
        const jetFlowNorm = clamp(m.inflowRate / 0.00118, 0.3, 1.4);
        inletJetUniforms.uFlow.value = jetFlowNorm;
        inletJetMesh.scale.set(0.75 + 0.35 * jetFlowNorm, dropH, 0.75 + 0.35 * jetFlowNorm);
        splashRing.position.y = m.y_w1 + 0.0025;
        const pulse = 0.88 + 0.22 * Math.sin(elapsed * 14.0);
        splashRing.scale.setScalar(pulse * (0.7 + 0.35 * jetFlowNorm));
      }

      splashRingMat.color.copy(turb.labColor).lerp(waterfallBaseUniforms.uFoamColor.value, 0.72).multiplyScalar(labDarken);
      bubbleMat.color.copy(turb.labColor).lerp(waterfallBaseUniforms.uFoamColor.value, 0.78).multiplyScalar(labDarken);

      updateLabBubbles(elapsed, m);
      syncLabDebrisMeshes(particles);
    }

    if (isRiver && riverHydraulics) {
      const m = env?.metrics || riverHydraulics.getMetrics();
      const particles = env?.particles || riverHydraulics.getParticles();

      const rU = riverMat.uniforms;
      rU.uTime.value = m.simTime ?? elapsed;
      rU.uWaterLevel.value = m.waterLevelM;
      rU.uShallowColor.value.copy(turb.riverShallow);
      rU.uDeepColor.value.copy(turb.riverDeep);
      rU.uOpacity.value = turb.riverOpacity;
      rU.uSunGlare.value = clamp(
        state.sunGlare !== undefined ? Number(state.sunGlare) : 0.25,
        0,
        1
      );
      rU.uNightMode.value = isNightSky ? (state.nightMode ? 0.85 : 1.0) : 0.0;
      rU.uRainIntensity.value = clamp(m.rainIntensity || 0, 0, 1);
      rU.uWindChop.value = clamp(m.windChop || 0.15, 0, 1);
      rU.uBridgeActive.value =
        state.riverMountMode !== 'side_pole' && state.riverMountMode !== 'lab_pole' ? 1.0 : 0.0;

      if (env?.sunDir) rU.uSunDir.value.copy(env.sunDir);
      if (env?.skyColor) rU.uSkyColor.value.copy(env.skyColor);
      if (env?.fogColor) rU.uFogColor.value.copy(env.fogColor);
      if (env?.fogDensity !== undefined) rU.uFogDensity.value = env.fogDensity;
      if (env?.irSpotPos) rU.uIrSpotPos.value.copy(env.irSpotPos);
      if (env?.irSpotDir) rU.uIrSpotDir.value.copy(env.irSpotDir);
      rU.uIrSpotIntensity.value = env?.irSpotIntensity ?? (nightTarget > 0.5 ? 1.0 : 0.0);

      // Update per-Z-row cumulative downstream advection via compact 97-float uniform array
      for (let r = 0; r < rowsZ; r++) {
        const vel = riverHydraulics.getVelocityAtZ(rowZCoords[r], 0.8);
        rowFlowAccum[r] += vel * clampedDt;
      }

      syncRiverDebrisMeshes(particles);
    }
  }

  function disposeGroupChildren(grp) {
    grp.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          if (m.bumpMap) m.bumpMap.dispose();
          m.dispose();
        }
      }
    });
  }

  function dispose() {
    labRippleTex.dispose();
    splashTex.dispose();
    waterfallMat.dispose();
    disposeGroupChildren(labWaterGroup);
    disposeGroupChildren(riverWaterGroup);
  }

  return {
    labWaterGroup,
    riverWaterGroup,
    update,
    dispose,
  };
}

export { createWaterSystem };
