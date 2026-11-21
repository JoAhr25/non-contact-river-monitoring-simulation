import * as THREE from 'three';
import { tagComponentInfo } from './enclosures.js';

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
  const altHint = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tangent).normalize();

    if (i === 0) {
      const ref = Math.abs(tangent.dot(upHint)) > 0.90 ? altHint : upHint;
      side.crossVectors(tangent, ref).normalize();
      normal.crossVectors(side, tangent).normalize();
    } else {
      // Smooth parallel-transport frame avoids discontinuous twist flips
      normal.addScaledVector(tangent, -normal.dot(tangent));
      if (normal.lengthSq() < 1e-6) {
        const ref = Math.abs(tangent.dot(upHint)) > 0.90 ? altHint : upHint;
        side.crossVectors(tangent, ref).normalize();
        normal.crossVectors(side, tangent).normalize();
      } else {
        normal.normalize();
        side.crossVectors(tangent, normal).normalize();
      }
    }

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
      pinout: 'VCC (Yellow)->Pi Pin 1 (3.3V) | SDA (Cyan)->GPIO2 | SCL (Purple)->GPIO3 | GND (Black)->GND',
      power: '+3.3 V DC + CR2032 Coin Battery Backup',
      bus: 'I2C Bus (0x68)',
      group: 'Edge Compute'
    },
    BT1: {
      id: 'BT1',
      designator: 'BT1',
      title: '3S2P 18650 Li-ion Battery Pack w/ 3S BMS (4S LiFePO4 Alt.)',
      role: 'Primary Off-Grid Field Energy Storage',
      specs: '3S2P 18650 Li-ion 11.1 V nom / 12.6 V max (~6 Ah w/ 3S BMS); paper also references 4S LiFePO4 12.8 V alt.',
      pinout: 'P+ (Red)->F1 5A Inline Fuse (V_FUSED) | P- (Black)->Main GND Bus',
      power: '11.1 V nom Li-ion (3S2P) / 12.8 V (4S LiFePO4)',
      bus: 'Unregulated Primary DC Bus',
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
    new THREE.MeshStandardMaterial({ map: tfLabelTex, roughness: 0.45, metalness: 0.05 })
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
    ctx.font = 'bold 23px sans-serif';
    ctx.fillText('11.1V 3S2P Li-ion', 18, 50);
    ctx.fillStyle = '#a8dcff';
    ctx.font = '16px monospace';
    ctx.fillText('3S BMS / 4S LFP Alt.', 18, 86);
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

  // Expose unified packetPaths array + O(1) lookup map
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
  const packetPathById = new Map(packetPaths.map((p) => [p.id, p]));

  // Cache interior shadow casters so closed enclosures don't burn shadow map draws
  const boxInteriorShadowMeshes = [];
  internalsGroup.traverse((obj) => {
    if (obj.isMesh && obj.castShadow) {
      boxInteriorShadowMeshes.push(obj);
    }
  });

  let lastSignature = '';
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpPi = new THREE.Vector3();
  const tmpRouter = new THREE.Vector3();
  const tmpCloud = new THREE.Vector3();
  const scratchCLidar = new THREE.Vector3();
  const scratchPLidar = new THREE.Vector3();
  const scratchCCam = new THREE.Vector3();
  const scratchPCam = new THREE.Vector3();
  const scratchCIr = new THREE.Vector3();
  const scratchPIr = new THREE.Vector3();

  function getLocalFromAnchor(anchorObj, outVec) {
    anchorObj.getWorldPosition(outVec);
    group.worldToLocal(outVec);
    return outVec;
  }

  function rebuildExternalGeometry(modeScale, mountMode = 'bridge', boomTopY = 6.00, labTopRailY = 7.86) {
    const gA = controlBoxGroup.userData.glandAnchors;
    if (!gA) return;

    const cLidar = getLocalFromAnchor(gA.lidar, scratchCLidar);
    const pLidar = getLocalFromAnchor(lidarPodGroup.userData.glandAnchor, scratchPLidar);

    const cCam = getLocalFromAnchor(gA.camera, scratchCCam);
    const pCam = getLocalFromAnchor(cameraPodGroup.userData.glandAnchor, scratchPCam);

    const cIr = getLocalFromAnchor(gA.ir, scratchCIr);
    const pIr = getLocalFromAnchor(irIlluminatorGroup.userData.glandAnchor, scratchPIr);

    getLocalFromAnchor(piGroup, tmpPi);
    getLocalFromAnchor(wifiAnchor, tmpRouter);
    tmpCloud.copy(tmpRouter);
    tmpCloud.y += 0.38 * modeScale;
    cloudBeacon.position.copy(tmpCloud);
    cloudBeacon.scale.setScalar(modeScale);

    const modeTag = mountMode === 'lab_pole' ? 'LP' : mountMode === 'side_pole' ? 'SP' : 'BR';

    // Check if positions changed enough to warrant geometry rebuild (includes Z coords!)
    const sig = [
      cLidar.x.toFixed(3), cLidar.y.toFixed(3), cLidar.z.toFixed(3),
      pLidar.x.toFixed(3), pLidar.y.toFixed(3), pLidar.z.toFixed(3),
      pCam.x.toFixed(3), pCam.y.toFixed(3), pCam.z.toFixed(3),
      pIr.x.toFixed(3), pIr.y.toFixed(3), pIr.z.toFixed(3),
      tmpRouter.x.toFixed(3), tmpRouter.y.toFixed(3), tmpRouter.z.toFixed(3),
      modeScale.toFixed(2), modeTag, boomTopY.toFixed(2), labTopRailY.toFixed(2)
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
      const railElev = labTopRailY - 0.06;
      const drip = new THREE.Vector3(start.x, start.y - 0.14, start.z - 0.05);
      const mastTop = new THREE.Vector3(2.05 + offsetX, railElev, -6.72);
      const boomMid = new THREE.Vector3(2.05 + offsetX, railElev + 0.02, -5.95);
      const railTop = new THREE.Vector3(end.x, railElev - 0.02, -5.38);
      const railDrop = new THREE.Vector3(end.x, 0.5 * (railElev - 0.02 + end.y), -5.36);
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

      const exportedPath = packetPathById.get(link.id);
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

    // Subtle CAD exploded spacing & closed-enclosure culling for miniature interiors
    const lidarE = lidarPodGroup.userData.explodeFactor || 0;
    tfLunaGroup.visible = lidarE > 0.01;
    tfLunaGroup.position.y = 0.011 + 0.012 * lidarE;

    const camE = cameraPodGroup.userData.explodeFactor || 0;
    camModuleGroup.visible = camE > 0.01;
    camModuleGroup.position.y = 0.0145 + 0.014 * camE;

    const boxE = controlBoxGroup.userData.explodeFactor || 0;
    const boxOpen = boxE > 0.01;
    internalsGroup.visible = boxOpen || !isRiver;
    internalsGroup.position.z = 0.018 * boxE;
    for (let i = 0; i < boxInteriorShadowMeshes.length; i++) {
      boxInteriorShadowMeshes[i].castShadow = boxOpen;
    }

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
    const labTopRailY = Number(state._labPoleTopRailY ?? 7.86);
    rebuildExternalGeometry(
      modeScale,
      mountMode,
      Number.isFinite(boomTopY) ? boomTopY : 6.00,
      Number.isFinite(labTopRailY) ? labTopRailY : 7.86
    );

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
      const exported = packetPathById.get(p.id);
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

      const exported = packetPathById.get(link.id);
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

export { createHardwareRig };
