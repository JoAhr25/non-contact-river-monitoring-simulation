#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export const MODULE_MANIFEST = [
  {
    file: 'src/shared/bomData.js',
    key: 'bomData',
    params: [],
    deps: [],
    exports: ['THESIS_BOM', 'THESIS_BOM_TOTAL_PHP', 'EDGE_LORA_BOM', 'BUDGET_ALTERNATIVES'],
  },
  {
    file: 'src/scene/flumeTank.js',
    key: 'flumeTank',
    params: ['THREE'],
    deps: ['THREE'],
    exports: ['createFlumeTank'],
  },
  {
    file: 'src/scene/gantryFrame.js',
    key: 'gantryFrame',
    params: ['THREE'],
    deps: ['THREE'],
    exports: ['createGantryFrame'],
  },
  {
    file: 'src/scene/riverField.js',
    key: 'riverField',
    params: ['THREE', '{ createGantryFrame }'],
    deps: ['THREE', 'RiverSimModules.gantryFrame'],
    exports: ['guimbalBedHeightAtZ', 'createRiverField'],
  },
  {
    file: 'src/scene/enclosures.js',
    key: 'enclosures',
    params: ['THREE'],
    deps: ['THREE'],
    exports: ['tagComponentInfo', 'createEnclosures'],
  },
  {
    file: 'src/scene/hardwareRig.js',
    key: 'hardwareRig',
    params: ['THREE', '{ tagComponentInfo }'],
    deps: ['THREE', 'RiverSimModules.enclosures'],
    exports: ['createHardwareRig'],
  },
  {
    file: 'src/sim/hydraulics.js',
    key: 'hydraulics',
    params: [],
    deps: [],
    exports: ['LAB_GEOMETRY', 'createLabHydraulics'],
  },
  {
    file: 'src/sim/realRiverHydraulics.js',
    key: 'realRiverHydraulics',
    params: [],
    deps: [],
    exports: ['defaultGuimbalBedHeight', 'createRealRiverHydraulics'],
  },
  {
    file: 'src/sim/waterShader.js',
    key: 'waterShader',
    params: ['THREE', '{ LAB_GEOMETRY }', '{ defaultGuimbalBedHeight }'],
    deps: ['THREE', 'RiverSimModules.hydraulics', 'RiverSimModules.realRiverHydraulics'],
    exports: ['createWaterSystem'],
  },
  {
    file: 'src/sim/sensorOptics.js',
    key: 'sensorOptics',
    params: ['THREE'],
    deps: ['THREE'],
    exports: ['createSensorOptics'],
  },
  {
    file: 'src/sim/pipelineModel.js',
    key: 'pipelineModel',
    params: [],
    deps: [],
    exports: [
      'getDefaultThresholds',
      'createPipelineModel',
      'crc16Ccitt',
      'computeHazardIndex',
      'encodeLoRa12BytePayload',
    ],
  },
  {
    file: 'src/ui/timelineController.js',
    key: 'timelineController',
    params: [],
    deps: [],
    exports: ['TIMELINE_STAGES', 'TOTAL_TIMELINE_DURATION_S', 'createTimelineController'],
  },
  {
    file: 'src/ui/videoHud.js',
    key: 'videoHud',
    params: [],
    deps: [],
    exports: ['createVideoHud'],
  },
  {
    file: 'src/ui/dashboardPanel.js',
    key: 'dashboardPanel',
    params: [
      '{ getDefaultThresholds }',
      '{ TIMELINE_STAGES, TOTAL_TIMELINE_DURATION_S }',
      '{ THESIS_BOM, THESIS_BOM_TOTAL_PHP, EDGE_LORA_BOM, BUDGET_ALTERNATIVES }',
    ],
    deps: [
      'RiverSimModules.pipelineModel',
      'RiverSimModules.timelineController',
      'RiverSimModules.bomData',
    ],
    exports: ['createDashboardPanel'],
  },
];

function normalizeLf(str) {
  return str.replace(/\r\n/g, '\n');
}

function indentLines(text, spaces = 4) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : ''))
    .join('\n');
}

