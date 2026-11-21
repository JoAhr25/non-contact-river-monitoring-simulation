import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFlumeTank } from './scene/flumeTank.js';
import { createGantryFrame } from './scene/gantryFrame.js';
import { createRiverField } from './scene/riverField.js';
import { createEnclosures } from './scene/enclosures.js';
import { createHardwareRig } from './scene/hardwareRig.js';
import { createLabHydraulics } from './sim/hydraulics.js';
import { createRealRiverHydraulics } from './sim/realRiverHydraulics.js';
import { createWaterSystem } from './sim/waterShader.js';
import { createSensorOptics } from './sim/sensorOptics.js';
import {
  createPipelineModel,
  getDefaultThresholds,
  crc16Ccitt,
  computeHazardIndex,
  encodeLoRa12BytePayload,
} from './sim/pipelineModel.js';
import { createVideoHud } from './ui/videoHud.js';
import { createDashboardPanel } from './ui/dashboardPanel.js';
import { createTimelineController } from './ui/timelineController.js';

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
    architectureProfile: 'proposal', // 'proposal' | 'edge_lora'
    independentFieldRef: false,
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
  renderer.shadowMap.autoUpdate = false;

  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    if (loadingStatus) {
      loadingStatus.textContent = 'WebGL context lost — awaiting GPU restore…';
      loadingStatus.style.color = '#fcd34d';
    }
    loadingOverlay?.classList.remove('hidden');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    loadingOverlay?.classList.add('hidden');
    renderer.shadowMap.needsUpdate = true;
  });

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
  const irSpotLight = new THREE.SpotLight(0xdb2777, 0, 18, Math.PI * 0.34, 0.58, 2.0);
  irSpotLight.position.set(0.08, 0.72, -0.02);
  scene.add(irSpotLight);
  scene.add(irSpotLight.target);

  const riverFog = new THREE.FogExp2(0x9ec6de, 0.0);

  // Procedural sky dome for Phase 2 Guimbal River reach
  const skyUniforms = {
    uZenithColor: { value: new THREE.Color('#4d8ec4') },
    uHorizonColor: { value: new THREE.Color('#cbe3f2') },
    uSunDir: { value: new THREE.Vector3(8.5, 13.5, 7.5).normalize() },
    uSunColor: { value: new THREE.Color('#fff6eb') },
    uSunStrength: { value: 0.65 },
  };
  const riverSkyDome = new THREE.Mesh(
    new THREE.SphereGeometry(64, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunStrength;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 0.85 + 0.12, 0.0, 1.0);
          vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.62));
          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          float sunHalo = pow(sunDot, 22.0) * 0.32 + pow(sunDot, 280.0) * 1.15;
          vec3 col = sky + uSunColor * sunHalo * uSunStrength;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  riverSkyDome.name = 'GuimbalSkyDome';
  riverSkyDome.renderOrder = -10;

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
  riverSceneGroup.add(riverSkyDome, riverField.group, waterSystem.riverWaterGroup);
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
  const compObjectsById = new Map();
  for (const item of hardwareRig.getComponentMetadata()) {
    componentById.set(item.id, item);
  }
  hardwareRootGroup.traverse((obj) => {
    const info = obj.userData?.componentInfo;
    if (info && info.id) {
      if (!componentById.has(info.id)) {
        componentById.set(info.id, info);
      }
      if (!compObjectsById.has(info.id)) compObjectsById.set(info.id, []);
      compObjectsById.get(info.id).push(obj);
    }
  });

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
      camera.near = 0.12;
      controls.minDistance = 0.35;
      controls.maxDistance = 32.0;
      controls.maxPolarAngle = Math.PI * 0.492;
      sunLight.shadow.normalBias = 0.015;
      sunLight.shadow.camera.left = -15;
      sunLight.shadow.camera.right = 15;
      sunLight.shadow.camera.top = 15;
      sunLight.shadow.camera.bottom = -15;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 45;
    } else {
      camera.near = 0.03;
      controls.minDistance = 0.16;
      controls.maxDistance = 4.6;
      controls.maxPolarAngle = Math.PI * 0.88;
      sunLight.shadow.normalBias = 0.002;
      sunLight.shadow.camera.left = -1.2;
      sunLight.shadow.camera.right = 1.2;
      sunLight.shadow.camera.top = 1.6;
      sunLight.shadow.camera.bottom = -1.2;
      sunLight.shadow.camera.near = 0.2;
      sunLight.shadow.camera.far = 12;
    }
    camera.updateProjectionMatrix();
    sunLight.shadow.camera.updateProjectionMatrix();
  }

  function switchMode(nextMode, options = {}) {
    const normalized = nextMode === 'river' ? 'river' : 'lab';
    const changed = state.mode !== normalized;
    state.mode = normalized;
    lastModeSynced = normalized;

    if (normalized === 'river') {
      state.lidarHeightM = state.riverLidarHeightM || 4.5;
      if (changed && state.turbidityMode === 'clear') state.turbidityMode = 'silty';
      state.thresholds = getDefaultThresholds('river');
    } else {
      state.lidarHeightM = state.labLidarHeightM || 0.693;
      if (changed && state.turbidityMode === 'muddy') state.turbidityMode = 'clear';
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
  const _irMountPos = new THREE.Vector3();

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
      enclosures.controlBoxGroup.position.set(1.16, Math.min(4.84, 4.76 + deltaH), -0.35);
      enclosures.controlBoxGroup.rotation.set(0, Math.PI, 0);

      hardwareRig.routerGroup.position.set(1.24, 5.28, -0.45);
      hardwareRig.routerGroup.rotation.set(0, 0, 0);

      enclosures.lidarPodGroup.position.copy(riverField.mountAnchor);
      enclosures.lidarPodGroup.rotation.set(0, 0, 0);

      enclosures.cameraPodGroup.position.copy(riverField.cameraAnchor);
      enclosures.cameraPodGroup.rotation.set(0.08, 0, 0.06);

      _irMountPos.set(0.95, riverField.cameraAnchor.y, -0.35);
      enclosures.irIlluminatorGroup.position.copy(_irMountPos);
      enclosures.irIlluminatorGroup.rotation.set(0.06, 0, -0.03);

      activeAnchors.lidar.copy(riverField.mountAnchor);
      activeAnchors.camera.copy(riverField.cameraAnchor);
      activeAnchors.ir.copy(_irMountPos);
    }
  }

  const _bgTarget = new THREE.Color();
  const _sunColorTarget = new THREE.Color();
  const _hemiSkyTarget = new THREE.Color();
  const _hemiGroundTarget = new THREE.Color();
  const _fillColorTarget = new THREE.Color();
  const _skyZenithTarget = new THREE.Color();
  const _skyHorizonTarget = new THREE.Color();
  const _sunPosTarget = new THREE.Vector3();
  const _sunLookTarget = new THREE.Vector3();
  const _waterEnv = {
    metrics: null,
    particles: null,
    sunDir: new THREE.Vector3(8.5, 13.5, 7.5).normalize(),
    skyColor: new THREE.Color('#89bddc'),
    fogColor: new THREE.Color('#89bddc'),
    fogDensity: 0.013,
    irSpotPos: new THREE.Vector3(0.95, 4.4, -0.35),
    irSpotDir: new THREE.Vector3(0, -1, 0),
    irSpotIntensity: 0.0,
  };

  function updateLighting(dt) {
    const isRiver = state.mode === 'river';
    const isNight = Boolean(state.nightMode);
    const tod = isNight
      ? 'night'
      : state.timeOfDay === 'night_no_ir'
        ? 'night_no_ir'
        : (state.sunGlare ?? 0) > 0.45
          ? 'glare'
          : state.timeOfDay || 'day';

    let hemiIntensity = 0.92;
    let sunIntensity = isRiver ? 2.55 : 2.1;
    let fillIntensity = 0.65;
    let envIntensity = 0.52;
    let exposure = 1.08;
    let fogDensity = isRiver ? 0.013 : 0.0;
    let sunDiscStrength = 0.65;

    if (tod === 'night' || tod === 'night_no_ir') {
      _bgTarget.set(isRiver ? '#040812' : '#050811');
      _skyZenithTarget.set('#02050c');
      _skyHorizonTarget.set('#0a1324');
      _hemiSkyTarget.set(tod === 'night_no_ir' ? '#1e2942' : '#384d78');
      _hemiGroundTarget.set('#0b101d');
      _sunColorTarget.set('#6d89bd');
      _fillColorTarget.set('#3b517a');
      hemiIntensity = tod === 'night_no_ir' ? 0.14 : 0.24;
      sunIntensity = tod === 'night_no_ir' ? 0.22 : 0.42;
      fillIntensity = tod === 'night_no_ir' ? 0.08 : 0.18;
      envIntensity = tod === 'night_no_ir' ? 0.08 : 0.14;
      exposure = tod === 'night_no_ir' ? 0.72 : 0.88;
      fogDensity = isRiver ? 0.018 : 0.0;
      sunDiscStrength = 0.05;
      _sunPosTarget.set(isRiver ? -6 : -1.5, isRiver ? 10 : 3.2, isRiver ? 6 : 2.2);
    } else if (tod === 'dusk') {
      _bgTarget.set(isRiver ? '#2b334f' : '#121826');
      _skyZenithTarget.set('#1f2847');
      _skyHorizonTarget.set('#c46d4c');
      _hemiSkyTarget.set('#8094c4');
      _hemiGroundTarget.set('#2c2420');
      _sunColorTarget.set('#ff9b54');
      _fillColorTarget.set('#6b7eb8');
      hemiIntensity = 0.50;
      sunIntensity = isRiver ? 1.35 : 1.15;
      fillIntensity = 0.45;
      envIntensity = 0.30;
      exposure = 0.98;
      fogDensity = isRiver ? 0.017 : 0.0;
      sunDiscStrength = 0.85;
      _sunPosTarget.set(isRiver ? -11 : -2.2, isRiver ? 3.8 : 1.5, isRiver ? -4 : 2.0);
    } else if (tod === 'glare') {
      _bgTarget.set(isRiver ? '#b6d8ed' : '#141c2b');
      _skyZenithTarget.set('#5a9dd4');
      _skyHorizonTarget.set('#e1f0fa');
      _hemiSkyTarget.set('#ffffff');
      _hemiGroundTarget.set('#695c48');
      _sunColorTarget.set('#fffbe8');
      _fillColorTarget.set('#dbeafe');
      hemiIntensity = 1.12;
      sunIntensity = isRiver ? 3.75 : 3.0;
      fillIntensity = 0.78;
      envIntensity = 0.68;
      exposure = 1.20;
      fogDensity = isRiver ? 0.010 : 0.0;
      sunDiscStrength = 1.25;
      // Overhead/forward angle inducing crisp water glare reflections
      _sunPosTarget.set(isRiver ? 2.5 : 0.4, isRiver ? 14.0 : 4.8, isRiver ? -6.5 : -1.4);
    } else {
      // Daylight clear
      _bgTarget.set(isRiver ? '#89bddc' : '#0c121e');
      _skyZenithTarget.set('#4684bc');
      _skyHorizonTarget.set('#cbe3f2');
      _hemiSkyTarget.set('#dbeafe');
      _hemiGroundTarget.set('#443c30');
      _sunColorTarget.set('#fff6eb');
      _fillColorTarget.set('#93c5fd');
      hemiIntensity = isRiver ? 1.02 : 0.92;
      sunIntensity = isRiver ? 2.55 : 2.15;
      fillIntensity = 0.65;
      envIntensity = 0.54;
      exposure = 1.08;
      fogDensity = isRiver ? 0.013 : 0.0;
      sunDiscStrength = 0.65;
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

    fillLight.color.lerp(_fillColorTarget, k);
    fillLight.intensity += (fillIntensity - fillLight.intensity) * k;
    scene.environmentIntensity += (envIntensity - scene.environmentIntensity) * k;
    renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * k;

    if (fogDensity > 0.0005) {
      if (scene.fog !== riverFog) scene.fog = riverFog;
      riverFog.color.lerp(_skyHorizonTarget, k);
      riverFog.density += (fogDensity - riverFog.density) * k;
    } else if (scene.fog) {
      scene.fog = null;
    }

    // Update procedural river sky dome uniforms & water shader environment sync
    skyUniforms.uZenithColor.value.lerp(_skyZenithTarget, k);
    skyUniforms.uHorizonColor.value.lerp(_skyHorizonTarget, k);
    skyUniforms.uSunColor.value.copy(sunLight.color);
    skyUniforms.uSunStrength.value += (sunDiscStrength - skyUniforms.uSunStrength.value) * k;

    _waterEnv.sunDir.subVectors(sunLight.position, sunLight.target.position).normalize();
    skyUniforms.uSunDir.value.copy(_waterEnv.sunDir);
    _waterEnv.skyColor.copy(skyUniforms.uHorizonColor.value).lerp(skyUniforms.uZenithColor.value, 0.38);
    _waterEnv.fogColor.copy(riverFog.color);
    _waterEnv.fogDensity = fogDensity > 0.0005 ? riverFog.density : 0.0;

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
    const targetIrIntensity = isNight ? (isRiver ? 28.0 : 3.5) : 0.0;
    irSpotLight.intensity += (targetIrIntensity - irSpotLight.intensity) * clamp(dt * 6, 0.05, 1.0);
    irSpotLight.distance = isRiver ? 18 : 3.2;

    _waterEnv.irSpotPos.copy(irSpotLight.position);
    _waterEnv.irSpotDir.subVectors(irSpotLight.target.position, irSpotLight.position).normalize();
    _waterEnv.irSpotIntensity = targetIrIntensity > 0.1 || irSpotLight.intensity > 0.1
      ? clamp(irSpotLight.intensity / 28.0, 0, 1.2)
      : 0.0;
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

  const highlightedMeshes = [];
  let lastHoverHlId = null;
  let lastSelectHlId = null;
  const _focusBox = new THREE.Box3();
  const _compBox = new THREE.Box3();
  const _focusCenter = new THREE.Vector3();
  const _focusSize = new THREE.Vector3();
  const _focusDir = new THREE.Vector3();

  function tintComponentObjects(compId, hexColor, intensity) {
    const objs = compObjectsById.get(compId);
    if (!objs) return;
    for (let i = 0; i < objs.length; i++) {
      const rootObj = objs[i];
      const stack = [rootObj];
      while (stack.length > 0) {
        const node = stack.pop();
        if (node !== rootObj && node.userData?.componentInfo && node.userData.componentInfo.id !== compId) {
          continue;
        }
        if (node.isMesh && node.material && !Array.isArray(node.material) && 'emissive' in node.material) {
          if (!node.userData._origMat) {
            node.userData._origMat = node.material;
            node.userData._hlMat = node.material.clone();
          }
          node.userData._hlMat.emissive.set(hexColor);
          node.userData._hlMat.emissiveIntensity = intensity;
          node.material = node.userData._hlMat;
          highlightedMeshes.push(node);
        }
        for (let c = 0; c < node.children.length; c++) {
          stack.push(node.children[c]);
        }
      }
    }
  }

  function applyComponentHighlight(hoverId, selectId) {
    const h = hoverId || null;
    const s = selectId || null;
    if (h === lastHoverHlId && s === lastSelectHlId) return;
    lastHoverHlId = h;
    lastSelectHlId = s;

    for (let i = 0; i < highlightedMeshes.length; i++) {
      const m = highlightedMeshes[i];
      if (m.userData._origMat) m.material = m.userData._origMat;
    }
    highlightedMeshes.length = 0;

    if (h && h !== s) tintComponentObjects(h, '#38bdf8', 0.65);
    if (s) tintComponentObjects(s, '#10b981', 0.85);
  }

  function selectComponentById(compId) {
    const info = compId ? (componentById.get(compId) || null) : null;
    state.selectedComponent = info;
    videoHud.setSelectedComponent(info);
    applyComponentHighlight(state.hoveredComponent?.id || null, info?.id || null);

    if (info) {
      const isExternalPod =
        compId === 'AP1' ||
        compId === 'IR1' ||
        compId === 'CAM1' ||
        compId === 'LIDAR1' ||
        compId === 'ENC-CAM' ||
        compId === 'ENC-LIDAR';
      if (!isExternalPod && state.explodeFactor < 0.5) {
        state.explodeFactor = 0.85;
      }
      if (!isExternalPod) {
        state.cameraPreset = 'exploded_cad';
      }
      enclosures.updateExplode(state.explodeFactor, 0.05, state);
      syncHardwareMounts();
      hardwareRootGroup.updateMatrixWorld(true);

      const objs = compObjectsById.get(compId);
      _focusBox.makeEmpty();
      if (objs && objs.length) {
        for (let i = 0; i < objs.length; i++) {
          if (objs[i].visible) {
            _compBox.setFromObject(objs[i]);
            if (!_compBox.isEmpty()) _focusBox.union(_compBox);
          }
        }
      }
      if (!_focusBox.isEmpty()) {
        _focusBox.getCenter(_focusCenter);
        _focusBox.getSize(_focusSize);
        const radius = Math.max(_focusSize.length(), 0.04);
        const refPose = computeCameraPresetPose(isExternalPod ? (state.cameraPreset || 'video_replica') : 'exploded_cad');
        _focusDir.subVectors(refPose.pos, refPose.target);
        if (_focusDir.lengthSq() < 1e-6) _focusDir.set(0.4, 0.2, 0.9);
        _focusDir.normalize();
        const dist = clamp(radius * 3.1, 0.24, 1.35);
        camTransition.targetGoal.copy(_focusCenter);
        camTransition.posGoal.copy(_focusCenter).addScaledVector(_focusDir, dist);
        camTransition.active = true;
      } else if (!isExternalPod) {
        setCameraPreset('exploded_cad', false);
      }
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
    pauseTimeline: () => {
      if (timeline.isPlaying()) timeline.pause();
    },
    seekStage: (idx) => {
      timeline.seekStage(idx);
      applyModeEnvironment(state.mode);
    },
    onPrevStage: () => {
      const cur = timeline.getCurrentStageInfo().index;
      const nextIdx = cur <= 0 ? 0 : cur - 1;
      timeline.seekStage(nextIdx);
      applyModeEnvironment(state.mode);
    },
    onNextStage: () => {
      const cur = timeline.getCurrentStageInfo().index;
      const nextIdx = cur < 0 ? 0 : Math.min(6, cur + 1);
      timeline.seekStage(nextIdx);
      applyModeEnvironment(state.mode);
    },
    onToggleHold: (holdOn) => {
      timeline.setHoldAtStageEnd(holdOn);
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
    onScreenshot: () => {
      if (contextLost) return;
      renderer.render(scene, camera);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `river_twin_${state.mode}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    onCaptureTrial: () => {
      pipelineModel.captureTrial(state);
    },
    onTriggerTestAlert: () => {
      const alertObj = pipelineModel.triggerTestAlert(state);
      if (alertObj && dashboardPanel) {
        dashboardPanel.showEmailAlert(alertObj);
      }
      return alertObj;
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
  const _rootBox = new THREE.Box3();
  const inspectRoots = [
    enclosures.controlBoxGroup,
    enclosures.lidarPodGroup,
    enclosures.cameraPodGroup,
    enclosures.irIlluminatorGroup,
    hardwareRig.routerGroup,
  ];
  let downPos = { x: 0, y: 0 };
  let canvasRect = renderer.domElement.getBoundingClientRect();
  let hoverRafPending = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function pickHardwareComponent(clientX, clientY) {
    if (!canvasRect.width || !canvasRect.height) {
      canvasRect = renderer.domElement.getBoundingClientRect();
    }
    if (!canvasRect.width || !canvasRect.height) return null;
    pointerNdc.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointerNdc.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = [];
    for (let i = 0; i < inspectRoots.length; i++) {
      const rootObj = inspectRoots[i];
      if (!rootObj.visible) continue;
      _rootBox.setFromObject(rootObj);
      if (!_rootBox.isEmpty() && raycaster.ray.intersectsBox(_rootBox)) {
        const subHits = raycaster.intersectObject(rootObj, true);
        for (let j = 0; j < subHits.length; j++) hits.push(subHits[j]);
      }
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.distance - b.distance);

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
    if (e.buttons !== 0) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    if (hoverRafPending) return;
    hoverRafPending = true;
    requestAnimationFrame(() => {
      hoverRafPending = false;
      const info = pickHardwareComponent(lastPointerX, lastPointerY);
      if (info?.id !== state.hoveredComponent?.id) {
        state.hoveredComponent = info;
        videoHud.setHoveredComponent(info);
        applyComponentHighlight(info?.id || null, state.selectedComponent?.id || null);
        renderer.domElement.style.cursor = info ? 'pointer' : 'grab';
      }
    });
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    if (dx * dx + dy * dy <= 25) {
      const info = pickHardwareComponent(e.clientX, e.clientY);
      state.selectedComponent = info;
      videoHud.setSelectedComponent(info);
      applyComponentHighlight(state.hoveredComponent?.id || null, info?.id || null);
    }
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.key === 'Escape') {
      selectComponentById(null);
      if (dashboardPanel.isPresentationMode?.()) {
        dashboardPanel.setPresentationMode(false);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (timeline.isPlaying()) timeline.pause();
      else timeline.play();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === '[') {
      const cur = timeline.getCurrentStageInfo().index;
      const nextIdx = cur <= 0 ? 0 : cur - 1;
      timeline.seekStage(nextIdx);
      applyModeEnvironment(state.mode);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ']') {
      const cur = timeline.getCurrentStageInfo().index;
      const nextIdx = cur < 0 ? 0 : Math.min(6, cur + 1);
      timeline.seekStage(nextIdx);
      applyModeEnvironment(state.mode);
      return;
    }
    if (e.key >= '1' && e.key <= '6') {
      const idx = Number(e.key) - 1;
      const list =
        state.mode === 'river'
          ? ['river_cross_section', 'exploded_cad', 'noir_pov', 'gcp_aerial']
          : ['video_replica', 'side_profile', 'overhead_gantry', 'hydraulic_cutaway', 'exploded_cad', 'noir_pov'];
      if (idx < list.length) {
        if (timeline.isPlaying()) timeline.pause();
        setCameraPreset(list[idx], false);
        dashboardPanel.syncControlWidgets();
      }
      return;
    }
    const lower = e.key.toLowerCase();
    if (lower === 'd') {
      dashboardPanel.setDrawerOpen(!dashboardPanel.isDrawerOpen?.());
    } else if (lower === 'h') {
      state.hudVisible = state.hudVisible === false;
      videoHud.setVisible(state.hudVisible);
      dashboardPanel.setHudVisible(state.hudVisible);
    } else if (lower === 'n') {
      if (timeline.isPlaying()) timeline.pause();
      state.nightMode = !state.nightMode;
      if (state.nightMode) {
        state.sunGlare = 0.0;
        state.timeOfDay = 'night';
      } else if (state.timeOfDay === 'night') {
        state.timeOfDay = 'night_no_ir';
      }
      dashboardPanel.syncControlWidgets();
    } else if (lower === 'e') {
      if (timeline.isPlaying()) timeline.pause();
      state.explodeFactor = (state.explodeFactor ?? 0) > 0.2 ? 0.0 : 0.85;
      if (state.explodeFactor > 0.2) setCameraPreset('exploded_cad', false);
      dashboardPanel.syncControlWidgets();
    } else if (lower === 'p') {
      dashboardPanel.setPresentationMode(!dashboardPanel.isPresentationMode?.());
    } else if (lower === 'r') {
      if (timeline.isPlaying()) timeline.pause();
      setCameraPreset(state.mode === 'river' ? 'river_cross_section' : 'video_replica', false);
      dashboardPanel.syncControlWidgets();
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
    canvasRect = renderer.domElement.getBoundingClientRect();
    syncHudChromeClearance();
  });

  let lastModeSynced = state.mode;
  let lastHudTickMs = 0;

  function stepSimulation(dt) {
    const safeDt = clamp(dt || 0.016, 0.001, 0.05);

    const timelineInfo = timeline.update(safeDt);

    if (state.mode !== lastModeSynced) {
      lastModeSynced = state.mode;
      if (!timeline.isPlaying() && (timelineInfo?.index ?? -1) !== 6) {
        state.thresholds = getDefaultThresholds(state.mode === 'river' ? 'river' : 'lab');
      }
      applyModeEnvironment(state.mode);
    }

    const isRiver = state.mode === 'river';

    let labMetrics = null;
    if (!isRiver) {
      labHydraulics.update(safeDt, state);
      labMetrics = labHydraulics.getMetrics();
      flumeTank.update(safeDt, state, labMetrics.riserFill);
    } else {
      riverHydraulics.update(safeDt, state);
      const riverMetrics = riverHydraulics.getMetrics();
      riverField.update(safeDt, state, riverMetrics);
    }

    const activeHydraulics = isRiver ? riverHydraulics : labHydraulics;
    const activeMetrics = isRiver ? riverHydraulics.getMetrics() : labMetrics;
    const activeParticles = activeHydraulics.getParticles();

    state._labPoleTopRailY = riverField.labPoleTopRailY;
    state._hydraulics = activeHydraulics;
    state._gcpCorners = isRiver ? riverField.getActiveGcpCorners() : null;

    syncHardwareMounts();
    enclosures.updateExplode(state.explodeFactor, safeDt, state);
    hardwareRig.update(safeDt, state);

    updateLighting(safeDt);
    _waterEnv.metrics = activeMetrics;
    _waterEnv.particles = activeParticles;
    waterSystem.update(safeDt, state, labHydraulics, riverHydraulics, _waterEnv);

    const lidarReading = sensorOptics.update(
      safeDt,
      state,
      activeAnchors,
      activeHydraulics,
      activeParticles
    );

    // Couple each particle's inFov strictly to the live Pi Camera NoIR projection
    const maxFovDepth = isRiver ? 22.0 : 3.5;
    for (let i = 0; i < activeParticles.length; i++) {
      const p = activeParticles[i];
      const proj = sensorOptics.projectWorldToPip(p);
      p.inFov = proj.visible && proj.depthM < maxFovDepth;
    }

    const snapshot = pipelineModel.step(
      safeDt,
      state,
      activeMetrics,
      lidarReading,
      activeParticles
    );

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

    if (!contextLost) {
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    }
    return snapshot;
  }

  // Initial pose & warm-up frame
  applyModeEnvironment(state.mode);
  setCameraPreset('video_replica', true);
  stepSimulation(0.016);
  window.__RIVER_SIM_READY__ = true;

  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      prevTimeMs = performance.now();
    }
  });

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
    encodeLoRa: (opts) => encodeLoRa12BytePayload(opts),
    crc16Ccitt,
    computeHazardIndex,
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
