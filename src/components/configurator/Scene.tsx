'use client';

// Three.js scene ported from the HTML prototype (C:\python\configurator\index.html).
// Single self-contained client component: sets up renderer / scene / sky / static
// environment once, rebuilds the dynamic "canopy" group whenever ConfigState changes.

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FRAME_COLORS, CLADDING, BRICK, RENDER, ROOF_TILE } from '@/lib/catalog';
import type { ConfigState } from '@/lib/pricing';

export type SceneView = 'iso' | 'front' | 'side' | 'top';
export type SceneHandle = {
  snapshot: () => string | null;
};

type Props = {
  state: ConfigState;
  scene: string | null;        // product scene id (e.g. 'car', 'container', 'fence', 'garage', 'awning')
  view: SceneView;
  time: number;                // 5.5 .. 22
  spin: boolean;
  roofOpen: boolean;
  onFps?: (fps: number) => void;
};

export const Scene = forwardRef<SceneHandle, Props>(function Scene(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneContext | null>(null);

  // Mount: set up the whole scene once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ctx = createScene(el, props.onFps);
    ctxRef.current = ctx;
    return () => {
      ctx.dispose();
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State changes → rebuild canopy.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.setState(props.state, props.scene);
  }, [props.state, props.scene]);

  // View → tween camera.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.setView(props.view);
  }, [props.view]);

  // Time of day → sun + tone + fog + emissives.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.setTime(props.time);
  }, [props.time]);

  // Spin / roof open toggles set live flags read in the animate loop.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.setSpin(props.spin);
  }, [props.spin]);
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.setRoofOpen(props.roofOpen);
  }, [props.roofOpen]);

  useImperativeHandle(ref, () => ({
    snapshot: () => ctxRef.current?.snapshot() ?? null,
  }));

  return <div ref={containerRef} className="w-full h-full" style={{ background: '#0e1116' }} />;
});

/* =====================================================================
   Below: the imperative Three.js context. All long-lived objects live
   on a single SceneContext that the React layer drives via setters.
   ===================================================================== */

type SceneContext = {
  setState: (s: ConfigState, scene: string | null) => void;
  setView: (v: SceneView) => void;
  setTime: (t: number) => void;
  setSpin: (b: boolean) => void;
  setRoofOpen: (b: boolean) => void;
  snapshot: () => string;
  dispose: () => void;
};