function stripEsmWrappers(source, exportsList = []) {
  let out = normalizeLf(source).trimStart();
  // Strip contiguous leading ES module import declarations (supports multi-line)
  const leadingImportRe = /^import\s+(?:\*\s+as\s+\w+|\{[\s\S]*?\}|\w+)(?:\s*,\s*(?:\{[\s\S]*?\}|\w+))?\s+from\s+['"][^'"]+['"];?\s*(?:\n|$)/;
  while (leadingImportRe.test(out)) {
    out = out.replace(leadingImportRe, '').trimStart();
  }
  // Strip trailing export { ... }; at end of module only (no /m flag)
  out = out.replace(/\nexport\s*\{[\s\S]*?\};?\s*$/, '\n');
  // Convert top-level inline `export const|let|var|function|class` declarations
  out = out.replace(/^export\s+(?=(?:const|let|var|function|async\s+function|class)\b)/gm, '');
  out = out.trim();
  if (exportsList.length > 0) {
    out += `\n\n  return {\n${exportsList.map((name) => `    ${name},`).join('\n')}\n  };`;
  }
  return out;
}

export function buildAppJs() {
  const chunks = [
    `import * as THREE from 'three';`,
    `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`,
    `import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';`,
    ``,
    `const RiverSimModules = {};`,
    ``,
  ];

  for (const mod of MODULE_MANIFEST) {
    const absPath = path.join(ROOT, mod.file);
    const raw = fs.readFileSync(absPath, 'utf8');
    const body = stripEsmWrappers(raw, mod.exports);
    chunks.push(`/* === MODULE: ${mod.file} === */`);
    chunks.push(`RiverSimModules.${mod.key} = (function (${mod.params.join(', ')}) {`);
    chunks.push(body);
    chunks.push(`})(${mod.deps.join(', ')});`);
    chunks.push('');
  }

  const mainPath = path.join(ROOT, 'src/main.js');
  const mainRaw = fs.readFileSync(mainPath, 'utf8');
  const mainBody = stripEsmWrappers(mainRaw, []);

  const bootstrapParams = [
    'THREE',
    'OrbitControls',
    'RoomEnvironment',
    '{ createFlumeTank }',
    '{ createGantryFrame }',
    '{ createRiverField }',
    '{ createEnclosures }',
    '{ createHardwareRig }',
    '{ createLabHydraulics }',
    '{ createRealRiverHydraulics }',
    '{ createWaterSystem }',
    '{ createSensorOptics }',
    '{ createPipelineModel, getDefaultThresholds, crc16Ccitt, computeHazardIndex, encodeLoRa12BytePayload }',
    '{ createVideoHud }',
    '{ createDashboardPanel }',
    '{ createTimelineController }',
  ];
  const bootstrapArgs = [
    'THREE',
    'OrbitControls',
    'RoomEnvironment',
    'RiverSimModules.flumeTank',
    'RiverSimModules.gantryFrame',
    'RiverSimModules.riverField',
    'RiverSimModules.enclosures',
    'RiverSimModules.hardwareRig',
    'RiverSimModules.hydraulics',
    'RiverSimModules.realRiverHydraulics',
    'RiverSimModules.waterShader',
    'RiverSimModules.sensorOptics',
    'RiverSimModules.pipelineModel',
    'RiverSimModules.videoHud',
    'RiverSimModules.dashboardPanel',
    'RiverSimModules.timelineController',
  ];

  chunks.push(`/* === BOOTSTRAP: src/main.js === */`);
  chunks.push(`(function (${bootstrapParams.join(', ')}) {`);
  chunks.push(mainBody);
  chunks.push(`})(${bootstrapArgs.join(', ')});`);
  chunks.push('');

  return chunks.join('\n');
}

function extractBodyContent(indexHtml) {
  const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error('Could not find <body>...</body> in index.html');
  }
  return bodyMatch[1]
    .replace(/\s*<script\s+type="module"\s+src="app\.js"\s*><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+data-cdn-fallback>[\s\S]*?<\/script>\s*/gi, '\n')
    .trim();
}