function createScene(container: HTMLElement, onFps?: (fps: number) => void): SceneContext {
  // --- canvas ---
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  // --- renderer + post chain ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdde4ea, 35, 120);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
  camera.position.set(9, 5, 9);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 3.5;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.target.set(0, 1.2, 0);

  const composerRT = new THREE.WebGLRenderTarget(1, 1, {
    samples: renderer.capabilities.isWebGL2 ? 4 : 0,
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, composerRT);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.12, 0.4, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- sky + sun/moon/lights ---
  const sky = new Sky();
  sky.scale.setScalar(1000);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 6;
  skyU.rayleigh.value = 1.6;
  skyU.mieCoefficient.value = 0.004;
  skyU.mieDirectionalG.value = 0.85;

  const sunLight = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 80;
  sunLight.shadow.camera.left = -13; sunLight.shadow.camera.right = 13;
  sunLight.shadow.camera.top = 13;  sunLight.shadow.camera.bottom = -13;
  sunLight.shadow.bias = -0.0002;
  sunLight.shadow.normalBias = 0.025;
  scene.add(sunLight);

  const moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
  moonLight.position.set(-8, 12, -6);
  scene.add(moonLight);

  const hemi = new THREE.HemisphereLight(0xcfe0f4, 0x8a7c66, 0.45);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  // --- stars ---
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 400, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.48;
      pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) + 10;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  scene.add(new THREE.Points(starGeo, starMat));

  // --- procedural textures ---
  function canvasTex(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512, repeat: [number, number] = [1, 1], srgb = true): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const grassTex = canvasTex((g, w, h) => {
    g.fillStyle = '#4d6b35'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const x = Math.random() * w, y = Math.random() * h, v = Math.random();
      g.fillStyle = v < 0.33 ? '#42602c' : v < 0.66 ? '#587a3c' : '#637f45';
      g.fillRect(x, y, 1.6, 2.6);
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
      g.fillStyle = `rgba(${(60 + Math.random() * 30) | 0},${(90 + Math.random() * 25) | 0},${(40 + Math.random() * 20) | 0},0.12)`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, 512, 512, [16, 16]);

  const paverTex = canvasTex((g, w, h) => {
    g.fillStyle = '#6e6258'; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 4, tw = w / cols, th = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const l = (158 + Math.random() * 26) | 0;
      g.fillStyle = `rgb(${l},${l - 7},${l - 16})`;
      g.fillRect(c * tw + 3, r * th + 3, tw - 6, th - 6);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
        g.fillRect(c * tw + 4 + Math.random() * (tw - 8), r * th + 4 + Math.random() * (th - 8), 1.5, 1.5);
      }
    }
  }, 512, 512, [1, 1]);

  const woodTex = canvasTex((g, w, h) => {
    g.fillStyle = '#8a6a44'; g.fillRect(0, 0, w, h);
    const planks = 6, ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const l = (120 + Math.random() * 30) | 0;
      g.fillStyle = `rgb(${l + 20},${l - 10},${l - 50})`;
      g.fillRect(0, p * ph + 2, w, ph - 4);
      g.strokeStyle = 'rgba(60,38,20,0.45)';
      for (let i = 0; i < 9; i++) {
        g.lineWidth = 0.6 + Math.random();
        g.beginPath();
        const y = p * ph + 4 + Math.random() * (ph - 8);
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (Math.random() * 6 - 3), w * 0.6, y + (Math.random() * 6 - 3), w, y + (Math.random() * 4 - 2));
        g.stroke();
      }
    }
  }, 512, 512, [2, 2]);

  const plasterTex = canvasTex((g, w, h) => {
    g.fillStyle = '#ddd3c2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 90},${Math.random() < 0.5 ? 250 : 80},${Math.random() < 0.5 ? 240 : 70},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, 512, 512, [3, 2]);

  // Generic brick pattern — tinted per brick type via material .color.
  // Stretcher bond: every other row offset by half a brick.
  const brickTex = canvasTex((g, w, h) => {
    g.fillStyle = '#3a3530'; g.fillRect(0, 0, w, h); // mortar background
    const rows = 12;
    const bw = w / 4;   // brick width
    const bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw / 2);
      const y = r * bh;
      for (let c = -1; c < 5; c++) {
        const x = c * bw + offset;
        // base brick face
        const l = (200 + Math.random() * 35) | 0;
        g.fillStyle = `rgb(${l},${l - 8},${l - 18})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        // grain / specks
        for (let i = 0; i < 12; i++) {
          g.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
          g.fillRect(x + 3 + Math.random() * (bw - 6), y + 3 + Math.random() * (bh - 6), 1.4, 1.4);
        }
      }
    }
  }, 512, 512, [1, 1]);

  // Subtle render bump-style texture — mostly flat with light speckle.
  const renderTex = canvasTex((g, w, h) => {
    g.fillStyle = '#f0ede4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 120},${Math.random() < 0.5 ? 250 : 115},${Math.random() < 0.5 ? 240 : 110},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }, 256, 256, [2, 2]);

  // Roof tile / slate stripes — rows of overlapping tiles, tinted per variant.
  const tileTex = canvasTex((g, w, h) => {
    g.fillStyle = '#2a2a2c'; g.fillRect(0, 0, w, h); // shadow gap
    const rows = 10;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const l = (180 + Math.random() * 30) | 0;
      g.fillStyle = `rgb(${l},${l},${l + 6})`;
      g.fillRect(0, y + 2, w, rh - 4);
      // tile dividers
      const cols = 8;
      const cw = w / cols;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      for (let c = 1; c < cols; c++) {
        g.beginPath();
        g.moveTo(c * cw + (r % 2 ? cw / 2 : 0), y);
        g.lineTo(c * cw + (r % 2 ? cw / 2 : 0), y + rh);
        g.stroke();
      }
    }
  }, 512, 512, [1, 1]);

  const contactTex = canvasTex((g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.85)');
    r.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 256, 256, [1, 1], false);

  // --- static environment (lawn, hedges, trees, tufts) ---
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0, color: 0xbcc9a8 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  envGroup.add(lawn);

  function jitterGeo(geo: THREE.BufferGeometry, amt: number): THREE.BufferGeometry {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) + (Math.random() - 0.5) * amt, p.getY(i) + (Math.random() - 0.5) * amt, p.getZ(i) + (Math.random() - 0.5) * amt);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3c5a30, roughness: 0.95 });
  function hedge(len: number, x: number, z: number, rotY = 0) {
    const m = new THREE.Mesh(jitterGeo(new THREE.BoxGeometry(len, 1.25, 0.85, Math.round(len * 2), 4, 3), 0.09), hedgeMat);
    m.position.set(x, 0.62, z);
    m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    envGroup.add(m);
  }
  hedge(26, 0, -12);
  hedge(26, 0, 13.5);
  hedge(25, -13, 0.5, Math.PI / 2);
  hedge(25, 13.5, 0.5, Math.PI / 2);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4731, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a6b38, roughness: 0.95 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3d5e2e, roughness: 0.95 });
  function tree(x: number, z: number, s = 1, conifer = false) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.16 * s, 1.4 * s, 8), trunkMat);
    trunk.position.y = 0.7 * s; trunk.castShadow = true;
    g.add(trunk);
    if (conifer) {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.1 - i * 0.28) * s, 1.3 * s, 9), i % 2 ? leafMat : leafMat2);
        cone.position.y = (1.5 + i * 0.75) * s;
        cone.castShadow = true;
        g.add(cone);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const ball = new THREE.Mesh(jitterGeo(new THREE.SphereGeometry((0.85 + Math.random() * 0.35) * s, 10, 8), 0.12), i % 2 ? leafMat : leafMat2);
        ball.position.set((Math.random() - 0.5) * 0.9 * s, (2 + Math.random() * 0.8) * s, (Math.random() - 0.5) * 0.9 * s);
        ball.castShadow = true;
        g.add(ball);
      }
    }
    g.position.set(x, 0, z);
    envGroup.add(g);
  }
  tree(-10.5, -10, 1.35); tree(11, -10.5, 1.1, true); tree(-11, 8, 1.0, true);
  tree(10.5, 9.5, 1.25);  tree(-7, -11, 0.85);  tree(6.5, -11.2, 0.95, true);

  // Tufts
  {
    const tuftGeo = new THREE.ConeGeometry(0.035, 0.24, 4);
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x55793f, roughness: 1 });
    const N = 350;
    const inst = new THREE.InstancedMesh(tuftGeo, tuftMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 4000) {
      const x = (Math.random() - 0.5) * 22, z = (Math.random() - 0.5) * 22;
      if (Math.abs(x) < 4.6 && Math.abs(z) < 3.6) continue;
      e.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
      q.setFromEuler(e);
      const s = 0.7 + Math.random() * 1.1;
      m4.compose(new THREE.Vector3(x, 0.1 * s, z), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(placed++, m4);
    }
    inst.count = placed;
    envGroup.add(inst);
  }

  // Stepping stones
  {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb6aa97, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 10), stoneMat);
      s.position.set(0.3 + Math.sin(i * 0.7) * 0.5, 0.025, 3.2 + i * 0.9);
      s.receiveShadow = true; s.castShadow = true;
      envGroup.add(s);
    }
  }

  // --- dynamic groups ---
  const canopyGroup = new THREE.Group();
  scene.add(canopyGroup);

  const padMat = new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.85, metalness: 0 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.008;
  pad.receiveShadow = true;
  scene.add(pad);

  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, opacity: 0.34, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  scene.add(contact);

  // --- mutable state held across rebuilds ---
  let state: ConfigState | null = null;
  let productScene: string | null = null;
  let view: SceneView = 'iso';
  let timeOfDay = 13;
  let spin = false;
  let roofOpen = false;

  let louvreSlats: THREE.Mesh[] = [];
  let ledMeshes: THREE.Mesh[] = [];
  let glowLights: THREE.PointLight[] = [];
  let heaterEmitters: THREE.Mesh[] = [];
  let bollardLights: THREE.PointLight[] = [];

  const matCache = new Map<string, THREE.Material>();
  function frameMaterial(): THREE.MeshStandardMaterial {
    const c = FRAME_COLORS[state!.frameColor as keyof typeof FRAME_COLORS];
    const key = `frame-${state!.frameColor}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.hex), roughness: c.roughness, metalness: c.metalness });
    matCache.set(key, m);
    return m;
  }
  function slatMaterial(): THREE.MeshStandardMaterial {
    const c = FRAME_COLORS[state!.slatColor as keyof typeof FRAME_COLORS];
    const key = `slat-${state!.slatColor}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.hex), roughness: c.roughness, metalness: c.metalness });
    matCache.set(key, m);
    return m;
  }
  function glassMaterial(): THREE.MeshPhysicalMaterial {
    const cached = matCache.get('glass') as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshPhysicalMaterial({ color: 0xf2fafc, transmission: 0.95, roughness: 0.03, ior: 1.5, thickness: 0.06, transparent: true, opacity: 0.45, reflectivity: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    matCache.set('glass', m);
    return m;
  }
  function tintedGlassMaterial(): THREE.MeshPhysicalMaterial {
    const cached = matCache.get('tintedGlass') as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshPhysicalMaterial({ color: 0x1c2a30, transmission: 0.55, roughness: 0.06, ior: 1.5, thickness: 0.06, transparent: true, opacity: 0.78, reflectivity: 0.7, clearcoat: 0.6, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
    matCache.set('tintedGlass', m);
    return m;
  }
  function metalLamellaMaterial(): THREE.MeshStandardMaterial {
    const cached = matCache.get('metalLam') as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const c = FRAME_COLORS[state!.frameColor as keyof typeof FRAME_COLORS];
    const col = new THREE.Color(c.hex).multiplyScalar(0.85);
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: 0.85, side: THREE.DoubleSide });
    matCache.set('metalLam', m);
    return m;
  }
  function screenRoloMaterial(): THREE.MeshStandardMaterial {
    const cached = matCache.get('screenRolo') as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: 0x504a42, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.86 });
    matCache.set('screenRolo', m);
    return m;
  }
  function claddingMaterial(): THREE.MeshStandardMaterial | null {
    const k = state!.cladding;
    if (k === 'none') return null;
    const key = `clad-${k}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const conf = CLADDING[k as keyof typeof CLADDING];
    // hex isn't part of the typed catalog — use a reasonable per-type colour
    const colorByKey: Record<string, number> = { timber: 0xa67a47, cedar: 0x7b4a32, composite: 0x5e5247, pvc: 0xe8e4dc };
    const mapByKey: Record<string, THREE.Texture | null> = { timber: woodTex, cedar: woodTex, composite: plasterTex, pvc: null };
    const m = new THREE.MeshStandardMaterial({
      color: colorByKey[k] ?? 0xddd3c2,
      roughness: 0.78, metalness: 0.02,
      map: mapByKey[k] ?? null,
    });
    void conf;
    matCache.set(key, m);
    return m;
  }
  function flooringMaterial(): THREE.MeshStandardMaterial | null {
    const k = state!.flooring;
    if (k === 'none') return null;
    const key = `floor-${k}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const conf: Record<string, { color: number; map: THREE.Texture | null; rough: number }> = {
      laminate: { color: 0xc9a574, map: woodTex, rough: 0.45 },
      tile:     { color: 0xe0d9cb, map: plasterTex, rough: 0.35 },
      wood:     { color: 0x9b6a3e, map: woodTex, rough: 0.55 },
      concrete: { color: 0x9c9a96, map: plasterTex, rough: 0.6 },
    };
    const c = conf[k]; if (!c) return null;
    const m = new THREE.MeshStandardMaterial({ color: c.color, roughness: c.rough, metalness: 0, map: c.map });
    matCache.set(key, m);
    return m;
  }
  function polyMaterial(): THREE.MeshPhysicalMaterial {
    const cached = matCache.get('poly') as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshPhysicalMaterial({ color: 0xe7f1f3, transmission: 0.5, roughness: 0.32, ior: 1.4, thickness: 0.05, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    matCache.set('poly', m);
    return m;
  }
  function brickMaterial(brickKey: string): THREE.MeshStandardMaterial {
    const key = `brick-${brickKey}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const conf = BRICK[brickKey as keyof typeof BRICK];
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(conf?.hex ?? '#9c6b50'),
      map: brickTex.clone(),
      roughness: 0.92, metalness: 0.02,
    });
    // each brick instance gets its own repeat so different walls don't share UV scale
    if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.colorSpace = THREE.SRGBColorSpace; m.map.needsUpdate = true; }
    matCache.set(key, m);
    return m;
  }
  function renderMaterial(renderKey: string): THREE.MeshStandardMaterial {
    const key = `render-${renderKey}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const conf = RENDER[renderKey as keyof typeof RENDER];
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(conf?.hex ?? '#f0ede4'),
      map: renderTex,
      roughness: 0.88, metalness: 0.0,
    });
    matCache.set(key, m);
    return m;
  }
  function tileMaterial(tileKey: string): THREE.MeshStandardMaterial {
    const key = `tile-${tileKey}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const conf = ROOF_TILE[tileKey as keyof typeof ROOF_TILE];
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(conf?.hex ?? '#54595e'),
      map: tileTex.clone(),
      roughness: 0.78, metalness: 0.08,
    });
    if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.colorSpace = THREE.SRGBColorSpace; m.map.needsUpdate = true; }
    matCache.set(key, m);
    return m;
  }
  function zipMaterial(): THREE.MeshStandardMaterial {
    const cached = matCache.get('zip') as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: 0x9b948b, roughness: 0.95, side: THREE.DoubleSide });
    matCache.set('zip', m);
    return m;
  }
  function clearMaterialCache() { matCache.forEach(m => m.dispose()); matCache.clear(); }

  function disposeGroup(g: THREE.Group) {
    while (g.children.length) {
      const c = g.children.pop() as THREE.Object3D;
      const mesh = c as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if ((c as THREE.Group).children?.length) disposeGroup(c as THREE.Group);
    }
  }

  // --- canopy build ---
  function buildCanopy() {
    if (!state) return;
    disposeGroup(canopyGroup);
    louvreSlats = []; ledMeshes = []; heaterEmitters = []; bollardLights = [];
    glowLights.forEach(l => l.parent?.remove(l)); glowLights = [];

    const W = state.length, D = state.depth, H = state.height;
    const fm = frameMaterial();

    pad.scale.set(W + 1.6, D + 1.6, 1);
    paverTex.repeat.set((W + 1.6) / 2.4, (D + 1.6) / 2.4);
    contact.scale.set(W + 1.0, D + 1.0, 1);

    // Custom scenes bail out of the canopy pattern entirely
    if (productScene === 'container') { buildContainer(W, D, H); applyTime(); return; }
    if (productScene === 'fence')     { buildFenceLine(W, D, H); applyTime(); return; }
    if (productScene === 'garage')    { buildGarageWall(W, D, H); applyTime(); return; }
    if (productScene === 'extension') { buildExtensionScene(W, D, H); applyTime(); return; }
    if ((productScene ?? '').startsWith('conservatory-')) { buildConservatoryScene(W, D, H); applyTime(); return; }

    // Posts + feet
    const post = 0.12;
    const corners: [number, number][] = state.structure === 'wallmounted'
      ? [[-W / 2 + post / 2, D / 2 - post / 2], [W / 2 - post / 2, D / 2 - post / 2]]
      : [[-W / 2 + post / 2, D / 2 - post / 2], [W / 2 - post / 2, D / 2 - post / 2], [W / 2 - post / 2, -D / 2 + post / 2], [-W / 2 + post / 2, -D / 2 + post / 2]];
    for (const [px, pz] of corners) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(post, H, post), fm);
      m.position.set(px, H / 2, pz);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(post * 2, 0.03, post * 2), fm);
      foot.position.set(px, 0.015, pz);
      foot.castShadow = true;
      canopyGroup.add(foot);
    }

    // Perimeter beams
    const beamH = 0.18, beamY = H - beamH / 2 + 0.01;
    const beams: [THREE.BufferGeometry, [number, number, number]][] = [
      [new THREE.BoxGeometry(W, beamH, post), [0, beamY,  D / 2 - post / 2]],
      [new THREE.BoxGeometry(W, beamH, post), [0, beamY, -D / 2 + post / 2]],
      [new THREE.BoxGeometry(post, beamH, D - 2 * post), [-W / 2 + post / 2, beamY, 0]],
      [new THREE.BoxGeometry(post, beamH, D - 2 * post), [ W / 2 - post / 2, beamY, 0]],
    ];
    for (const [geo, pos] of beams) {
      const m = new THREE.Mesh(geo, fm);
      m.position.set(pos[0], pos[1], pos[2]);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }

    buildRoof(W, D, H);

    // Conservatory: brick dwarf wall along front + sides (back is the house).
    // Glazed walls above are raised by dwarfHeight to sit on top of the brick.
    const isConservatory = (productScene ?? '').startsWith('conservatory-');
    const dwarfHeight = isConservatory && state.dwarfWall ? state.dwarfWall.height : 0;
    if (isConservatory && state.dwarfWall && dwarfHeight > 0.02) {
      buildDwarfWall(W, D, dwarfHeight, state.dwarfWall.brick);
    }

    for (const side of ['front', 'back', 'left', 'right'] as const) {
      if (state.walls[side] !== 'none') {
        if (state.structure === 'wallmounted' && side === 'back') continue;
        buildWall(side, W, D, H, dwarfHeight);
      }
    }
    if (state.structure === 'wallmounted') buildHouse(W, D, H);
    if (state.addons.lighting) buildLighting(W, D, H);
    if (state.addons.bar) buildBarLights(W, D, H);
    if (state.addons.heater) buildHeaters(W, D, H);
    if (state.addons.speakers) buildSpeakers(W, D, H);

    buildBollards(W, D);

    const floorMat = flooringMaterial();
    if (floorMat) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, D - 0.08), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.018;
      floor.receiveShadow = true;
      canopyGroup.add(floor);
    }

    if (productScene === 'car') buildCar();
    else buildFurniture(W, D);

    applyTime();
  }

  function buildRoof(W: number, D: number, H: number) {
    const fm = frameMaterial();
    const sm = slatMaterial();
    const overhang = state!.overhang || 0;
    const Wr = W + overhang * 2;
    const Dr = D + overhang * 2;
    const presetSloped = state!.roof === 'glass-sloped' || state!.roof === 'poly-sloped';
    const userAngleRad = THREE.MathUtils.degToRad(state!.angle || 0);
    const presetSlope = presetSloped ? 0.5 : 0;
    const slopeAngle = userAngleRad + (presetSloped ? Math.atan(presetSlope / D) : 0);
    const lift = (presetSloped ? presetSlope / 2 : 0) + Math.sin(userAngleRad) * Dr / 2;

    if (state!.roof.startsWith('louvred')) {
      const slatThick = 0.05, slatW = 0.3, gap = 0.045;
      const isolThick = state!.slatIsolation ? slatThick * 1.5 : slatThick;
      if (state!.slatDirection === 'length') {
        const num = Math.floor(Dr / (slatW + gap));
        const cellD = Dr / num;
        for (let i = 0; i < num; i++) {
          const z = -Dr / 2 + i * cellD + cellD / 2;
          const m = new THREE.Mesh(new THREE.BoxGeometry(Wr - 0.22, isolThick, cellD - gap), sm);
          m.position.set(0, H + isolThick / 2 + 0.02, z);
          m.castShadow = true; m.receiveShadow = true;
          canopyGroup.add(m);
          if (state!.roof === 'louvred-retract') louvreSlats.push(m);
          else m.rotation.x = state!.slatRotation === 'right' ? 0.28 : -0.28;
        }
      } else {
        const num = Math.floor(Wr / (slatW + gap));
        const cellW = Wr / num;
        for (let i = 0; i < num; i++) {
          const x = -Wr / 2 + i * cellW + cellW / 2;
          const m = new THREE.Mesh(new THREE.BoxGeometry(cellW - gap, isolThick, Dr - 0.22), sm);
          m.position.set(x, H + isolThick / 2 + 0.02, 0);
          m.castShadow = true; m.receiveShadow = true;
          canopyGroup.add(m);
          if (state!.roof === 'louvred-retract') louvreSlats.push(m);
          else m.rotation.z = state!.slatRotation === 'right' ? 0.28 : -0.28;
        }
      }
    } else if (state!.roof.startsWith('fabric')) {
      const fabricMat = new THREE.MeshStandardMaterial({ color: 0xf2e5cf, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(Wr - 0.04, Dr - 0.04, 12, 6), fabricMat);
      cloth.rotation.x = -Math.PI / 2 + (slopeAngle || THREE.MathUtils.degToRad(12));
      cloth.position.set(0, H + 0.02, 0);
      cloth.castShadow = true;
      canopyGroup.add(cloth);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Wr, 12), fm);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, H - 0.04, Dr / 2 - 0.05);
      bar.castShadow = true;
      canopyGroup.add(bar);
      const cassette = new THREE.Mesh(new THREE.BoxGeometry(Wr + 0.1, 0.18, 0.22), fm);
      cassette.position.set(0, H + 0.05, -Dr / 2 + 0.06);
      cassette.castShadow = true;
      canopyGroup.add(cassette);
    } else if (state!.roof.startsWith('glass')) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(Wr - 0.04, 0.05, Dr - 0.04), glassMaterial());
      roof.position.set(0, H + 0.03 + lift, 0);
      if (slopeAngle) roof.rotation.x = slopeAngle;
      roof.castShadow = true;
      canopyGroup.add(roof);
      const cols = Math.max(2, Math.round(Wr / 1.3));
      for (let i = 1; i < cols; i++) {
        const x = -Wr / 2 + Wr * i / cols;
        const mul = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, Dr - 0.04), fm);
        mul.position.set(x, H + 0.06 + lift, 0);
        if (slopeAngle) mul.rotation.x = slopeAngle;
        mul.castShadow = true;
        canopyGroup.add(mul);
      }
    } else {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(Wr - 0.04, 0.04, Dr - 0.04), polyMaterial());
      roof.position.set(0, H + 0.02 + lift, 0);
      if (slopeAngle) roof.rotation.x = slopeAngle;
      roof.castShadow = true;
      canopyGroup.add(roof);
      const ribMat = new THREE.MeshStandardMaterial({ color: 0x9ec5cf, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.55 });
      const cols = Math.max(6, Math.round(Wr * 2));
      for (let i = 1; i < cols; i++) {
        const x = -Wr / 2 + Wr * i / cols;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, Dr - 0.06), ribMat);
        strip.position.set(x, H + 0.04 + lift, 0);
        if (slopeAngle) strip.rotation.x = slopeAngle;
        canopyGroup.add(strip);
      }
    }
  }

  function buildWall(side: 'front' | 'back' | 'left' | 'right', W: number, D: number, H: number, bottomOffset = 0) {
    const fm = frameMaterial();
    const t = state!.walls[side];
    const wallH = H - 0.05 - bottomOffset;
    let panelW = 0, x = 0, z = 0, rotY = 0;
    if (side === 'front') { panelW = W - 0.24; z = D / 2 - 0.06; }
    else if (side === 'back') { panelW = W - 0.24; z = -D / 2 + 0.06; rotY = Math.PI; }
    else if (side === 'left') { panelW = D - 0.24; x = -W / 2 + 0.06; rotY = -Math.PI / 2; }
    else { panelW = D - 0.24; x = W / 2 - 0.06; rotY = Math.PI / 2; }

    const group = new THREE.Group();
    group.position.set(x, bottomOffset, z);
    group.rotation.y = rotY;

    if (t === 'glass' || t === 'sliding' || t === 'tinted') {
      const glassMat = t === 'tinted' ? tintedGlassMaterial() : glassMaterial();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(panelW, wallH, 0.025), glassMat);
      glass.position.y = wallH / 2 + 0.02;
      group.add(glass);
      const railG = new THREE.BoxGeometry(panelW, 0.07, 0.05);
      const rail = new THREE.Mesh(railG, fm); rail.position.y = 0.04; group.add(rail);
      const rail2 = new THREE.Mesh(railG, fm); rail2.position.y = wallH + 0.02; group.add(rail2);
      const divs = t === 'sliding' ? 4 : 2;
      for (let i = 0; i <= divs; i++) {
        const xOff = -panelW / 2 + panelW * i / divs;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, wallH, 0.07), fm);
        m.position.set(xOff, wallH / 2 + 0.02, 0);
        group.add(m);
      }
      if (t === 'sliding') {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), fm);
        handle.position.set(-panelW / 8, wallH * 0.5, 0.05);
        group.add(handle);
      }
    } else if (t === 'alu') {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, wallH, 0.05), fm);
      panel.position.y = wallH / 2 + 0.02;
      group.add(panel);
      const grooveMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 });
      for (let i = 1; i < 6; i++) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.02, 0.012, 0.012), grooveMat);
        g.position.set(0, wallH * i / 6 + 0.02, 0.027);
        group.add(g);
      }
    } else if (t === 'zip' || t === 'screen') {
      const fabricMat = t === 'screen' ? screenRoloMaterial() : zipMaterial();
      const fabric = new THREE.Mesh(new THREE.BoxGeometry(panelW, wallH, 0.012), fabricMat);
      fabric.position.y = wallH / 2 + 0.02;
      group.add(fabric);
      const cas = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.08, 0.12, 0.12), fm);
      cas.position.y = wallH + 0.02;
      group.add(cas);
      for (const sx of [-panelW / 2, panelW / 2]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, wallH, 0.08), fm);
        r.position.set(sx, wallH / 2 + 0.02, 0);
        group.add(r);
      }
    } else if (t === 'louvre' || t === 'metal') {
      const slatMat = t === 'metal' ? metalLamellaMaterial() : fm;
      const railG = new THREE.BoxGeometry(panelW, 0.07, 0.07);
      const rail = new THREE.Mesh(railG, fm); rail.position.y = 0.04; group.add(rail);
      const rail2 = new THREE.Mesh(railG, fm); rail2.position.y = wallH + 0.02; group.add(rail2);
      for (const sx of [-panelW / 2, panelW / 2]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, wallH, 0.07), fm);
        r.position.set(sx, wallH / 2 + 0.02, 0);
        group.add(r);
      }
      const slatTh = t === 'metal' ? 0.04 : 0.06;
      const slatGap = t === 'metal' ? 0.025 : 0.05;
      const inner = wallH - 0.2;
      const slats = Math.floor(inner / (slatTh + slatGap));
      for (let i = 0; i < slats; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.08, slatTh, 0.05), slatMat);
        slat.position.set(0, 0.12 + i * (slatTh + slatGap) + slatTh / 2, 0.01);
        slat.rotation.x = t === 'metal' ? 0 : -0.22;
        group.add(slat);
      }
    }
    group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    canopyGroup.add(group);
  }

  // Conservatory dwarf wall — brick course along front + left + right.
  // Back is the house; not rendered. Width is full perimeter run including
  // corners, with each side a slab of (dwarfHeight × wallThickness) cross-section.
  function buildDwarfWall(W: number, D: number, dwarfHeight: number, brickKey: string) {
    const brickMat = brickMaterial(brickKey);
    const t = 0.12; // wall thickness
    const slabs: Array<{ w: number; pos: [number, number, number]; rotY: number; uRepeat: number; vRepeat: number }> = [
      // front: spans full width, sits at front edge
      { w: W,         pos: [0, dwarfHeight / 2, D / 2 - t / 2],     rotY: 0,           uRepeat: W / 1.6,         vRepeat: dwarfHeight / 0.6 },
      // left: spans full depth, sits at left edge
      { w: D,         pos: [-W / 2 + t / 2, dwarfHeight / 2, 0],    rotY: Math.PI / 2, uRepeat: D / 1.6,         vRepeat: dwarfHeight / 0.6 },
      // right: spans full depth, sits at right edge
      { w: D,         pos: [W / 2 - t / 2, dwarfHeight / 2, 0],     rotY: -Math.PI / 2, uRepeat: D / 1.6,        vRepeat: dwarfHeight / 0.6 },
    ];
    for (const s of slabs) {
      const geo = new THREE.BoxGeometry(s.w, dwarfHeight, t);
      const m = new THREE.Mesh(geo, brickMat);
      m.position.set(s.pos[0], s.pos[1], s.pos[2]);
      m.rotation.y = s.rotY;
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }
    // Capping stone along the top of each dwarf wall — clean architectural detail.
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.6, metalness: 0.02 });
    const capH = 0.04, capOver = 0.02;
    const caps: Array<{ w: number; pos: [number, number, number]; rotY: number }> = [
      { w: W + capOver * 2, pos: [0, dwarfHeight + capH / 2, D / 2 - t / 2],      rotY: 0 },
      { w: D + capOver * 2, pos: [-W / 2 + t / 2, dwarfHeight + capH / 2, 0],     rotY: Math.PI / 2 },
      { w: D + capOver * 2, pos: [W / 2 - t / 2, dwarfHeight + capH / 2, 0],      rotY: -Math.PI / 2 },
    ];
    for (const c of caps) {
      const geo = new THREE.BoxGeometry(c.w, capH, t + capOver * 2);
      const m = new THREE.Mesh(geo, capMat);
      m.position.set(c.pos[0], c.pos[1], c.pos[2]);
      m.rotation.y = c.rotY;
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }
  }

  // Per-elevation extension wall material — routes brick/render/cladding to the
  // right factory. Cladding reuses the existing per-finish colour/texture mapping.
  function extensionWallMaterial(kind: 'brick' | 'render' | 'cladding', finish: string): THREE.MeshStandardMaterial {
    if (kind === 'brick')  return brickMaterial(finish);
    if (kind === 'render') return renderMaterial(finish);
    const key = `ext-clad-${finish}`;
    const cached = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const colorByKey: Record<string, number> = { timber: 0xa67a47, cedar: 0x7b4a32, composite: 0x5e5247, pvc: 0xe8e4dc };
    const mapByKey: Record<string, THREE.Texture | null> = { timber: woodTex, cedar: woodTex, composite: plasterTex, pvc: null };
    const m = new THREE.MeshStandardMaterial({
      color: colorByKey[finish] ?? 0xddd3c2,
      roughness: 0.78, metalness: 0.02,
      map: mapByKey[finish] ?? null,
    });
    matCache.set(key, m);
    return m;
  }

  // Extension scene — masonry walls per elevation, pitched roof, optional
  // lantern + upper storey. Stands in for a full architectural build.
  function buildExtensionScene(W: number, D: number, H: number) {
    if (!state) return;

    // Floor slab inside the footprint
    const floorMat = flooringMaterial() ?? new THREE.MeshStandardMaterial({ color: 0xa89c84, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, D - 0.04), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
    floor.receiveShadow = true;
    canopyGroup.add(floor);

    const upper = state.storeys === 2 && state.upperStorey ? state.upperStorey : null;
    const totalH = upper ? H * 2 : H;

    // Build wall stack — one or two storeys.
    const storeyCount = upper ? 2 : 1;
    for (let s = 0; s < storeyCount; s++) {
      const baseY = s * H;
      buildExtensionWalls(W, D, H, baseY);
      // Inter-storey separator for two-storey builds
      if (s === 0 && storeyCount === 2) {
        const sep = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), new THREE.MeshStandardMaterial({ color: 0xc7beac, roughness: 0.85 }));
        sep.position.set(0, H, 0);
        sep.castShadow = true; sep.receiveShadow = true;
        canopyGroup.add(sep);
      }
    }

    // Roof
    if (state.extensionRoof) {
      buildExtensionRoof(W, D, totalH, state.extensionRoof.shape, state.extensionRoof.tile, state.extensionRoof.lantern);
    }

    // Optional house backdrop behind the extension
    if (state.houseBackdrop && state.houseBackdrop !== 'none') {
      buildHouse(W, D, H);
    }

    // Furniture inside the ground floor for scale
    buildFurniture(W, D);

    pad.scale.set(W + 2.0, D + 2.0, 1);
    paverTex.repeat.set((W + 2.0) / 2.4, (D + 2.0) / 2.4);
    contact.scale.set(W + 1.4, D + 1.4, 1);
  }

  function buildExtensionWalls(W: number, D: number, H: number, baseY: number) {
    if (!state?.extensionWalls) return;
    const t = 0.18; // wall thickness
    const sides: { side: 'front' | 'back' | 'left' | 'right'; w: number; pos: [number, number, number]; rotY: number }[] = [
      { side: 'front', w: W, pos: [0,            baseY + H / 2,  D / 2 - t / 2], rotY: 0 },
      { side: 'back',  w: W, pos: [0,            baseY + H / 2, -D / 2 + t / 2], rotY: Math.PI },
      { side: 'left',  w: D, pos: [-W / 2 + t / 2, baseY + H / 2,  0],           rotY: Math.PI / 2 },
      { side: 'right', w: D, pos: [ W / 2 - t / 2, baseY + H / 2,  0],           rotY: -Math.PI / 2 },
    ];
    for (const s of sides) {
      const choice = state.extensionWalls[s.side];
      if (!choice) continue;
      const mat = extensionWallMaterial(choice.kind, choice.finish);
      // Clone the underlying map so each elevation gets its own UV scale.
      const mInst = mat.clone();
      if (mInst.map && mat.map) {
        mInst.map = mat.map.clone();
        mInst.map.wrapS = mInst.map.wrapT = THREE.RepeatWrapping;
        mInst.map.colorSpace = THREE.SRGBColorSpace;
        const uRep = Math.max(1, s.w / 1.6);
        const vRep = Math.max(1, H / 1.2);
        mInst.map.repeat.set(uRep, vRep);
        mInst.map.needsUpdate = true;
      }
      const geo = new THREE.BoxGeometry(s.w, H, t);
      const mesh = new THREE.Mesh(geo, mInst);
      mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      mesh.rotation.y = s.rotY;
      mesh.castShadow = true; mesh.receiveShadow = true;
      canopyGroup.add(mesh);
    }
  }

  function buildExtensionRoof(W: number, D: number, baseY: number, shape: 'flat' | 'mono' | 'dual' | 'hipped', tileKey: string, lantern: boolean) {
    const mat = tileMaterial(tileKey);
    const ridgeH = Math.min(D, W) * 0.28;

    if (shape === 'flat') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.14, D + 0.04), mat);
      slab.position.set(0, baseY + 0.07, 0);
      slab.castShadow = true; slab.receiveShadow = true;
      canopyGroup.add(slab);
      // Parapet course (thin upstand) — matches roof tile colour for cohesion
      const upH = 0.18;
      const parts: [number, number, number, number, number][] = [
        [W + 0.04, upH, 0.08, 0, D / 2 + 0.02],
        [W + 0.04, upH, 0.08, 0, -D / 2 - 0.02],
        [0.08, upH, D + 0.04, -W / 2 - 0.02, 0],
        [0.08, upH, D + 0.04,  W / 2 + 0.02, 0],
      ];
      for (const [w, h, d, x, z] of parts) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, baseY + 0.14 + h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        canopyGroup.add(m);
      }
    } else if (shape === 'mono') {
      const sloped = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.12, D + 0.1), mat);
      sloped.position.set(0, baseY + ridgeH / 2 + 0.06, 0);
      sloped.rotation.x = Math.atan2(ridgeH, D);
      sloped.castShadow = true; sloped.receiveShadow = true;
      canopyGroup.add(sloped);
    } else if (shape === 'dual') {
      const pitch = Math.atan2(ridgeH, D / 2);
      const slopeLen = Math.sqrt((D / 2) ** 2 + ridgeH ** 2);
      const overhang = 0.1;
      // Front slab spans (0, H+ridgeH, 0)→(0, H, D/2). After rot.x = +pitch
      // around its center at (0, H+ridgeH/2, D/4), the +Z end (toward front
      // eave) tips down and the −Z end (toward ridge) tips up. Using −pitch
      // inverts the slope.
      const front = new THREE.Mesh(new THREE.BoxGeometry(W + overhang * 2, 0.12, slopeLen + overhang), mat);
      front.position.set(0, baseY + ridgeH / 2 + 0.06, D / 4);
      front.rotation.x = pitch;
      front.castShadow = true; front.receiveShadow = true;
      canopyGroup.add(front);
      const back = new THREE.Mesh(new THREE.BoxGeometry(W + overhang * 2, 0.12, slopeLen + overhang), mat);
      back.position.set(0, baseY + ridgeH / 2 + 0.06, -D / 4);
      back.rotation.x = -pitch;
      back.castShadow = true; back.receiveShadow = true;
      canopyGroup.add(back);
      // Gable end caps — match wall material on left/right elevations
      if (state?.extensionWalls) {
        for (const side of ['left', 'right'] as const) {
          const choice = state.extensionWalls[side];
          if (!choice) continue;
          const gableMat = extensionWallMaterial(choice.kind, choice.finish);
          const shape = new THREE.Shape();
          shape.moveTo(-D / 2, 0);
          shape.lineTo( D / 2, 0);
          shape.lineTo( 0, ridgeH);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
          const mesh = new THREE.Mesh(geo, gableMat);
          mesh.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
          mesh.position.set(side === 'left' ? -W / 2 + 0.09 : W / 2 - 0.09, baseY, 0);
          mesh.castShadow = true; mesh.receiveShadow = true;
          canopyGroup.add(mesh);
        }
      }
    } else if (shape === 'hipped') {
      // 4 triangular faces meeting at a single peak above the centre.
      const peakY = baseY + ridgeH;
      const v = new Float32Array([
        -W / 2, baseY,  D / 2,   W / 2, baseY,  D / 2,   0, peakY, 0, // front (+z)
         W / 2, baseY,  D / 2,   W / 2, baseY, -D / 2,   0, peakY, 0, // right (+x)
         W / 2, baseY, -D / 2,  -W / 2, baseY, -D / 2,   0, peakY, 0, // back  (-z)
        -W / 2, baseY, -D / 2,  -W / 2, baseY,  D / 2,   0, peakY, 0, // left  (-x)
      ]);
      const uv = new Float32Array([
        0, 0, 1, 0, 0.5, 1,
        0, 0, 1, 0, 0.5, 1,
        0, 0, 1, 0, 0.5, 1,
        0, 0, 1, 0, 0.5, 1,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }

    // Lantern: small raised glass box centred on the roof.
    if (lantern) {
      const lanternGlass = glassMaterial();
      const lanternFrame = frameMaterial();
      const ls = Math.min(W, D) * 0.32;
      const lh = 0.45;
      const lanternBase = baseY + (shape === 'flat' ? 0.14 : ridgeH * 0.55);
      const box = new THREE.Mesh(new THREE.BoxGeometry(ls, lh, ls), lanternGlass);
      box.position.set(0, lanternBase + lh / 2, 0);
      canopyGroup.add(box);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(ls + 0.1, 0.06, ls + 0.1), lanternFrame);
      cap.position.set(0, lanternBase + lh + 0.03, 0);
      cap.castShadow = true;
      canopyGroup.add(cap);
    }
  }

  // ─── Conservatory scenes ──────────────────────────────────────────────
  // Each of the 4 styles renders as a unique build. Shared building blocks
  // (`buildDwarfSegment`, `buildGlazedSegment`, `buildPerimeterFrame`) walk a
  // polygon footprint so the Victorian faceted bay reuses the same plumbing.

  // Plan-view CCW footprint. First edge (vertices 0→1) is the back wall, which
  // sits against the house — we skip rendering it but still use it to anchor
  // the polygon.
  type Pt = [number, number];

  function conservatoryFootprint(style: string, W: number, D: number, facets: 3 | 5): Pt[] {
    if (style === 'conservatory-victorian') {
      // Back wall along -D/2, bay projects forward to +D/2.
      if (facets === 3) {
        const chamfer = Math.min(D, W) * 0.35;
        return [
          [-W / 2, -D / 2],                         // back-left
          [ W / 2, -D / 2],                         // back-right
          [ W / 2,  D / 2 - chamfer],               // right side end
          [ W / 2 - chamfer,  D / 2],               // right chamfer
          [-W / 2 + chamfer,  D / 2],               // left chamfer (front centre between)
          [-W / 2,  D / 2 - chamfer],               // left side end
        ];
      } else {
        // 5 facets: approximate as a semi-ellipse fan over the front edge.
        // Order is CCW (back-left → back-right → right-side → bay arc R→L → left-side).
        const pts: Pt[] = [[-W / 2, -D / 2], [W / 2, -D / 2]];
        const baseZ = -D / 2 + D * 0.4;
        pts.push([ W / 2, baseZ]);
        const segs = 5;
        const cx = 0, cz = baseZ;
        const rx = W / 2, rz = D - (D * 0.4);
        // a sweeps 0 → π so cos·rx goes +rx → −rx (R→L) and sin·rz arches forward.
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const a = Math.PI * t;
          pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
        }
        pts.push([-W / 2, baseZ]);
        return pts;
      }
    }
    // Rectangular footprint for lean-to / Edwardian / orangery.
    return [
      [-W / 2, -D / 2], [ W / 2, -D / 2],
      [ W / 2,  D / 2], [-W / 2,  D / 2],
    ];
  }

  function buildPolygonFloor(footprint: Pt[]) {
    const floorMat = flooringMaterial() ?? new THREE.MeshStandardMaterial({ color: 0x9c8e76, roughness: 0.85 });
    const n = footprint.length;
    const positions = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      positions[i * 3]     = footprint[i][0];
      positions[i * 3 + 1] = 0.02;
      positions[i * 3 + 2] = footprint[i][1];
    }
    // Fan triangulation (works for convex polygons). Reversed winding so the
    // normal points up (+Y) instead of down.
    const indices: number[] = [];
    for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, floorMat);
    m.receiveShadow = true;
    canopyGroup.add(m);
  }

  // Build a brick dwarf-wall slab + cap along a single polygon edge.
  function buildDwarfSegment(a: Pt, b: Pt, h: number, brickKey: string) {
    if (h <= 0.02) return;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const rotY = -Math.atan2(dz, dx);
    const t = 0.12;
    const mat = brickMaterial(brickKey);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, h, t), mat);
    wall.position.set(mx, h / 2, mz);
    wall.rotation.y = rotY;
    wall.castShadow = true; wall.receiveShadow = true;
    canopyGroup.add(wall);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.6, metalness: 0.02 });
    const capH = 0.04, capOver = 0.02;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len + capOver * 2, capH, t + capOver * 2), capMat);
    cap.position.set(mx, h + capH / 2, mz);
    cap.rotation.y = rotY;
    cap.castShadow = true; cap.receiveShadow = true;
    canopyGroup.add(cap);
  }

  // Build a glazed wall panel + mullion grid above the dwarf wall on one edge.
  function buildGlazedSegment(a: Pt, b: Pt, baseY: number, height: number) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const rotY = -Math.atan2(dz, dx);
    const fm = frameMaterial();
    const gm = glassMaterial();
    const panelH = height - baseY - 0.08;
    if (panelH <= 0.1) return;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(len - 0.08, panelH, 0.025), gm);
    pane.position.set(mx, baseY + panelH / 2 + 0.04, mz);
    pane.rotation.y = rotY;
    canopyGroup.add(pane);
    // Mullion grid: vertical mullions every ~1m + a single horizontal transom.
    const cols = Math.max(2, Math.round(len / 1.05));
    for (let i = 0; i <= cols; i++) {
      const u = -len / 2 + (len * i) / cols;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.045, panelH, 0.06), fm);
      // place along edge direction then rotate
      const localX = u, localZ = 0;
      const wx = mx + Math.cos(rotY) * localX + Math.sin(rotY) * localZ;
      const wz = mz - Math.sin(rotY) * localX + Math.cos(rotY) * localZ;
      mullion.position.set(wx, baseY + panelH / 2 + 0.04, wz);
      mullion.rotation.y = rotY;
      mullion.castShadow = true;
      canopyGroup.add(mullion);
    }
    const transom = new THREE.Mesh(new THREE.BoxGeometry(len - 0.04, 0.06, 0.06), fm);
    transom.position.set(mx, baseY + panelH * 0.65 + 0.04, mz);
    transom.rotation.y = rotY;
    canopyGroup.add(transom);
  }

  // Corner posts at every polygon vertex (except back wall, which is the house)
  // + a perimeter beam ring at eaves level.
  function buildPerimeterFrame(footprint: Pt[], H: number) {
    const fm = frameMaterial();
    const postSize = 0.12;
    const beamH = 0.18, beamY = H - beamH / 2 + 0.01;
    // Posts at vertices that touch a glazed edge (skip the two back-wall corners).
    for (let i = 1; i < footprint.length; i++) {
      const [x, z] = footprint[i];
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, H, postSize), fm);
      post.position.set(x, H / 2, z);
      post.castShadow = true; post.receiveShadow = true;
      canopyGroup.add(post);
    }
    // Beams along each glazed edge.
    for (let i = 1; i < footprint.length; i++) {
      const a = footprint[i];
      const b = footprint[(i + 1) % footprint.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, beamH, postSize), fm);
      beam.position.set((a[0] + b[0]) / 2, beamY, (a[1] + b[1]) / 2);
      beam.rotation.y = -Math.atan2(dz, dx);
      beam.castShadow = true; beam.receiveShadow = true;
      canopyGroup.add(beam);
    }
  }

  function buildConservatoryScene(W: number, D: number, H: number) {
    if (!state) return;
    const style = productScene ?? 'conservatory-leanto';
    const facets: 3 | 5 = state.victorianFacets === '5' ? 5 : 3;
    const footprint = conservatoryFootprint(style, W, D, facets);
    const dwarfHeight = state.dwarfWall ? state.dwarfWall.height : 0;
    const brickKey = state.dwarfWall?.brick ?? 'red-engineering';

    buildPolygonFloor(footprint);

    // Skip edge 0 (back wall against the house) — it's not rendered as glazing.
    for (let i = 1; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length];
      buildDwarfSegment(a, b, dwarfHeight, brickKey);
      buildGlazedSegment(a, b, dwarfHeight, H);
    }

    buildPerimeterFrame(footprint, H);

    // Per-style roof
    if (style === 'conservatory-leanto')         buildLeantoRoof(W, D, H);
    else if (style === 'conservatory-edwardian') buildEdwardianRoof(W, D, H);
    else if (style === 'conservatory-orangery')  buildOrangeryRoof(W, D, H, brickKey);
    else if (style === 'conservatory-victorian') buildVictorianRoof(footprint, H);

    if (state.structure === 'wallmounted') buildHouse(W, D, H);
    if (state.addons.lighting) buildLighting(W, D, H);
    if (state.addons.bar)      buildBarLights(W, D, H);
    if (state.addons.heater)   buildHeaters(W, D, H);
    if (state.addons.speakers) buildSpeakers(W, D, H);
    buildBollards(W, D);
    buildFurniture(W, D);

    pad.scale.set(W + 1.8, D + 1.8, 1);
    paverTex.repeat.set((W + 1.8) / 2.4, (D + 1.8) / 2.4);
    contact.scale.set(W + 1.2, D + 1.2, 1);
  }

  // Lean-to: mono-pitch glass roof, ridge at back (against the house).
  function buildLeantoRoof(W: number, D: number, H: number) {
    const fm = frameMaterial();
    const gm = glassMaterial();
    const rise = D * 0.18;
    const angle = Math.atan2(rise, D);
    const slopeLen = Math.hypot(D, rise);
    const overhang = 0.12;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.05, slopeLen + overhang), gm);
    panel.position.set(0, H + rise / 2 + 0.03, 0);
    panel.rotation.x = -angle; // higher at back (-Z), lower at front (+Z)
    canopyGroup.add(panel);
    const cols = Math.max(3, Math.round(W / 1.05));
    for (let i = 1; i < cols; i++) {
      const x = -W / 2 + (W * i) / cols;
      const mul = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, slopeLen + overhang), fm);
      mul.position.set(x, H + rise / 2 + 0.06, 0);
      mul.rotation.x = -angle;
      mul.castShadow = true;
      canopyGroup.add(mul);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.14, 0.18), fm);
    ridge.position.set(0, H + rise + 0.07, -D / 2);
    ridge.castShadow = true;
    canopyGroup.add(ridge);
  }

  // Edwardian: 4-face hipped glass roof meeting at a single peak above centre.
  function buildEdwardianRoof(W: number, D: number, H: number) {
    const gm = glassMaterial();
    const fm = frameMaterial();
    const ridgeH = Math.min(W, D) * 0.32;
    const peakY = H + ridgeH;
    const v = new Float32Array([
      -W / 2, H,  D / 2,   W / 2, H,  D / 2,   0, peakY, 0,
       W / 2, H,  D / 2,   W / 2, H, -D / 2,   0, peakY, 0,
       W / 2, H, -D / 2,  -W / 2, H, -D / 2,   0, peakY, 0,
      -W / 2, H, -D / 2,  -W / 2, H,  D / 2,   0, peakY, 0,
    ]);
    const uv = new Float32Array([
      0, 0, 1, 0, 0.5, 1,  0, 0, 1, 0, 0.5, 1,
      0, 0, 1, 0, 0.5, 1,  0, 0, 1, 0, 0.5, 1,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, gm);
    mesh.castShadow = true; mesh.receiveShadow = true;
    canopyGroup.add(mesh);
    // Hip rafters along each ridge edge (4 sloping from peak to corners).
    const corners: Pt[] = [[-W / 2,  D / 2], [W / 2,  D / 2], [W / 2, -D / 2], [-W / 2, -D / 2]];
    for (const [cx, cz] of corners) {
      const len = Math.hypot(cx, ridgeH, cz);
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, len), fm);
      rafter.position.set(cx / 2, H + ridgeH / 2 + 0.02, cz / 2);
      rafter.lookAt(0, peakY, 0);
      rafter.castShadow = true;
      canopyGroup.add(rafter);
    }
  }

  // Orangery: brick piers at corners + mid-front, flat opaque parapet roof
  // around the perimeter, central raised glass lantern.
  function buildOrangeryRoof(W: number, D: number, H: number, brickKey: string) {
    const fm = frameMaterial();
    const gm = glassMaterial();
    const tileLikeMat = new THREE.MeshStandardMaterial({ color: 0xb8b1a3, roughness: 0.82 });
    // Flat perimeter slab (with hole would need CSG; instead use 4 strips that
    // frame the lantern opening).
    const lanternW = W * 0.5;
    const lanternD = D * 0.5;
    const stripT = 0.16;
    const slabY = H + stripT / 2;
    const frontStrip = new THREE.Mesh(new THREE.BoxGeometry(W, stripT, (D - lanternD) / 2), tileLikeMat);
    frontStrip.position.set(0, slabY, (D + lanternD) / 4);
    canopyGroup.add(frontStrip);
    const backStrip = new THREE.Mesh(new THREE.BoxGeometry(W, stripT, (D - lanternD) / 2), tileLikeMat);
    backStrip.position.set(0, slabY, -(D + lanternD) / 4);
    canopyGroup.add(backStrip);
    const leftStrip = new THREE.Mesh(new THREE.BoxGeometry((W - lanternW) / 2, stripT, lanternD), tileLikeMat);
    leftStrip.position.set(-(W + lanternW) / 4, slabY, 0);
    canopyGroup.add(leftStrip);
    const rightStrip = new THREE.Mesh(new THREE.BoxGeometry((W - lanternW) / 2, stripT, lanternD), tileLikeMat);
    rightStrip.position.set((W + lanternW) / 4, slabY, 0);
    canopyGroup.add(rightStrip);
    // Parapet upstand along the outer edge.
    const upH = 0.22;
    const upY = H + stripT + upH / 2;
    const parts: [number, number, number, number, number][] = [
      [W + 0.04, upH, 0.1, 0,  D / 2 + 0.02],
      [W + 0.04, upH, 0.1, 0, -D / 2 - 0.02],
      [0.1, upH, D + 0.04, -W / 2 - 0.02, 0],
      [0.1, upH, D + 0.04,  W / 2 + 0.02, 0],
    ];
    for (const [w, h, d, x, z] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tileLikeMat);
      m.position.set(x, upY, z);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }
    // Lantern: raised glass box with a low pyramid glass cap.
    const lanternBase = H + stripT;
    const lanternH = 0.55;
    const lanternBox = new THREE.Mesh(new THREE.BoxGeometry(lanternW, lanternH, lanternD), gm);
    lanternBox.position.set(0, lanternBase + lanternH / 2, 0);
    canopyGroup.add(lanternBox);
    // Lantern roof — 4-face glass pyramid.
    const peakY = lanternBase + lanternH + Math.min(lanternW, lanternD) * 0.35;
    const lv = new Float32Array([
      -lanternW / 2, lanternBase + lanternH,  lanternD / 2,
       lanternW / 2, lanternBase + lanternH,  lanternD / 2,
       0, peakY, 0,
       lanternW / 2, lanternBase + lanternH,  lanternD / 2,
       lanternW / 2, lanternBase + lanternH, -lanternD / 2,
       0, peakY, 0,
       lanternW / 2, lanternBase + lanternH, -lanternD / 2,
      -lanternW / 2, lanternBase + lanternH, -lanternD / 2,
       0, peakY, 0,
      -lanternW / 2, lanternBase + lanternH, -lanternD / 2,
      -lanternW / 2, lanternBase + lanternH,  lanternD / 2,
       0, peakY, 0,
    ]);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lv, 3));
    lgeo.computeVertexNormals();
    const lroof = new THREE.Mesh(lgeo, gm);
    lroof.castShadow = true;
    canopyGroup.add(lroof);
    // Lantern frame caps along the 4 base edges
    const baseY = lanternBase + lanternH;
    const baseEdges: [number, number, number, number, number, number][] = [
      [lanternW, 0.06, 0.06, 0, baseY,  lanternD / 2],
      [lanternW, 0.06, 0.06, 0, baseY, -lanternD / 2],
      [0.06, 0.06, lanternD, -lanternW / 2, baseY, 0],
      [0.06, 0.06, lanternD,  lanternW / 2, baseY, 0],
    ];
    for (const [w, h, d, x, y, z] of baseEdges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm);
      m.position.set(x, y, z);
      canopyGroup.add(m);
    }
    // Brick piers at the 4 outer corners + 2 mid-front.
    const pierMat = brickMaterial(brickKey);
    const pierW = 0.36, pierD = 0.36;
    const piers: Pt[] = [
      [-W / 2 + pierW / 2,  D / 2 - pierD / 2],
      [ W / 2 - pierW / 2,  D / 2 - pierD / 2],
      [ W / 2 - pierW / 2, -D / 2 + pierD / 2],
      [-W / 2 + pierW / 2, -D / 2 + pierD / 2],
      [-W / 6,              D / 2 - pierD / 2],
      [ W / 6,              D / 2 - pierD / 2],
    ];
    for (const [px, pz] of piers) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(pierW, H, pierD), pierMat);
      pier.position.set(px, H / 2, pz);
      pier.castShadow = true; pier.receiveShadow = true;
      canopyGroup.add(pier);
    }
  }

  // Victorian: faceted hip roof — one triangular glass panel per polygon edge
  // (excluding the back wall), meeting at a peak above the bay centre.
  function buildVictorianRoof(footprint: Pt[], H: number) {
    const gm = glassMaterial();
    const fm = frameMaterial();
    // Peak above centroid of the front portion of the polygon.
    let cx = 0, cz = 0, n = 0;
    for (let i = 1; i < footprint.length; i++) { cx += footprint[i][0]; cz += footprint[i][1]; n++; }
    cx /= Math.max(1, n); cz /= Math.max(1, n);
    const maxR = footprint.slice(1).reduce((m, [x, z]) => Math.max(m, Math.hypot(x - cx, z - cz)), 0);
    const peakY = H + maxR * 0.55;
    // Build one triangle per glazed edge.
    const positions: number[] = [];
    const uvs: number[] = [];
    for (let i = 1; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length];
      positions.push(a[0], H, a[1], b[0], H, b[1], cx, peakY, cz);
      uvs.push(0, 0, 1, 0, 0.5, 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, gm);
    mesh.castShadow = true; mesh.receiveShadow = true;
    canopyGroup.add(mesh);
    // Hip rafters from peak down to each glazed-edge corner.
    for (let i = 1; i < footprint.length; i++) {
      const [x, z] = footprint[i];
      const len = Math.hypot(x - cx, peakY - H, z - cz);
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, len), fm);
      rafter.position.set((x + cx) / 2, (H + peakY) / 2, (z + cz) / 2);
      rafter.lookAt(cx, peakY, cz);
      rafter.castShadow = true;
      canopyGroup.add(rafter);
    }
  }

  function buildHouse(W: number, D: number, H: number) {
    const wallMat = claddingMaterial() ?? new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.9 });
    const houseW = W + 4, houseH = H + 1.9, houseT = 0.35;
    const house = new THREE.Mesh(new THREE.BoxGeometry(houseW, houseH, houseT), wallMat);
    house.position.set(0, houseH / 2, -D / 2 - houseT / 2 - 0.02);
    house.receiveShadow = true; house.castShadow = true;
    canopyGroup.add(house);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.6, 0.2, houseT + 0.4), new THREE.MeshStandardMaterial({ color: 0x4e4136, roughness: 0.7 }));
    eave.position.set(0, houseH + 0.08, -D / 2 - houseT / 2 - 0.02);
    eave.castShadow = true;
    canopyGroup.add(eave);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4d, roughness: 0.4 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.05), doorMat);
    door.position.set(0, 1.05, -D / 2 + 0.02);
    canopyGroup.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshStandardMaterial({ color: 0xc9a55e, roughness: 0.25, metalness: 0.8 }));
    knob.position.set(0.35, 1.05, -D / 2 + 0.06);
    canopyGroup.add(knob);
    const winGlass = new THREE.MeshPhysicalMaterial({ color: 0xaec7d2, transmission: 0.7, roughness: 0.05, ior: 1.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const winFrame = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.5 });
    for (const wx of [-W * 0.40, W * 0.40]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.15, 0.06), winFrame);
      f.position.set(wx, 1.5, -D / 2 + 0.015);
      canopyGroup.add(f);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.0, 0.03), winGlass);
      win.position.set(wx, 1.5, -D / 2 + 0.045);
      canopyGroup.add(win);
    }
  }

  function buildLighting(W: number, D: number, H: number) {
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffdf94, emissiveIntensity: 0.5, roughness: 0.3 });
    const stripMat = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffd98a, emissiveIntensity: 0.4, roughness: 0.4 });
    const pos = state!.elementsPosition;
    if (pos === 'perimeter') {
      for (const z of [D / 2 - 0.16, -D / 2 + 0.16]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.022, 0.05), stripMat);
        strip.position.set(0, H - 0.105, z);
        canopyGroup.add(strip); ledMeshes.push(strip);
      }
      const n = Math.max(3, Math.round(W));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + W * (i + 0.5) / n;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), bulbMat);
        b.position.set(x, H - 0.1, 0);
        canopyGroup.add(b); ledMeshes.push(b);
      }
    } else if (pos === 'corners') {
      for (const [cx, cz] of [[-W / 2 + 0.3, -D / 2 + 0.3], [W / 2 - 0.3, -D / 2 + 0.3], [W / 2 - 0.3, D / 2 - 0.3], [-W / 2 + 0.3, D / 2 - 0.3]]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), bulbMat);
        b.position.set(cx, H - 0.1, cz);
        canopyGroup.add(b); ledMeshes.push(b);
      }
    } else {
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), bulbMat);
          b.position.set(i * 0.5, H - 0.1, j * 0.5);
          canopyGroup.add(b); ledMeshes.push(b);
        }
    }
    const pl = new THREE.PointLight(0xffd28a, 0, 9, 2);
    pl.position.set(0, H - 0.25, 0);
    canopyGroup.add(pl); glowLights.push(pl);
  }
  function buildBarLights(W: number, D: number, H: number) {
    void D;
    const barMat = new THREE.MeshStandardMaterial({ color: 0xfff7da, emissive: 0xfff0b8, emissiveIntensity: 0.6, roughness: 0.35 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W - 0.8, 0.04, 0.08), barMat);
    bar.position.set(0, H - 0.09, 0);
    canopyGroup.add(bar); ledMeshes.push(bar);
  }
  function buildHeaters(W: number, D: number, H: number) {
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xb9b9b9, roughness: 0.3, metalness: 0.7 });
    for (const x of [-W * 0.22, W * 0.22]) {
      const heater = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.09, 0.17), shellMat);
      heater.add(shell);
      const emit = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.035, 0.12), new THREE.MeshStandardMaterial({ color: 0x300800, emissive: 0xff5a1f, emissiveIntensity: 0.7, roughness: 0.4 }));
      emit.position.y = -0.045;
      heater.add(emit);
      heaterEmitters.push(emit);
      heater.position.set(x, H - 0.26, D / 2 - 0.5);
      canopyGroup.add(heater);
    }
  }
  function buildSpeakers(W: number, D: number, H: number) {
    void D;
    const spkMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4 });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.6 });
    for (const x of [-W * 0.3, W * 0.3]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 24), spkMat);
      ring.position.set(x, H - 0.05, 0);
      canopyGroup.add(ring);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24), innerMat);
      cone.position.set(x, H - 0.07, 0);
      canopyGroup.add(cone);
    }
  }
  function buildBollards(W: number, D: number) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffe1a0, emissiveIntensity: 0.15, roughness: 0.4 });
    const positions: [number, number, number][] = [
      [W / 2 + 1.4, 0, D / 2 + 1.2], [-W / 2 - 1.4, 0, D / 2 + 1.2],
      [W / 2 + 1.4, 0, -D / 2 - 1.2], [-W / 2 - 1.4, 0, -D / 2 - 1.2],
    ];
    for (const [x, , z] of positions) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 10), postMat);
      post.position.y = 0.275; post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 10), capMat);
      cap.position.y = 0.58;
      g.add(cap); ledMeshes.push(cap);
      const pl = new THREE.PointLight(0xffd9a0, 0, 3.2, 2);
      pl.position.y = 0.65;
      g.add(pl);
      bollardLights.push(pl);
      g.position.set(x, 0, z);
      canopyGroup.add(g);
    }
  }

  function buildFurniture(W: number, D: number) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.1), new THREE.MeshStandardMaterial({ color: 0xcabfa8, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.016, 0.25);
    rug.receiveShadow = true;
    canopyGroup.add(rug);

    const fabricMat = new THREE.MeshStandardMaterial({ color: 0x504a44, roughness: 0.95 });
    const cushMat = new THREE.MeshStandardMaterial({ color: 0xa79a85, roughness: 0.95 });

    const sofa = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.95), fabricMat);
    base.position.y = 0.175; sofa.add(base);
    for (const ax of [-1.12, 1.12]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.95), fabricMat);
      arm.position.set(ax, 0.275, 0); sofa.add(arm);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.18), fabricMat);
    back.position.set(0, 0.55, -0.38); sofa.add(back);
    for (const cx of [-0.6, 0.6]) {
      const cush = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.16, 0.82), cushMat);
      cush.position.set(cx, 0.43, 0.02); sofa.add(cush);
      const bc = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.36, 0.18), cushMat);
      bc.position.set(cx, 0.66, -0.30); sofa.add(bc);
    }
    sofa.position.set(0, 0, -0.45);
    sofa.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    canopyGroup.add(sofa);

    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.6), woodMat);
    top.position.set(0, 0.4, 0.85);
    top.castShadow = true; top.receiveShadow = true;
    canopyGroup.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
    for (const [lx, lz] of [[-0.44, -0.24], [0.44, -0.24], [0.44, 0.24], [-0.44, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), legMat);
      leg.position.set(lx, 0.2, 0.85 + lz);
      leg.castShadow = true;
      canopyGroup.add(leg);
    }
    for (const [cx, rot] of [[-1.7, 0.5], [1.7, -0.5]]) {
      const ch = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), cushMat);
      seat.position.y = 0.4; ch.add(seat);
      const backr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.08), fabricMat);
      backr.position.set(0, 0.7, -0.24); ch.add(backr);
      for (const [lx, lz] of [[-0.23, -0.23], [0.23, -0.23], [0.23, 0.23], [-0.23, 0.23]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.4, 0.035), legMat);
        leg.position.set(lx, 0.2, lz); ch.add(leg);
      }
      ch.position.set(cx * W / 5, 0, 0.5);
      ch.rotation.y = rot;
      ch.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      canopyGroup.add(ch);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 18), new THREE.MeshStandardMaterial({ color: 0xb0a28c, roughness: 0.8 }));
    pot.position.set(W / 2 - 0.5, 0.21, D / 2 - 0.45);
    pot.castShadow = true;
    canopyGroup.add(pot);
    const bush = new THREE.Mesh(jitterGeo(new THREE.SphereGeometry(0.34, 12, 10), 0.07), leafMat);
    bush.position.set(W / 2 - 0.5, 0.68, D / 2 - 0.45);
    bush.castShadow = true;
    canopyGroup.add(bush);
  }

  function buildCar() {
    const car = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x7e1f2c, metalness: 0.7, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
    const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x1a2530, metalness: 0.2, roughness: 0.08, transmission: 0.25, transparent: true, opacity: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.6 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.95 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9b9b9, roughness: 0.25, metalness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.5, 1.75), paint);
    body.position.y = 0.55; car.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.12, 1.8), trimMat);
    hood.position.y = 0.32; car.add(hood);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.62), paint);
    cabin.position.set(-0.25, 1.02, 0); car.add(cabin);
    const glasshouse = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.36, 1.66), darkGlass);
    glasshouse.position.set(-0.25, 1.0, 0); car.add(glasshouse);
    for (const [wx, wz] of [[-1.3, -0.85], [1.3, -0.85], [1.3, 0.85], [-1.3, 0.85]]) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24), tyreMat);
      tyre.rotation.x = Math.PI / 2; tyre.position.set(wx, 0.34, wz); car.add(tyre);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 16), hubMat);
      hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.34, wz); car.add(hub);
    }
    const head = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff6c9, emissiveIntensity: 0.25 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.3 });
    for (const z of [-0.6, 0.6]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), head); h.position.set(1.96, 0.6, z); car.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), tail); t.position.set(-1.96, 0.6, z); car.add(t);
    }
    car.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    car.rotation.y = 0.06;
    canopyGroup.add(car);
  }

  // --- Custom scenes: container / fence / garage ---
  function buildContainer(W: number, D: number, H: number) {
    const fm = frameMaterial();
    const c = FRAME_COLORS[state!.frameColor as keyof typeof FRAME_COLORS];
    const corrTex = canvasTex((g, w, h) => {
      const base = new THREE.Color(c.hex);
      const baseR = Math.round(base.r * 255), baseG = Math.round(base.g * 255), baseB = Math.round(base.b * 255);
      for (let x = 0; x < w; x++) {
        const wave = Math.sin(x * 0.18) * 0.16 + 0.84;
        const rC = Math.min(255, Math.round(baseR * wave));
        const gC = Math.min(255, Math.round(baseG * wave));
        const bC = Math.min(255, Math.round(baseB * wave));
        g.fillStyle = `rgb(${rC},${gC},${bC})`;
        g.fillRect(x, 0, 1, h);
      }
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1, 2);
      }
    }, 512, 256, [Math.max(2, W / 2), 1]);
    const corrMat = new THREE.MeshStandardMaterial({ map: corrTex, roughness: 0.55, metalness: 0.4 });

    pad.scale.set(W + 1.2, D + 1.2, 1);
    paverTex.repeat.set((W + 1.2) / 2.4, (D + 1.2) / 2.4);
    contact.scale.set(W + 0.8, D + 0.8, 1);

    const wallT = 0.05;
    const baseY = 0.12;
    const baseRails = new THREE.Mesh(new THREE.BoxGeometry(W, baseY, D), new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7 }));
    baseRails.position.y = baseY / 2; baseRails.castShadow = true; baseRails.receiveShadow = true;
    canopyGroup.add(baseRails);
    for (const sx of [-W / 2 + wallT / 2, W / 2 - wallT / 2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, D - 0.02), corrMat);
      m.position.set(sx, baseY + H / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * wallT, H, wallT), corrMat);
    back.position.set(0, baseY + H / 2, -D / 2 + wallT / 2);
    back.castShadow = true; back.receiveShadow = true;
    canopyGroup.add(back);
    const frontPanelW = (W - 2 * wallT) / 2;
    const frontSteel = new THREE.Mesh(new THREE.BoxGeometry(frontPanelW, H, wallT), corrMat);
    frontSteel.position.set(-frontPanelW / 2, baseY + H / 2, D / 2 - wallT / 2);
    frontSteel.castShadow = true; frontSteel.receiveShadow = true;
    canopyGroup.add(frontSteel);
    const slider = new THREE.Mesh(new THREE.BoxGeometry(frontPanelW - 0.04, H - 0.1, 0.025), glassMaterial());
    slider.position.set(frontPanelW / 2, baseY + H / 2, D / 2 - 0.02);
    canopyGroup.add(slider);
    const sliderFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 0.06), fm);
    sliderFrame.position.set(frontPanelW / 2, baseY + H / 2, D / 2 - wallT / 2);
    canopyGroup.add(sliderFrame);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.025, H * 0.45, 1.4), glassMaterial());
    win.position.set(-W / 2 + wallT / 2 - 0.005, baseY + H * 0.55, 0);
    canopyGroup.add(win);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, H * 0.5, 1.46), fm);
    winFrame.position.set(-W / 2 + wallT / 2, baseY + H * 0.55, 0);
    canopyGroup.add(winFrame);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.06, D + 0.05), corrMat);
    roof.position.set(0, baseY + H + 0.03, 0);
    roof.castShadow = true; roof.receiveShadow = true;
    canopyGroup.add(roof);

    const stencilTex = canvasTex((g, w, h) => {
      g.fillStyle = c.hex;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = 'bold 64px monospace';
      g.fillText('CSDU 1024 7', 20, 80);
    }, 512, 128, [1, 1]);
    const stencilMat = new THREE.MeshStandardMaterial({ map: stencilTex, roughness: 0.65, metalness: 0.35, transparent: true, opacity: 0.9 });
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, 0.4), stencilMat);
    stencil.position.set(0, baseY + H * 0.78, D / 2 + 0.001);
    canopyGroup.add(stencil);

    const floorMat = flooringMaterial();
    if (floorMat) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, D - 0.12), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = baseY + 0.005;
      floor.receiveShadow = true;
      canopyGroup.add(floor);
    }
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.7 }));
    step.position.set(frontPanelW / 2, baseY / 2, D / 2 + 0.22);
    step.castShadow = true; step.receiveShadow = true;
    canopyGroup.add(step);

    if (state!.addons.lighting) {
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffdf94, emissiveIntensity: 0.5 });
      for (const x of [-W * 0.3, 0, W * 0.3]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bulbMat);
        b.position.set(x, baseY + H - 0.08, 0);
        canopyGroup.add(b); ledMeshes.push(b);
      }
      const pl = new THREE.PointLight(0xffd28a, 0, 7, 2);
      pl.position.set(0, baseY + H - 0.2, 0);
      canopyGroup.add(pl); glowLights.push(pl);
    }
  }

  function buildFenceLine(W: number, _D: number, H: number) {
    const fm = frameMaterial();
    const clad = claddingMaterial();
    const slatMat = clad ?? fm;
    const panelMat = clad ?? new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });

    pad.scale.set(W + 1.4, 1.2, 1);
    paverTex.repeat.set((W + 1.4) / 2.4, 0.5);
    contact.scale.set(W + 0.6, 0.6, 1);

    const postSize = 0.1, panelSpan = 1.8;
    const numPanels = Math.max(2, Math.round(W / panelSpan));
    const cellW = W / numPanels;
    const fenceH = H;

    for (let i = 0; i <= numPanels; i++) {
      const x = -W / 2 + i * cellW;
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, fenceH + 0.1, postSize), fm);
      post.position.set(x, (fenceH + 0.1) / 2, 0);
      post.castShadow = true; post.receiveShadow = true;
      canopyGroup.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(postSize * 1.4, 0.05, postSize * 1.4), fm);
      cap.position.set(x, fenceH + 0.1, 0);
      canopyGroup.add(cap);
    }

    for (let i = 0; i < numPanels; i++) {
      const cx = -W / 2 + cellW * (i + 0.5);
      const innerW = cellW - postSize - 0.04;
      if (state!.walls.front === 'louvre' || state!.walls.back === 'louvre') {
        const slatTh = 0.06, gap = 0.04;
        const n = Math.floor((fenceH - 0.1) / (slatTh + gap));
        for (let j = 0; j < n; j++) {
          const y = 0.05 + j * (slatTh + gap) + slatTh / 2;
          const s = new THREE.Mesh(new THREE.BoxGeometry(innerW, slatTh, 0.04), slatMat);
          s.position.set(cx, y, 0);
          s.castShadow = true; s.receiveShadow = true;
          canopyGroup.add(s);
        }
      } else {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(innerW, fenceH - 0.05, 0.04), panelMat);
        panel.position.set(cx, fenceH / 2, 0);
        panel.castShadow = true; panel.receiveShadow = true;
        canopyGroup.add(panel);
      }
    }

    const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 0.05), fm);
    rail.position.set(0, 0.04, 0); canopyGroup.add(rail);
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 0.05), fm);
    railTop.position.set(0, fenceH - 0.04, 0); canopyGroup.add(railTop);

    if (state!.addons.lighting) {
      const capMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffe1a0, emissiveIntensity: 0.6, roughness: 0.4 });
      for (let i = 0; i <= numPanels; i++) {
        const x = -W / 2 + i * cellW;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(postSize * 1.2, 0.04, postSize * 1.2), capMat);
        cap.position.set(x, fenceH + 0.14, 0);
        canopyGroup.add(cap); ledMeshes.push(cap);
        const pl = new THREE.PointLight(0xffd9a0, 0, 2.2, 2);
        pl.position.set(x, fenceH + 0.2, 0);
        canopyGroup.add(pl); glowLights.push(pl);
      }
    }
  }

  function buildGarageWall(W: number, D: number, H: number) {
    void D;
    const fm = frameMaterial();
    const wallMat = claddingMaterial() ?? new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.9, color: 0xddd3c2 });
    const houseW = W * 2.2, houseH = H + 1.4, wallT = 0.3;

    pad.scale.set(houseW + 0.5, 3, 1);
    paverTex.repeat.set(houseW / 2.4, 1.2);
    contact.scale.set(houseW * 0.95, 2, 1);

    const house = new THREE.Mesh(new THREE.BoxGeometry(houseW, houseH, wallT), wallMat);
    house.position.set(0, houseH / 2, -wallT / 2);
    house.castShadow = true; house.receiveShadow = true;
    canopyGroup.add(house);

    const eave = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.5, 0.18, wallT + 0.4), new THREE.MeshStandardMaterial({ color: 0x4e4136, roughness: 0.7 }));
    eave.position.set(0, houseH + 0.06, -wallT / 2);
    eave.castShadow = true;
    canopyGroup.add(eave);

    const slab = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 4.5), new THREE.MeshStandardMaterial({ color: 0x9c9a96, roughness: 0.85 }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0.005, 4.5 / 2 + 0.05);
    slab.receiveShadow = true;
    canopyGroup.add(slab);

    const doorW = W, doorH = H;
    const doorFrameT = 0.06;
    const trimMat = fm;
    const trimTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, doorFrameT, 0.05), trimMat);
    trimTop.position.set(0, doorH + doorFrameT / 2, 0.04);
    canopyGroup.add(trimTop);
    for (const sx of [-doorW / 2 - 0.05, doorW / 2 + 0.05]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(doorFrameT, doorH, 0.05), trimMat);
      tr.position.set(sx, doorH / 2, 0.04);
      canopyGroup.add(tr);
    }

    const insulated = state!.slatIsolation;
    const doorMat = state!.walls.front === 'metal' ? metalLamellaMaterial()
                  : state!.walls.front === 'glass' ? glassMaterial()
                  : new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.45, metalness: 0.15 });
    const panels = 4;
    const panelH = doorH / panels;
    for (let i = 0; i < panels; i++) {
      const y = i * panelH + panelH / 2;
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(doorW, panelH - 0.02, insulated ? 0.06 : 0.04), doorMat);
      pnl.position.set(0, y, 0.02);
      pnl.castShadow = true; pnl.receiveShadow = true;
      canopyGroup.add(pnl);
      if (i > 0) {
        const grv = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.012, 0.07), new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.6 }));
        grv.position.set(0, i * panelH, 0.045);
        canopyGroup.add(grv);
      }
      if (i === panels - 1 && state!.walls.front !== 'metal') {
        for (let k = 0; k < 3; k++) {
          const wx = (k - 1) * doorW / 3.3;
          const w = new THREE.Mesh(new THREE.BoxGeometry(doorW / 4.5, panelH * 0.5, 0.005), glassMaterial());
          w.position.set(wx, y, 0.046);
          canopyGroup.add(w);
          const wframe = new THREE.Mesh(new THREE.BoxGeometry(doorW / 4.5 + 0.04, panelH * 0.5 + 0.04, 0.012), trimMat);
          wframe.position.set(wx, y, 0.04);
          canopyGroup.add(wframe);
        }
      }
    }

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.03), trimMat);
    handle.position.set(0, panelH * 0.4, 0.05);
    canopyGroup.add(handle);

    const side = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x2c3a4d, roughness: 0.4 }));
    side.position.set(W / 2 + 0.8, 1.05, 0.025);
    canopyGroup.add(side);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshStandardMaterial({ color: 0xc9a55e, roughness: 0.25, metalness: 0.8 }));
    knob.position.set(W / 2 + 0.55, 1.05, 0.06);
    canopyGroup.add(knob);

    if (state!.addons.lighting) {
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffdf94, emissiveIntensity: 0.55 });
      for (const sx of [-doorW / 2 - 0.35, doorW / 2 + 0.35]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), bulbMat);
        lamp.position.set(sx, doorH + 0.5, 0.12);
        canopyGroup.add(lamp); ledMeshes.push(lamp);
        const pl = new THREE.PointLight(0xffd28a, 0, 4, 2);
        pl.position.set(sx, doorH + 0.5, 0.5);
        canopyGroup.add(pl); glowLights.push(pl);
      }
    }
  }

  // --- time of day ---
  const sunVec = new THREE.Vector3();
  function applyTime() {
    const t = timeOfDay;
    const dayFrac = Math.max(0, Math.min(1, (t - 6) / 14));
    const elev = Math.sin(dayFrac * Math.PI) * 62 - (t < 6 || t > 20 ? 9 : 0);
    const azim = 95 + dayFrac * 155;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    sunVec.setFromSphericalCoords(1, phi, theta);
    (skyU.sunPosition.value as THREE.Vector3).copy(sunVec);

    const day = Math.max(0, Math.min(1, Math.sin(THREE.MathUtils.degToRad(Math.max(elev, 0))) * 1.8));
    const night = elev < 2 ? Math.max(0, Math.min(1, (2 - elev) / 10)) : 0;
    const lowSun = elev > 0 && elev < 22 ? 1 - elev / 22 : 0;

    sunLight.position.copy(sunVec).multiplyScalar(35);
    sunLight.intensity = day * 1.9;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    sunLight.color.setRGB(1, lerp(0.95, 0.62, lowSun), lerp(0.86, 0.38, lowSun));
    sunLight.castShadow = day > 0.02;

    moonLight.intensity = night * 0.22;
    hemi.intensity = 0.06 + day * 0.42;
    ambient.intensity = 0.04 + day * 0.16;

    skyU.turbidity.value = lerp(5, 11, lowSun);
    skyU.rayleigh.value = lerp(1.4, 2.6, lowSun);
    skyU.mieCoefficient.value = lerp(0.004, 0.012, lowSun);

    starMat.opacity = night * 0.9;

    const fogDay = new THREE.Color(0xdde4ea), fogSet = new THREE.Color(0xd9b393), fogNight = new THREE.Color(0x141b27);
    const fogC = fogDay.clone().lerp(fogSet, lowSun).lerp(fogNight, night);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(fogC);

    bloom.strength = 0.10 + night * 0.55 + lowSun * 0.08;
    bloom.threshold = lerp(0.92, 0.55, night);
    renderer.toneMappingExposure = lerp(0.92, 0.55, night);

    const ledOn = 0.2 + night * 4.2;
    ledMeshes.forEach(m => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = ledOn * (state?.addons.lighting || bollardLights.length ? 1 : 0);
    });
    glowLights.forEach(l => { l.intensity = night * 1.6; });
    bollardLights.forEach(l => { l.intensity = night * 0.8; });
    heaterEmitters.forEach(m => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + night * 2.6; });

    const envI = 0.25 + day * 0.85;
    scene.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      const ms = Array.isArray(m) ? m : [m];
      ms.forEach(material => { if ('envMapIntensity' in material) (material as THREE.MeshStandardMaterial).envMapIntensity = envI; });
    });
  }

  // --- camera ---
  type CamAnim = { t0: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; tg0: THREE.Vector3; tg1: THREE.Vector3 };
  let camAnim: CamAnim | null = null;
  function tweenCamera(pos: THREE.Vector3, target: THREE.Vector3, dur = 900) {
    camAnim = { t0: performance.now(), dur, p0: camera.position.clone(), p1: pos, tg0: controls.target.clone(), tg1: target };
  }
  function applyView(animate = true) {
    if (!state) return;
    const W = state.length, D = state.depth, H = state.height;
    const r = Math.max(W, D) * 1.55;
    let pos: THREE.Vector3, tgt: THREE.Vector3;
    if (view === 'iso')        { pos = new THREE.Vector3(r, r * 0.62, r);    tgt = new THREE.Vector3(0, H * 0.42, 0); controls.enableRotate = true; }
    else if (view === 'front') { pos = new THREE.Vector3(0, H / 2 + 0.2, r * 1.45); tgt = new THREE.Vector3(0, H / 2, 0); controls.enableRotate = false; }
    else if (view === 'side')  { pos = new THREE.Vector3(r * 1.45, H / 2 + 0.2, 0); tgt = new THREE.Vector3(0, H / 2, 0); controls.enableRotate = false; }
    else                       { pos = new THREE.Vector3(0, r * 1.8, 0.01);  tgt = new THREE.Vector3(0, 0, 0);          controls.enableRotate = false; }
    if (animate) tweenCamera(pos, tgt);
    else { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); }
  }

  // --- resize ---
  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    composer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  const resizeObs = new ResizeObserver(resize);
  resizeObs.observe(container);
  resize();

  // --- loop ---
  let lastT = performance.now();
  let frames = 0, fpsT = lastT;
  let raf = 0;
  function animate(now: number) {
    raf = requestAnimationFrame(animate);
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (camAnim) {
      const k = Math.max(0, Math.min(1, (now - camAnim.t0) / camAnim.dur));
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.tg0, camAnim.tg1, e);
      if (k >= 1) camAnim = null;
    }
    if (spin && view === 'iso' && !camAnim) {
      const theta = Math.atan2(camera.position.z, camera.position.x) + dt * 0.22;
      const rad = Math.hypot(camera.position.x, camera.position.z);
      camera.position.x = Math.cos(theta) * rad;
      camera.position.z = Math.sin(theta) * rad;
    }
    const targetTilt = roofOpen ? -1.15 : 0;
    for (const s of louvreSlats) {
      s.rotation.z += (targetTilt - s.rotation.z) * Math.min(dt * 5, 1);
    }
    controls.update();
    composer.render();
    frames++;
    if (now - fpsT > 1000) {
      onFps?.(frames);
      frames = 0; fpsT = now;
    }
  }
  raf = requestAnimationFrame(animate);

  // --- pointer cursor ---
  canvas.addEventListener('pointerdown', () => { canvas.style.cursor = 'grabbing'; camAnim = null; });
  window.addEventListener('pointerup', () => { canvas.style.cursor = 'grab'; });

  // --- public API ---
  return {
    setState(s, productSceneId) {
      const colorChanged = state?.frameColor !== s.frameColor || state?.slatColor !== s.slatColor || state?.cladding !== s.cladding || state?.flooring !== s.flooring;
      state = s;
      productScene = productSceneId;
      if (colorChanged) clearMaterialCache();
      buildCanopy();
      if (!camAnim) applyView(false);
    },
    setView(v) {
      view = v;
      applyView(true);
    },
    setTime(t) {
      timeOfDay = t;
      applyTime();
    },
    setSpin(b) { spin = b; },
    setRoofOpen(b) { roofOpen = b; },
    snapshot() {
      composer.render();
      return canvas.toDataURL('image/png');
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      resizeObs.disconnect();
      disposeGroup(canopyGroup);
      clearMaterialCache();
      pmrem.dispose();
      composerRT.dispose();
      renderer.dispose();
      container.removeChild(canvas);
    },
  };
}