function extractFaviconTag(indexHtml) {
  const match = indexHtml.match(/<link\b[^>]*rel="icon"[^>]*>/i);
  return match
    ? match[0]
    : `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b1220'/%3E%3Cpath d='M10 42 Q21 34 32 42 T54 42' fill='none' stroke='%2338bdf8' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M32 10 L32 34' stroke='%2310b981' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='32' cy='38' r='4' fill='%2310b981'/%3E%3C/svg%3E" />`;
}

function stripModuleImports(appSource) {
  return appSource
    .replace(/^\s*import\s+\*\s+as\s+THREE\s+from\s+['"]three['"];?\s*\n?/m, '')
    .replace(/^\s*import\s+\{\s*OrbitControls\s*\}\s+from\s+['"]three\/addons\/controls\/OrbitControls\.js['"];?\s*\n?/m, '')
    .replace(/^\s*import\s+\{\s*RoomEnvironment\s*\}\s+from\s+['"]three\/addons\/environments\/RoomEnvironment\.js['"];?\s*\n?/m, '')
    .replace(/^\n+/, '');
}

export function buildStandaloneHtml(appJsSource) {
  const indexHtml = normalizeLf(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const styleCss = normalizeLf(fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8')).trimEnd();
  const vendorBundle = normalizeLf(fs.readFileSync(path.join(ROOT, 'vendor', 'three-bundle.js'), 'utf8')).trim();
  const appJs = normalizeLf(appJsSource ?? fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));

  const bodyMarkup = extractBodyContent(indexHtml);
  const faviconTag = extractFaviconTag(indexHtml);
  const strippedApp = stripModuleImports(appJs).trimEnd();

  if (/<\/script>/i.test(strippedApp)) {
    throw new Error('Compiled app.js contains a literal </script> tag that would break inline HTML bundling');
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>River Monitoring 3D Digital Twin (Standalone)</title>',
    `  ${faviconTag}`,
    '  <style>',
    indentLines(styleCss, 4),
    '  </style>',
    '</head>',
    '',
    '<body>',
    indentLines(bodyMarkup, 2),
    '  <script>',
    indentLines(vendorBundle, 4),
    '  </script>',
    '  <script>',
    '    (function () {',
    '      const { THREE, OrbitControls, RoomEnvironment } = window.__THREE_BUNDLE__;',
    '',
    indentLines(strippedApp, 6),
    '    })();',
    '  </script>',
    '</body>',
    '',
    '</html>',
    '',
  ].join('\n');
}

export function runBuildCli(argv = process.argv.slice(2)) {
  const isCheck = argv.includes('--check');
  const appPath = path.join(ROOT, 'app.js');
  const standalonePath = path.join(ROOT, 'standalone.html');

  const generatedApp = buildAppJs();
  const generatedStandalone = buildStandaloneHtml(generatedApp);

  if (isCheck) {
    if (!fs.existsSync(appPath)) {
      console.error('app.js does not exist.');
      process.exit(1);
    }
    if (!fs.existsSync(standalonePath)) {
      console.error('standalone.html does not exist.');
      process.exit(1);
    }
    const existingApp = normalizeLf(fs.readFileSync(appPath, 'utf8'));
    const existingStandalone = normalizeLf(fs.readFileSync(standalonePath, 'utf8'));
    if (existingApp !== generatedApp) {
      console.error('app.js is out of sync with src/. Run: node scripts/build.mjs');
      process.exit(1);
    }
    if (existingStandalone !== generatedStandalone) {
      console.error('standalone.html is out of sync with src/ / index.html / style.css. Run: node scripts/build.mjs');
      process.exit(1);
    }
    console.log('app.js and standalone.html are up to date.');
  } else {
    fs.writeFileSync(appPath, generatedApp, 'utf8');
    fs.writeFileSync(standalonePath, generatedStandalone, 'utf8');
    console.log(
      `Built app.js (${Buffer.byteLength(generatedApp, 'utf8')} bytes) and standalone.html (${Buffer.byteLength(generatedStandalone, 'utf8')} bytes).`
    );
  }
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isEntrypoint) {
  runBuildCli();
}
