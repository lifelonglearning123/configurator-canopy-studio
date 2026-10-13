'use client';

// Three.js scene ported from the HTML prototype (C:\python\configurator\index.html).
// Single self-contained client component: sets up renderer / scene / sky / static
// environment once, rebuilds the dynamic "canopy" group whenever ConfigState changes.

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { PROFILES, detectTier, isMobileDevice, lowerTier, type QualityTier, type QualityProfile } from './quality';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { FRAME_COLORS, BRICK, RENDER, ROOF_TILE } from '@/lib/catalog';
import { upperWindowLayout } from '@/lib/openings';
import type { ConfigState } from '@/lib/pricing';

export type SceneView = 'iso' | 'front' | 'side' | 'top';
export type SceneHandle = {
  /** Data URL of the current view rendered at `width` px wide (default 1920, PNG). */
  snapshot: (width?: number, type?: 'image/png' | 'image/jpeg', quality?: number) => string | null;
  /** Path-traced photo mode: progressive photoreal render in place of the live view. */
  photoSupported: () => boolean;
  startPhoto: (onProgress: (samples: number) => void, onEnd: () => void) => Promise<void>;
  stopPhoto: () => void;
  /** JPEG data URL of the photo render so far (null when not in photo mode). */
  photoDataUrl: () => string | null;
  /** Edge-preserving denoise on the photo output (default on). */
  setPhotoDenoise: (on: boolean) => void;
};

type Props = {
  state: ConfigState;
  scene: string | null;        // product scene id (e.g. 'car', 'container', 'fence', 'garage', 'awning')
  view: SceneView;
  time: number;                // 5.5 .. 22
  spin: boolean;
  roofOpen: boolean;
  onFps?: (fps: number) => void;
  /** Rendering budget. 'auto' (default) picks from the device and steps down
   *  while the frame rate stays low; a fixed tier is for dev / QA comparisons. */
  quality?: QualityTier | 'auto';
  onTier?: (tier: QualityTier) => void;
  /** Multiplier on the camera distance of the preset views (1 = default; <1 frames the product tighter). */
  frameScale?: number;
};

export const Scene = forwardRef<SceneHandle, Props>(function Scene(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneContext | null>(null);

  // Mount: set up the whole scene once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ctx = createScene(el, { onFps: props.onFps, onTier: props.onTier, quality: props.quality ?? 'auto', frameScale: props.frameScale ?? 1 });
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
    snapshot: (width, type, quality) => ctxRef.current?.snapshot(width, type, quality) ?? null,
    photoSupported: () => ctxRef.current?.photoSupported() ?? false,
    startPhoto: (onProgress, onEnd) => ctxRef.current?.startPhoto(onProgress, onEnd) ?? Promise.resolve(),
    stopPhoto: () => ctxRef.current?.stopPhoto(),
    photoDataUrl: () => ctxRef.current?.photoDataUrl() ?? null,
    setPhotoDenoise: (on) => ctxRef.current?.setPhotoDenoise(on),
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
  snapshot: (width?: number, type?: 'image/png' | 'image/jpeg', quality?: number) => string;
  photoSupported: () => boolean;
  startPhoto: (onProgress: (samples: number) => void, onEnd: () => void) => Promise<void>;
  stopPhoto: () => void;
  photoDataUrl: () => string | null;
  setPhotoDenoise: (on: boolean) => void;
  dispose: () => void;
};

type SceneOptions = {
  onFps?: (fps: number) => void;
  onTier?: (tier: QualityTier) => void;
  quality: QualityTier | 'auto';
  frameScale?: number;
};

function createScene(container: HTMLElement, opts: SceneOptions): SceneContext {
  const onFps = opts.onFps;
  // --- canvas ---
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  // --- renderer ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });

  // --- quality tier ---
  // Everything renders on the visitor's GPU. Start from a device heuristic
  // (the unmasked renderer string tells integrated from discrete), then the
  // frame-rate probe in the render loop steps down if the budget is too high.
  const gpuName = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  })();
  let profile: QualityProfile = PROFILES[opts.quality === 'auto' ? detectTier(gpuName) : opts.quality];
  opts.onTier?.(profile.tier);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxDpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // ACES filmic: gentle warm shift + highlight desaturation suits an outdoor
  // scene lit by a blue sky and a warm sun.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdde4ea, 48, 160);

  const pmrem = new THREE.PMREMGenerator(renderer);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
  camera.position.set(9, 5, 9);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 3.5;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.target.set(0, 1.2, 0);

  // --- post chain ---
  // MSAA on the render target (per tier) handles geometric edges; SMAA at the
  // very end cleans what MSAA cannot (specular aliasing, thin mullions) and is
  // cheap enough for phones. It runs after OutputPass so it sees the final
  // tonemapped image.
  const composerRT = new THREE.WebGLRenderTarget(1, 1, {
    samples: renderer.capabilities.isWebGL2 ? profile.msaa : 0,
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, composerRT);
  composer.addPass(new RenderPass(scene, camera));
  // Ground-truth ambient occlusion — contact shading where surfaces meet
  // (furniture→floor, beams→posts) so objects sit in the scene instead of
  // floating. Runs before bloom so the darkening participates in the glow.
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.blendIntensity = 0.85;
  gtao.enabled = profile.ao;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.12, 0.4, 0.9);
  bloom.enabled = false; // applyTime switches it on for night
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass());

  // --- sky + sun/moon/lights ---
  const sky = new Sky();
  sky.scale.setScalar(1000);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 6;
  skyU.rayleigh.value = 1.6;
  skyU.mieCoefficient.value = 0.004;
  skyU.mieDirectionalG.value = 0.85;

  // Environment lighting comes from the procedural sky itself rather than a
  // canned indoor studio: the Sky is rendered into a PMREM cubemap so
  // reflections and ambient bounce match the visible sky and track the
  // time-of-day slider (sunset glass reflects a sunset sky). A ground plane
  // below the horizon supplies grass-coloured bounce from beneath.
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envScene.add(envSky);
  const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x5e7c46 });
  const envGround = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), envGroundMat);
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -1;
  envScene.add(envGround);
  // The Sky shader's sun disc reaches ~7e5 luminance at high sun — beyond the
  // HalfFloat render-target max (65504). That overflows to +Inf in the PMREM
  // env map / composer buffer, which the bloom mip chain turns into NaN and a
  // fully black frame. Clamp radiance below the overflow point (4000 still
  // blooms hard); applies to both the visible sky and the env-map sky.
  // `scale` also dims the visible dome: at the exposure the product needs, the
  // Preetham sky's horizon haze otherwise burns out to white.
  function clampSkyRadiance(material: THREE.ShaderMaterial, scale = 1) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        `gl_FragColor = vec4( min( texColor * ${scale.toFixed(3)}, vec3( 4000.0 ) ), 1.0 );`
      );
    };
    material.needsUpdate = true;
  }
  clampSkyRadiance(sky.material, 0.55);
  clampSkyRadiance(envSky.material);

  let envRT: THREE.WebGLRenderTarget | null = null;
  let envTime = -1;
  function updateEnvironment(day = 1) {
    const u = envSky.material.uniforms;
    // Deliberately hazier + less saturated than the visible sky: the env map is
    // the scene's fill light, and a deep Rayleigh-blue dome tints every diffuse
    // surface cyan. Extra mie haze whitens it while reflections still read "sky".
    u.turbidity.value = Math.max(8, skyU.turbidity.value as number);
    u.rayleigh.value = (skyU.rayleigh.value as number) * 0.5;
    u.mieCoefficient.value = Math.max(0.008, skyU.mieCoefficient.value as number);
    u.mieDirectionalG.value = skyU.mieDirectionalG.value;
    (u.sunPosition.value as THREE.Vector3).copy(skyU.sunPosition.value as THREE.Vector3);
    // MeshBasicMaterial ignores lights, so fade the bounce plane with daylight
    envGroundMat.color.setHex(0x5e7c46).multiplyScalar(0.12 + day * 0.88);
    const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1100);
    scene.environment = rt.texture;
    envRT?.dispose();
    envRT = rt;
  }
  updateEnvironment();

  // --- daytime image-based lighting ---
  // A real partly-cloudy sky HDRI (CC0, Poly Haven) is the daytime environment:
  // clouds and a horizon give glass and powder coat believable reflections and
  // a natural ambient fill that the featureless procedural dome could not. The
  // procedural sky stays the visible backdrop and still drives sunset / night,
  // where applyTime swaps back to the sky-based PMREM (a midday HDRI would
  // clash with an orange sky). The HDRI is composited over the same green
  // bounce plane so light from below stays grass-coloured.
  let hdriEnv: THREE.Texture | null = null;
  let hdriEquirect: THREE.DataTexture | null = null; // kept for photo mode: the path tracer wants the equirect, not the PMREM
  let hdriSunAzimuth = 0; // atan2(z, x) of the HDRI's sun, so reflections track the sun light
  new HDRLoader().setDataType(THREE.FloatType).load('/hdri/sky_1k.hdr', tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const img = tex.image as { data: Float32Array; width: number; height: number };
    let best = -1, bi = 0;
    for (let i = 0, n = img.width * img.height; i < n; i++) {
      const l = img.data[i * 4] * 0.2126 + img.data[i * 4 + 1] * 0.7152 + img.data[i * 4 + 2] * 0.0722;
      if (l > best) { best = l; bi = i; }
    }
    hdriSunAzimuth = (((bi % img.width) + 0.5) / img.width - 0.5) * Math.PI * 2;
    const hdriScene = new THREE.Scene();
    hdriScene.background = tex;
    // Muted grass bounce: the real lawn is bright, but a saturated plane here
    // tints every vertical surface green.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshBasicMaterial({ color: 0x6d765f }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    hdriScene.add(ground);
    hdriEnv = pmrem.fromScene(hdriScene, 0.02, 0.1, 1100).texture;
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    hdriEquirect = tex;
    applyTime();
  }, undefined, () => { /* HDRI missing: the procedural sky environment stays */ });

  const sunLight = new THREE.DirectionalLight(0xfff2dc, 1.45);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 80;
  sunLight.shadow.camera.left = -13; sunLight.shadow.camera.right = 13; // refitted per product
  sunLight.shadow.camera.top = 13;  sunLight.shadow.camera.bottom = -13;
  sunLight.shadow.bias = -0.00015;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.radius = 1.5;
  scene.add(sunLight);
  // Shadow texels are a fixed budget: spend them on the product + patio
  // unless the tier can afford covering the whole garden (tree shadows).
  function fitShadowFrustum(W: number, D: number) {
    const half = profile.wideShadows ? 14 : Math.max(W, D) / 2 + 3.2;
    const c = sunLight.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.updateProjectionMatrix();
  }

  const moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
  moonLight.position.set(-8, 12, -6);
  scene.add(moonLight);

  // Near-neutral fill (a hint of cool sky / warm ground). The saturated blue
  // ambience comes from the sky env map; keeping the fills neutral acts like
  // a camera's white balance so product colours stay faithful.
  const hemi = new THREE.HemisphereLight(0xe3eaf0, 0x9a8c78, 0.45);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xfff4e6, 0.18);
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
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

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

  // --- PBR material sets (CC0: Poly Haven, ambientCG; see public/models/CREDITS.md) ---
  // Loaded on first use (a veranda never fetches brick) and applied on arrival.
  // Each set is colour + normal + roughness (+ AO). `tile` is the real-world
  // size in metres of one repeat, so applyPbr() keeps brick courses and plank
  // widths true to scale whatever the wall size.
  const texLoader = new THREE.TextureLoader();
  // Compressed textures: every map also ships as KTX2 (Basis ETC1S), which
  // transcodes to the GPU's native block format: a 1K map costs about 1 MB of
  // GPU memory instead of 5 MB and uploads without a decode. That is the
  // difference between comfortable and crashing on a phone. JPEG stays the
  // fallback for browsers without the transcoder or files that are missing.
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  function loadMap(base: string, srgb: boolean, onLoad: (t: THREE.Texture) => void, onError?: () => void) {
    const ready = (t: THREE.Texture) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(profile.anisotropy, renderer.capabilities.getMaxAnisotropy());
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      onLoad(t);
    };
    ktx2.load(`${base}.ktx2`, ready, undefined, () => texLoader.load(`${base}.jpg`, ready, undefined, onError));
  }
  type PbrMap = 'color' | 'normal' | 'rough' | 'ao';
  type PbrSet = { color?: THREE.Texture; normal?: THREE.Texture; rough?: THREE.Texture; ao?: THREE.Texture; ready: boolean; tile: number; onReady: Array<(s: PbrSet) => void> };
  const PBR_SETS: Record<string, { tile: number; ao?: boolean }> = {
    brick_yellow: { tile: 1.0, ao: true }, brick_red: { tile: 1.0, ao: true }, brick_mixed: { tile: 3.0, ao: true }, brick_grey: { tile: 1.0, ao: true },
    slate: { tile: 3.0, ao: true }, clay: { tile: 2.6, ao: true }, tile_grey: { tile: 1.5, ao: true },
    planks: { tile: 1.0 }, plaster: { tile: 1.0 }, bark: { tile: 1.0 }, moss: { tile: 0.7, ao: true },
  };
  const pbrSets = new Map<string, PbrSet>();
  let rebuildQueued = false;
  function scheduleRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; clearMaterialCache(); if (state) buildCanopy(); });
  }
  function pbrSet(name: string, onReady?: (s: PbrSet) => void): PbrSet {
    let set = pbrSets.get(name);
    if (set) {
      if (onReady) { if (set.ready) onReady(set); else set.onReady.push(onReady); }
      return set;
    }
    const def = PBR_SETS[name];
    set = { ready: false, tile: def.tile, onReady: onReady ? [onReady] : [] };
    pbrSets.set(name, set);
    const maps: PbrMap[] = def.ao ? ['color', 'normal', 'rough', 'ao'] : ['color', 'normal', 'rough'];
    let pending = maps.length;
    const done = () => {
      if (--pending) return;
      set!.ready = true;
      set!.onReady.forEach(fn => fn(set!));
      set!.onReady = [];
      scheduleRebuild();
    };
    for (const m of maps) {
      loadMap(`/textures/${name}_${m}`, m === 'color', t => { set![m] = t; done(); }, done);
    }
    return set;
  }
  // Clone a set's maps onto a material with the repeat fitted to a face of
  // w × h metres. Clones share the GPU upload (same Source), so this is cheap.
  function applyPbr(m: THREE.MeshStandardMaterial, set: PbrSet, w: number, h: number, normalScale = 1) {
    if (!set.ready) return;
    const rx = Math.max(0.05, w / set.tile), ry = Math.max(0.05, h / set.tile);
    const fit = (t?: THREE.Texture) => { if (!t) return null; const c = t.clone(); c.repeat.set(rx, ry); return c; };
    m.map = fit(set.color);
    m.normalMap = fit(set.normal);
    m.normalScale.set(normalScale, normalScale);
    m.roughnessMap = fit(set.rough);
    if (set.ao) { m.aoMap = fit(set.ao); m.aoMap!.channel = 0; m.aoMapIntensity = 0.7; }
    m.bumpMap = null;
    m.needsUpdate = true;
  }

  // --- static environment (lawn, hedges, trees, tufts) ---
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  const lawnMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0, color: 0xbcc9a8 });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lawnMat);
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
  // Hedges and tree canopies wear a dense moss / foliage set once it arrives;
  // the flat green stays as the first-paint fallback.
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3c5a30, roughness: 0.95 });
  pbrSet('moss', s => { applyPbr(hedgeMat, s, 26, 1.25, 0.9); hedgeMat.color.set(0xc2d1aa); hedgeMat.roughness = 1; });
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
  pbrSet('bark', s => { applyPbr(trunkMat, s, 1.2, 1.4, 1); trunkMat.color.set(0xffffff); });
  pbrSet('moss', s => {
    applyPbr(leafMat, s, 2.4, 1.6, 0.9);  leafMat.color.set(0xb3c79a);  leafMat.roughness = 1;
    applyPbr(leafMat2, s, 2.4, 1.6, 0.9); leafMat2.color.set(0x92aa7c); leafMat2.roughness = 1;
  });
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

  // --- grass blades (high tier) ---
  // Instanced blades in a band around the patio, thinning with distance until
  // the lawn texture takes over. Each blade is a tapered, slightly bent strip;
  // a world-space sway runs off a time uniform; per-instance colour breaks the
  // field up. Rebuilt only when the patio footprint or the tier changes. The
  // path tracer cannot carry per-instance colour, so photo mode hides them.
  let grass: THREE.InstancedMesh | null = null;
  let grassKey = '';
  const grassUniforms = { uTime: { value: 0 } };
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = shader => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          {
            float h = clamp( position.y / 0.24, 0.0, 1.0 );
            vec3 ip = instanceMatrix[3].xyz;
            float sway = sin( uTime * 1.6 + ip.x * 0.9 + ip.z * 0.7 ) * 0.6 + sin( uTime * 2.9 + ip.z * 2.1 - ip.x * 0.4 ) * 0.25;
            mvPosition.x += sway * 0.05 * h * h;
            mvPosition.z += sway * 0.015 * h * h;
          }
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const bladeGeo = (() => {
    const g = new THREE.PlaneGeometry(0.035, 0.24, 1, 4);
    g.translate(0, 0.12, 0); // root at y = 0
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / 0.24;
      p.setX(i, p.getX(i) * (1 - t * 0.85)); // taper to the tip
      p.setZ(i, t * t * 0.05);               // gentle lean
    }
    g.computeVertexNormals();
    return g;
  })();
  function buildGrass(padHalfX: number, padHalfZ: number) {
    const key = `${profile.grass ? 1 : 0}:${padHalfX.toFixed(2)}:${padHalfZ.toFixed(2)}`;
    if (key === grassKey) return;
    grassKey = key;
    if (grass) { envGroup.remove(grass); grass.dispose(); grass = null; }
    if (!profile.grass) return;
    const reach = 5.5;    // metres beyond the patio where blades fade into the lawn texture
    const N = 24000;
    const inst = new THREE.InstancedMesh(bladeGeo, grassMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const stones = Array.from({ length: 6 }, (_, i) => [0.3 + Math.sin(i * 0.7) * 0.5, 3.2 + i * 0.9] as const);
    let placed = 0, guard = 0;
    while (placed < N && guard++ < N * 5) {
      const x = (Math.random() - 0.5) * 2 * (padHalfX + reach);
      const z = (Math.random() - 0.5) * 2 * (padHalfZ + reach);
      if (Math.abs(x) < padHalfX + 0.04 && Math.abs(z) < padHalfZ + 0.04) continue;   // patio
      const dEdge = Math.max(Math.abs(x) - padHalfX, Math.abs(z) - padHalfZ, 0);
      if (Math.random() < dEdge / reach) continue;                                     // density fades with distance
      if (stones.some(([sx, sz]) => (x - sx) ** 2 + (z - sz) ** 2 < 0.42 * 0.42)) continue;
      const s = 0.7 + Math.random() * 0.7;
      e.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
      q.setFromEuler(e);
      m4.compose(v.set(x, 0, z), q, sc.set(s, s * (0.6 + Math.random() * 0.55), s));
      inst.setMatrixAt(placed, m4);
      c.setHSL(0.25 + Math.random() * 0.05, 0.4 + Math.random() * 0.2, 0.22 + Math.random() * 0.12);
      inst.setColorAt(placed, c);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    envGroup.add(inst);
    grass = inst;
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

  // --- real PBR ground textures (CC0, ambientcg.com) ---
  // Photo-based colour/normal/roughness maps upgrade the procedural canvas
  // textures once fetched. Until then (or if a fetch fails) the canvas versions
  // render, so first paint stays instant and offline dev still works.
  const pbrTex = (base: string, srgb: boolean, apply: (t: THREE.Texture) => void) => loadMap(base, srgb, apply);
  pbrTex('/textures/grass_color', true, t => { t.repeat.set(64, 64); lawnMat.map = t; lawnMat.color.set(0xe6ead9); lawnMat.needsUpdate = true; });
  pbrTex('/textures/grass_normal', false, t => { t.repeat.set(64, 64); lawnMat.normalMap = t; lawnMat.needsUpdate = true; });
  pbrTex('/textures/grass_rough', false, t => { t.repeat.set(64, 64); lawnMat.roughnessMap = t; lawnMat.needsUpdate = true; });

  // Paver repeat depends on the configured footprint — kept in sync by buildCanopy.
  const pavingMaps: THREE.Texture[] = [];
  function syncPavingRepeat() {
    if (!state) return;
    const rx = (state.length + 1.6) / 2.4, ry = (state.depth + 1.6) / 2.4;
    for (const t of pavingMaps) t.repeat.set(rx, ry);
  }
  pbrTex('/textures/paving_color', true, t => { pavingMaps.push(t); syncPavingRepeat(); padMat.map = t; padMat.needsUpdate = true; });
  pbrTex('/textures/paving_normal', false, t => { pavingMaps.push(t); syncPavingRepeat(); padMat.normalMap = t; padMat.needsUpdate = true; });
  pbrTex('/textures/paving_rough', false, t => { pavingMaps.push(t); syncPavingRepeat(); padMat.roughnessMap = t; padMat.needsUpdate = true; });

  // --- real furniture models (CC0, polyhaven.com) ---
  // Photoscanned glTF furniture replacing the box-built pieces. Each model
  // loads once into modelCache and is cloned into the scene per rebuild; until
  // it arrives (or if loading fails) buildFurniture builds the box fallback.
  const gltfLoader = new GLTFLoader();
  const modelCache = new Map<string, THREE.Object3D>();
  const MODEL_DEFS: Array<{ key: string; url: string }> = [
    { key: 'sofa', url: '/models/Sofa_01/Sofa_01_1k.gltf' },
    { key: 'coffeeTable', url: '/models/coffee_table_round_01/coffee_table_round_01_1k.gltf' },
    { key: 'outdoorSet', url: '/models/outdoor_table_chair_set_01/outdoor_table_chair_set_01_1k.gltf' },
    { key: 'plant', url: '/models/potted_plant_04/potted_plant_04_1k.gltf' },
    { key: 'car', url: '/models/car/car.glb' },   // CC0 (Kenney car kit); fitted to 4.4 m in buildCar
  ];
  for (const { key, url } of MODEL_DEFS) {
    gltfLoader.load(url, g => {
      const strip: THREE.Object3D[] = [];
      g.scene.traverse(o => {
        // photoscan base patches (e.g. potted_plant_04_ground) don't belong on the patio
        if (o.name.endsWith('_ground')) strip.push(o);
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      strip.forEach(o => o.parent?.remove(o));
      if (key === 'car') dressCar(g.scene);
      modelCache.set(key, g.scene);
      if (state) buildCanopy(); // swap the box fallback for the real model
    }, undefined, () => { /* fetch failed — box fallback stays */ });
  }

  // The car kit paints every part from one palette texture in toy-bright
  // colours. Rebuild that palette in muted tones (saturated cells become
  // anthracite paint, the light-blue glazing cells dark glass, greys stay) and
  // dress the body in clearcoat paint and the wheels in rubber, so the model
  // sits in the photoreal scene instead of looking like a toy.
  function dressCar(root: THREE.Object3D) {
    const found: { palette: THREE.Texture | null } = { palette: null };
    root.traverse(o => {
      const m = o as THREE.Mesh;
      const mat = m.isMesh ? (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial : null;
      if (mat?.map && !found.palette) found.palette = mat.map;
    });
    const palette = found.palette;
    let muted: THREE.Texture | null = null;
    const img = palette ? palette.image as (HTMLImageElement | ImageBitmap | undefined) : undefined;
    if (img && img.width) {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
        const sat = max > 0 ? (max - min) / max : 0;
        const light = (max + min) / 2;
        if (sat < 0.08) continue;                                   // greys, black, white: keep
        let hue = 0;
        if (max === r) hue = ((gg - b) / (max - min)) % 6; else if (max === gg) hue = (b - r) / (max - min) + 2; else hue = (r - gg) / (max - min) + 4;
        hue = (hue * 60 + 360) % 360;
        const glass = hue >= 190 && hue <= 250 && light > 0.5;      // the kit's pale-blue glazing cells
        if (!glass && sat < 0.25) continue;
        const [nr, ng, nb] = glass ? [52, 64, 76] : [86, 90, 96];
        d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
      }
      g.putImageData(px, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.flipY = palette!.flipY;
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      muted = t;
    }
    const paint = new THREE.MeshPhysicalMaterial({ map: muted, color: 0xffffff, metalness: 0.55, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.07 });
    const rubber = new THREE.MeshStandardMaterial({ map: muted, color: 0xffffff, metalness: 0.1, roughness: 0.9 });
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = /wheel|tyre|tire/i.test(o.name + '/' + (o.parent?.name ?? '')) ? rubber : paint;
    });
  }
  function placeModel(key: string, x: number, z: number, rotY = 0, scale = 1): boolean {
    const src = modelCache.get(key);
    if (!src) return false;
    const inst = src.clone(true);
    inst.userData.sharedAssets = true; // geometry/materials owned by modelCache — see disposeGroup
    inst.position.set(x, 0, z);
    inst.rotation.y = rotY;
    if (scale !== 1) inst.scale.setScalar(scale);
    canopyGroup.add(inst);
    return true;
  }

  // --- mutable state held across rebuilds ---
  let state: ConfigState | null = null;
  let productScene: string | null = null;
  let lastBuildAt = 0; // the quality probe ignores windows that contain a rebuild
  let buildCount = 0;
  let view: SceneView = 'iso';
  let timeOfDay = 13;
  let spin = false;
  let roofOpen = false;

  let louvreSlats: THREE.Mesh[] = [];
  // Retractable awning cloth — the render loop scales it towards the cassette.
  let awning: { cloth: THREE.Group; bar: THREE.Mesh; backZ: number; span: number; yBack: number; yFront: number; ext: number } | null = null;
  let ledMeshes: THREE.Mesh[] = [];
  let glowLights: THREE.PointLight[] = [];
  let heaterEmitters: THREE.Mesh[] = [];
  let bollardLights: THREE.PointLight[] = [];

  const matCache = new Map<string, THREE.Material>();

  // Aluminium profiles get a small edge radius: the highlight running along a
  // rounded edge is what separates "extrusion" from "box". Segments stay at 2,
  // so a rounded profile is ~300 triangles.
  const PROFILE_RADIUS = 0.008;
  function PB(w: number, h: number, d: number, r = PROFILE_RADIUS): THREE.BufferGeometry {
    const rr = Math.min(r, Math.min(w, h, d) * 0.3);
    return new RoundedBoxGeometry(w, h, d, 2, rr);
  }

  // Louvre blade: an aerofoil section (flatter underside, cambered top)
  // extruded along the blade, so it reads as a rotating blade, not a plank.
  // `alongX` lays the blade along X (slats across the depth); otherwise along Z.
  function louvreGeo(across: number, thick: number, length: number, alongX: boolean): THREE.BufferGeometry {
    const a = across / 2, t = thick / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-a, 0);
    shape.quadraticCurveTo(0, 2.4 * t, a, 0);
    shape.quadraticCurveTo(0, -1.2 * t, -a, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -length / 2);
    if (alongX) geo.rotateY(Math.PI / 2);
    return geo;
  }

  // Powder coat: a dielectric paint film with a faint gloss layer. No
  // metalness; that only darkened the diffuse and read as dull metal.
  function coatMaterial(key: string, hex: string, roughness: number, darken = 1): THREE.MeshPhysicalMaterial {
    const cached = matCache.get(key) as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(hex).multiplyScalar(darken),
      roughness, metalness: 0,
      clearcoat: profile.clearcoat ? 0.35 : 0, clearcoatRoughness: 0.32,
    });
    matCache.set(key, m);
    return m;
  }
  function frameMaterial(): THREE.MeshStandardMaterial {
    const c = FRAME_COLORS[state!.frameColor as keyof typeof FRAME_COLORS];
    return coatMaterial(`frame-${state!.frameColor}`, c.hex, c.roughness);
  }
  function slatMaterial(): THREE.MeshStandardMaterial {
    const c = FRAME_COLORS[state!.slatColor as keyof typeof FRAME_COLORS];
    return coatMaterial(`slat-${state!.slatColor}`, c.hex, c.roughness);
  }

  // Glazing. High tier: physically refractive (the transmission pass renders
  // the scene once more behind glazing). Other tiers: a thin reflective
  // transparent pane; sky reflections are what sell glass, and they cost
  // nothing extra. Panes are boxes, so front faces suffice from either side.
  type Glazing = { tint: number; transmission: number; roughness: number; opacity: number; env: number; attenuation?: number };
  function glazing(key: string, o: Glazing): THREE.MeshPhysicalMaterial {
    const cached = matCache.get(key) as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const m = profile.transmission
      ? new THREE.MeshPhysicalMaterial({
          color: o.tint, transmission: o.transmission, roughness: o.roughness, metalness: 0, ior: 1.52,
          thickness: 0.02, attenuationColor: new THREE.Color(o.attenuation ?? 0xffffff), attenuationDistance: 0.6,
          envMapIntensity: o.env, side: THREE.FrontSide,
        })
      : new THREE.MeshPhysicalMaterial({
          color: o.tint, transparent: true, opacity: o.opacity, roughness: o.roughness, metalness: 0,
          envMapIntensity: o.env, depthWrite: false, side: THREE.FrontSide,
        });
    matCache.set(key, m);
    return m;
  }
  function glassMaterial(): THREE.MeshPhysicalMaterial {
    return glazing('glass', { tint: 0xffffff, transmission: 1, roughness: 0.03, opacity: 0.22, env: 0.8, attenuation: 0xdaf3ec });
  }
  function tintedGlassMaterial(): THREE.MeshPhysicalMaterial {
    return glazing('tintedGlass', { tint: 0x5d7079, transmission: 0.6, roughness: 0.05, opacity: 0.62, env: 0.9 });
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
  function fabricMaterial(): THREE.MeshStandardMaterial {
    const cached = matCache.get('fabric') as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: 0xf2e5cf, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    matCache.set('fabric', m);
    return m;
  }
  function screenRoloMaterial(): THREE.MeshStandardMaterial {
    const cached = matCache.get('screenRolo') as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color: 0x504a42, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.86 });
    matCache.set('screenRolo', m);
    return m;
  }
  // A material from a PBR set, fitted to a w × h metre face and cached per
  // size. `tint` multiplies the (near-neutral) colour map; until the set has
  // loaded the procedural canvas texture stands in so first paint is instant.
  type SetOpts = { roughness?: number; normalScale?: number; fallback?: { map: THREE.Texture | null; color: number; bump?: number } };
  function setMaterial(key: string, setName: string, tint: number, w: number, h: number, o: SetOpts = {}): THREE.MeshStandardMaterial {
    const k = `${key}-${w.toFixed(2)}x${h.toFixed(2)}`;
    const cached = matCache.get(k) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const set = pbrSet(setName);
    const m = new THREE.MeshStandardMaterial({ color: tint, roughness: o.roughness ?? 1, metalness: 0 });
    if (set.ready) {
      applyPbr(m, set, w, h, o.normalScale ?? 1);
    } else if (o.fallback) {
      m.color.set(o.fallback.color);
      if (o.fallback.map) {
        m.map = o.fallback.map.clone();
        m.map.repeat.set(Math.max(0.25, w / 1.4), Math.max(0.25, h / 1.2));
        m.bumpMap = m.map; m.bumpScale = o.fallback.bump ?? 0.3;
      }
    }
    matCache.set(k, m);
    return m;
  }
  function plankMaterial(key: string, tint: number, w: number, h: number, roughness = 0.9): THREE.MeshStandardMaterial {
    return setMaterial(key, 'planks', tint, w, h, { roughness, normalScale: 0.8, fallback: { map: woodTex, color: tint } });
  }
  function claddingMaterial(w = 1, h = 1): THREE.MeshStandardMaterial | null {
    const k = state!.cladding;
    if (k === 'none') return null;
    const tint: Record<string, number> = { timber: 0xe3bd8c, cedar: 0xb47a55, composite: 0x8a8177, pvc: 0xf4f2ee };
    return plankMaterial(`clad-${k}`, tint[k] ?? 0xddd3c2, w, h, k === 'pvc' ? 0.6 : 0.9);
  }
  function flooringMaterial(w = 1, h = 1): THREE.MeshStandardMaterial | null {
    const k = state!.flooring;
    if (k === 'none') return null;
    if (k === 'laminate') return plankMaterial('floor-laminate', 0xdcb98f, w, h, 0.55);
    if (k === 'wood')     return plankMaterial('floor-wood', 0xb98c5e, w, h, 0.6);
    if (k === 'tile')     return setMaterial('floor-tile', 'plaster', 0xe9e3d9, w, h, { roughness: 0.35, normalScale: 0.25, fallback: { map: plasterTex, color: 0xe0d9cb } });
    if (k === 'concrete') return setMaterial('floor-concrete', 'plaster', 0xa6a39e, w, h, { roughness: 0.55, normalScale: 0.5, fallback: { map: plasterTex, color: 0x9c9a96 } });
    return null;
  }
  function polyMaterial(): THREE.MeshPhysicalMaterial {
    return glazing('poly', { tint: 0xf1f6f7, transmission: 0.55, roughness: 0.38, opacity: 0.7, env: 0.5 });
  }
  // Brick: photo sets in their natural colour (a yellow stock, a red
  // engineering brick, a mixed reclaimed wall) with a light tint; painted
  // brick uses a desaturated copy tinted by the catalog colour.
  function brickMaterial(brickKey: string, w = 1, h = 1): THREE.MeshStandardMaterial {
    const conf = BRICK[brickKey as keyof typeof BRICK];
    const set = brickKey === 'red-engineering' ? 'brick_red' : brickKey === 'reclaimed' ? 'brick_mixed' : brickKey === 'painted-white' ? 'brick_grey' : 'brick_yellow';
    const tint: Record<string, number> = { 'london-stock': 0xe8dfcf, buff: 0xf3ecdb, 'painted-white': 0xece6dc, 'red-engineering': 0xe2d2ca, reclaimed: 0xe6dbcf };
    return setMaterial(`brick-${brickKey}`, set, tint[brickKey] ?? 0xffffff, w, h, {
      roughness: 1, normalScale: 1,
      fallback: { map: brickTex, color: new THREE.Color(conf?.hex ?? '#9c6b50').getHex(), bump: 0.5 },
    });
  }
  function renderMaterial(renderKey: string, w = 1, h = 1): THREE.MeshStandardMaterial {
    const conf = RENDER[renderKey as keyof typeof RENDER];
    const hex = new THREE.Color(conf?.hex ?? '#f0ede4').getHex();
    return setMaterial(`render-${renderKey}`, 'plaster', hex, w, h, { roughness: 0.95, normalScale: 0.7, fallback: { map: renderTex, color: hex, bump: 0.15 } });
  }
  function tileMaterial(tileKey: string, w = 1, h = 1): THREE.MeshStandardMaterial {
    const conf = ROOF_TILE[tileKey as keyof typeof ROOF_TILE];
    const hex = new THREE.Color(conf?.hex ?? '#54595e').getHex();
    const set = tileKey.startsWith('slate') ? 'slate' : tileKey === 'concrete-grey' ? 'tile_grey' : 'clay';
    const tint: Record<string, number> = { 'slate-natural': 0x4c525a, 'slate-grey': 0x737980, terracotta: 0xf2e1d6, 'clay-red': 0xcfa090, 'concrete-grey': 0xb4b3b0 };
    return setMaterial(`tile-${tileKey}`, set, tint[tileKey] ?? hex, w, h, { roughness: 0.9, normalScale: 1, fallback: { map: tileTex, color: hex, bump: 0.35 } });
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
      // Cloned model subtrees share geometry/materials with modelCache — just detach.
      if (c.userData.sharedAssets) continue;
      const mesh = c as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if ((c as THREE.Group).children?.length) disposeGroup(c as THREE.Group);
    }
  }

  // --- canopy build ---
  function buildCanopy() {
    buildCanopyInner();
    buildGrass(pad.scale.x / 2, pad.scale.y / 2); // every builder sizes the patio pad
  }
  function buildCanopyInner() {
    if (!state) return;
    lastBuildAt = performance.now();
    buildCount++;
    disposeGroup(canopyGroup);
    louvreSlats = []; awning = null; ledMeshes = []; heaterEmitters = []; bollardLights = [];
    glowLights.forEach(l => l.parent?.remove(l)); glowLights = [];

    const W = state.length, D = state.depth, H = state.height;
    const fm = frameMaterial();
    fitShadowFrustum(W, D);

    pad.scale.set(W + 1.6, D + 1.6, 1);
    paverTex.repeat.set((W + 1.6) / 2.4, (D + 1.6) / 2.4);
    syncPavingRepeat();
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
      const m = new THREE.Mesh(PB(post, H, post), fm);
      m.position.set(px, H / 2, pz);
      m.castShadow = true; m.receiveShadow = true;
      canopyGroup.add(m);
      const foot = new THREE.Mesh(PB(post * 2, 0.03, post * 2), fm);
      foot.position.set(px, 0.015, pz);
      foot.castShadow = true;
      canopyGroup.add(foot);
    }

    // Perimeter beams
    const beamH = 0.18, beamY = H - beamH / 2 + 0.01;
    const beams: [THREE.BufferGeometry, [number, number, number]][] = [
      [PB(W, beamH, post), [0, beamY,  D / 2 - post / 2]],
      [PB(W, beamH, post), [0, beamY, -D / 2 + post / 2]],
      [PB(post, beamH, D - 2 * post), [-W / 2 + post / 2, beamY, 0]],
      [PB(post, beamH, D - 2 * post), [ W / 2 - post / 2, beamY, 0]],
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

    const floorMat = flooringMaterial(W - 0.08, D - 0.08);
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

    // A sloped lean-to roof leaves an open triangular wedge on each side, between the
    // tilted roof and the horizontal side beam — it reads as unfinished. Close each
    // side with a glazed gable panel (matching the roof) framed by a rake beam that
    // follows the slope, so the sides look enclosed. No-op on flat roofs.
    const addSlopedGables = (infillMat: THREE.Material) => {
      if (Math.abs(slopeAngle) < 0.02) return;
      const postW = 0.12;
      const tanS = Math.tan(slopeAngle);
      const centerY = H + 0.03 + lift;
      const z0 = -D / 2 + postW / 2;   // back edge (high side of the slope)
      const z1 =  D / 2 - postW / 2;   // front edge (low side of the slope)
      const yb = H + 0.01;             // top of the horizontal side beam
      // glass underside height at a given depth, tucked just under the roof
      const yGlass = (z: number) => centerY - z * tanS - 0.02;
      const yTopBack = yGlass(z0);
      const yTopFront = Math.max(yb + 0.005, yGlass(z1));
      for (const sx of [-(W / 2 - postW / 2), W / 2 - postW / 2]) {
        // Trapezoidal infill drawn in the (depth, height) plane, then rotated into
        // the side plane at x = sx and given a little thickness so it reads as glazing.
        const shape = new THREE.Shape();
        shape.moveTo(z0, yb);
        shape.lineTo(z1, yb);
        shape.lineTo(z1, yTopFront);
        shape.lineTo(z0, yTopBack);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
        geo.rotateY(-Math.PI / 2);
        geo.translate(sx + 0.015, 0, 0);
        const panel = new THREE.Mesh(geo, infillMat);
        panel.castShadow = true; panel.receiveShadow = true;
        canopyGroup.add(panel);

        // Rake beam along the sloped top edge — same treatment as the roof
        // mullions (tilt by slopeAngle, sit at mullion height), just at the
        // outer side edge so it lies along the glass instead of over it.
        const dz = z1 - z0, dy = yTopFront - yTopBack;
        const rake = new THREE.Mesh(PB(0.06, 0.09, Math.hypot(dz, dy)), fm);
        rake.position.set(sx, H + 0.06 + lift, 0);
        rake.rotation.x = slopeAngle;
        rake.castShadow = true; rake.receiveShadow = true;
        canopyGroup.add(rake);
      }
    };

    if (state!.roof.startsWith('louvred')) {
      const slatThick = 0.05, slatW = 0.3, gap = 0.045;
      const isolThick = state!.slatIsolation ? slatThick * 1.5 : slatThick;
      if (state!.slatDirection === 'length') {
        const num = Math.floor(Dr / (slatW + gap));
        const cellD = Dr / num;
        for (let i = 0; i < num; i++) {
          const z = -Dr / 2 + i * cellD + cellD / 2;
          const m = new THREE.Mesh(louvreGeo(cellD - gap, isolThick, Wr - 0.22, true), sm);
          m.position.set(0, H + 0.02 + isolThick * 0.3, z);
          m.castShadow = true; m.receiveShadow = true;
          m.userData.axis = 'x';
          canopyGroup.add(m);
          if (state!.roof === 'louvred-retract') louvreSlats.push(m);
          else m.rotation.x = state!.slatRotation === 'right' ? 0.28 : -0.28;
        }
      } else {
        const num = Math.floor(Wr / (slatW + gap));
        const cellW = Wr / num;
        for (let i = 0; i < num; i++) {
          const x = -Wr / 2 + i * cellW + cellW / 2;
          const m = new THREE.Mesh(louvreGeo(cellW - gap, isolThick, Dr - 0.22, false), sm);
          m.position.set(x, H + 0.02 + isolThick * 0.3, 0);
          m.castShadow = true; m.receiveShadow = true;
          m.userData.axis = 'z';
          canopyGroup.add(m);
          if (state!.roof === 'louvred-retract') louvreSlats.push(m);
          else m.rotation.z = state!.slatRotation === 'right' ? 0.28 : -0.28;
        }
      }
    } else if (state!.roof.startsWith('fabric')) {
      // Both fabric roofs live in one tilting group so a configured angle
      // moves cloth and hardware together (same pattern as the solid roof).
      const fabricMat = fabricMaterial();
      const roofGroup = new THREE.Group();
      roofGroup.position.set(0, H + lift, 0);
      if (slopeAngle) roofGroup.rotation.x = slopeAngle;
      canopyGroup.add(roofGroup);

      if (state!.roof === 'fabric-retract') {
        // Retractable awning: cassette on the back beam, cloth running forward
        // in the side tracks with a gentle fall onto a front profile bar.
        const cassette = new THREE.Mesh(PB(Wr + 0.08, 0.18, 0.24), fm);
        cassette.position.set(0, 0.11, -Dr / 2 + 0.1);
        cassette.castShadow = true;
        roofGroup.add(cassette);

        const backZ = -Dr / 2 + 0.22, span = Dr - 0.28, clothW = Wr - 0.16;
        const yBack = 0.17, yFront = 0.05;
        // Cloth group origin sits at the cassette mouth so the render loop can
        // retract the awning by scaling this group towards the cassette.
        const clothGroup = new THREE.Group();
        clothGroup.position.set(0, 0, backZ);
        roofGroup.add(clothGroup);

        const geo = new THREE.PlaneGeometry(clothW, span, 8, 48);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0, span / 2); // back edge at local z=0, the cassette mouth
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const t = pos.getZ(i) / span; // 0 cassette → 1 front bar
          const ripple = 0.02 * Math.sin(t * Math.PI * 9) * Math.sin(t * Math.PI);
          pos.setY(i, yBack + (yFront - yBack) * t + ripple);
        }
        geo.computeVertexNormals();
        // receiveShadow stays off: the rippled cloth self-shadows into acne bands
        const cloth = new THREE.Mesh(geo, fabricMat);
        cloth.castShadow = true;
        clothGroup.add(cloth);

        // Transverse support tubes the cloth rides on — inside clothGroup so
        // they gather at the cassette when the awning retracts.
        for (const t of [0.25, 0.5, 0.75]) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, clothW, 10), fm);
          tube.rotation.z = Math.PI / 2;
          tube.position.set(0, yBack + (yFront - yBack) * t - 0.035, span * t);
          tube.castShadow = true;
          clothGroup.add(tube);
        }

        // Front profile bar + valance stay outside the scaled group so they
        // keep their shape — the render loop docks them against the cassette.
        const bar = new THREE.Mesh(PB(clothW + 0.08, 0.07, 0.09), fm);
        bar.position.set(0, yFront, backZ + span);
        bar.castShadow = true;
        roofGroup.add(bar);
        const valance = new THREE.Mesh(new THREE.PlaneGeometry(clothW + 0.04, 0.14), fabricMat);
        valance.position.set(0, -0.1, 0.02);
        valance.castShadow = true;
        bar.add(valance);

        awning = { cloth: clothGroup, bar, backZ, span, yBack, yFront, ext: 1 };
      } else {
        // Fixed canopy: cloth tensioned over cross rafters inside the beam
        // perimeter, sagging into each bay — the dark frame stays visible
        // around the cream fabric so it doesn't read as a solid deck.
        // The cloth stays clear of the beam tops — draping it over them makes
        // the beam corners cut through the coarse mesh and show as artifacts.
        const clothW = Wr - 0.14, clothD = Dr - 0.14;
        const rafters = Math.max(2, Math.round(Wr / 1.1));
        for (let i = 1; i < rafters; i++) {
          const x = -clothW / 2 + (clothW * i) / rafters;
          const r = new THREE.Mesh(PB(0.05, 0.07, Dr - 0.1), fm);
          r.position.set(x, 0, 0);
          r.castShadow = true;
          roofGroup.add(r);
        }
        const geo = new THREE.PlaneGeometry(clothW, clothD, 64, 24);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const u = (pos.getX(i) / clothW + 0.5) * rafters; // bay coordinate: whole numbers sit on rafters
          const tz = pos.getZ(i) / clothD + 0.5;
          const sag = 0.08 * Math.abs(Math.sin(u * Math.PI)) * Math.sqrt(Math.max(0, Math.sin(tz * Math.PI)));
          pos.setY(i, 0.05 - sag);
        }
        geo.computeVertexNormals();
        // receiveShadow stays off: the sagging cloth self-shadows into acne bands
        const cloth = new THREE.Mesh(geo, fabricMat);
        cloth.castShadow = true;
        roofGroup.add(cloth);
      }
    } else if (state!.roof.startsWith('glass')) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(Wr - 0.04, 0.05, Dr - 0.04), glassMaterial());
      roof.position.set(0, H + 0.03 + lift, 0);
      if (slopeAngle) roof.rotation.x = slopeAngle;
      roof.castShadow = true;
      canopyGroup.add(roof);
      const cols = Math.max(2, Math.round(Wr / 1.3));
      for (let i = 1; i < cols; i++) {
        const x = -Wr / 2 + Wr * i / cols;
        const mul = new THREE.Mesh(PB(0.05, 0.09, Dr - 0.04), fm);
        mul.position.set(x, H + 0.06 + lift, 0);
        if (slopeAngle) mul.rotation.x = slopeAngle;
        mul.castShadow = true;
        canopyGroup.add(mul);
      }
      addSlopedGables(glassMaterial());
    } else if (state!.roof === 'solid-alu') {
      // Solid insulated aluminium deck (Premium Carport) — opaque roof on the
      // pergola frame. Deck + fascia + rafters live in one group so the whole
      // roof tilts together when an angle is configured.
      let solidMat = matCache.get('solidRoof') as THREE.MeshStandardMaterial | undefined;
      if (!solidMat) {
        const c = FRAME_COLORS[state!.frameColor as keyof typeof FRAME_COLORS];
        solidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.hex).multiplyScalar(0.92), roughness: 0.4, metalness: 0.55 });
        matCache.set('solidRoof', solidMat);
      }
      const roofGroup = new THREE.Group();
      roofGroup.position.set(0, H + 0.06 + lift, 0);
      if (slopeAngle) roofGroup.rotation.x = slopeAngle;
      canopyGroup.add(roofGroup);
      const deck = new THREE.Mesh(PB(Wr - 0.02, 0.08, Dr - 0.02), solidMat);
      deck.castShadow = true; deck.receiveShadow = true;
      roofGroup.add(deck);
      // Fascia trim around the deck edge
      const fasciaParts: [number, number, number, number][] = [
        [Wr + 0.06, 0.06, 0,  Dr / 2 + 0.02],
        [Wr + 0.06, 0.06, 0, -Dr / 2 - 0.02],
        [0.06, Dr + 0.06, -Wr / 2 - 0.02, 0],
        [0.06, Dr + 0.06,  Wr / 2 + 0.02, 0],
      ];
      for (const [w, d, x, z] of fasciaParts) {
        const f = new THREE.Mesh(PB(w, 0.14, d), fm);
        f.position.set(x, 0, z);
        f.castShadow = true;
        roofGroup.add(f);
      }
      // Rafters under the deck — keeps the pergola character from below.
      const rafters = Math.max(2, Math.round(Wr / 1.2));
      for (let i = 1; i < rafters; i++) {
        const x = -Wr / 2 + (Wr * i) / rafters;
        const r = new THREE.Mesh(PB(0.05, 0.07, Dr - 0.12), fm);
        r.position.set(x, -0.075, 0);
        r.castShadow = true;
        roofGroup.add(r);
      }
      addSlopedGables(solidMat);
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
      addSlopedGables(polyMaterial());
    }

    // Rainwater goods and flashing: the details that make a drawing a product.
    // A sloped roof drains to the front edge: half-round gutter along it and a
    // downpipe on the front-right post. A wall-mounted roof meets the house
    // under a flashing strip rather than floating against the render.
    const isFabric = state!.roof.startsWith('fabric');
    if (Math.abs(slopeAngle) > 0.02 && !isFabric && !state!.roof.startsWith('louvred')) {
      const gutterY = H - 0.03;
      const gutterZ = D / 2 + overhang + 0.06;
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, Wr + 0.1, 14), fm);
      gutter.rotation.z = Math.PI / 2;
      gutter.position.set(0, gutterY, gutterZ);
      gutter.castShadow = true;
      canopyGroup.add(gutter);
      for (const z of [-Wr / 2 + 0.3, Wr / 2 - 0.3]) {
        const bracket = new THREE.Mesh(PB(0.03, 0.06, 0.1), fm);
        bracket.position.set(z, gutterY + 0.02, gutterZ - 0.04);
        canopyGroup.add(bracket);
      }
      const pipeX = W / 2 + 0.03, pipeZ = D / 2 - 0.03;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, gutterY - 0.08, 10), fm);
      pipe.position.set(pipeX, (gutterY - 0.08) / 2, pipeZ);
      pipe.castShadow = true;
      canopyGroup.add(pipe);
      const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, gutterZ - pipeZ, 10), fm);
      outlet.rotation.x = Math.PI / 2;
      outlet.position.set(pipeX, gutterY - 0.08, (gutterZ + pipeZ) / 2);
      canopyGroup.add(outlet);
    }
    if (state!.structure === 'wallmounted' && !isFabric) {
      const backEdgeY = H + 0.03 + lift + Math.tan(slopeAngle) * Dr / 2;
      const flashing = new THREE.Mesh(PB(Wr + 0.12, 0.16, 0.025), fm);
      flashing.position.set(0, backEdgeY + 0.1, -D / 2 - 0.005);
      flashing.castShadow = true;
      canopyGroup.add(flashing);
      const lip = new THREE.Mesh(PB(Wr + 0.12, 0.025, 0.09), fm);
      lip.position.set(0, backEdgeY + 0.03, -D / 2 + 0.035);
      canopyGroup.add(lip);
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
      const railG = PB(panelW, 0.07, 0.05);
      const rail = new THREE.Mesh(railG, fm); rail.position.y = 0.04; group.add(rail);
      const rail2 = new THREE.Mesh(railG, fm); rail2.position.y = wallH + 0.02; group.add(rail2);
      const divs = t === 'sliding' ? 4 : 2;
      for (let i = 0; i <= divs; i++) {
        const xOff = -panelW / 2 + panelW * i / divs;
        const m = new THREE.Mesh(PB(0.05, wallH, 0.07), fm);
        m.position.set(xOff, wallH / 2 + 0.02, 0);
        group.add(m);
      }
      if (t === 'sliding') {
        const handle = new THREE.Mesh(PB(0.04, 0.18, 0.06), fm);
        handle.position.set(-panelW / 8, wallH * 0.5, 0.05);
        group.add(handle);
      }
    } else if (t === 'alu') {
      const panel = new THREE.Mesh(PB(panelW, wallH, 0.05), fm);
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
      const cas = new THREE.Mesh(PB(panelW + 0.08, 0.12, 0.12), fm);
      cas.position.y = wallH + 0.02;
      group.add(cas);
      for (const sx of [-panelW / 2, panelW / 2]) {
        const r = new THREE.Mesh(PB(0.05, wallH, 0.08), fm);
        r.position.set(sx, wallH / 2 + 0.02, 0);
        group.add(r);
      }
    } else if (t === 'louvre' || t === 'metal') {
      const slatMat = t === 'metal' ? metalLamellaMaterial() : fm;
      const railG = PB(panelW, 0.07, 0.07);
      const rail = new THREE.Mesh(railG, fm); rail.position.y = 0.04; group.add(rail);
      const rail2 = new THREE.Mesh(railG, fm); rail2.position.y = wallH + 0.02; group.add(rail2);
      for (const sx of [-panelW / 2, panelW / 2]) {
        const r = new THREE.Mesh(PB(0.05, wallH, 0.07), fm);
        r.position.set(sx, wallH / 2 + 0.02, 0);
        group.add(r);
      }
      const slatTh = t === 'metal' ? 0.04 : 0.06;
      const slatGap = t === 'metal' ? 0.025 : 0.05;
      const inner = wallH - 0.2;
      const slats = Math.floor(inner / (slatTh + slatGap));
      for (let i = 0; i < slats; i++) {
        const slat = new THREE.Mesh(PB(panelW - 0.08, slatTh, 0.05), slatMat);
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
      const m = new THREE.Mesh(geo, brickMaterial(brickKey, s.w, dwarfHeight));
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
  function extensionWallMaterial(kind: 'brick' | 'render' | 'cladding', finish: string, w = 1, h = 1): THREE.MeshStandardMaterial {
    if (kind === 'brick')  return brickMaterial(finish, w, h);
    if (kind === 'render') return renderMaterial(finish, w, h);
    const tint: Record<string, number> = { timber: 0xe3bd8c, cedar: 0xb47a55, composite: 0x8a8177, pvc: 0xf4f2ee };
    return plankMaterial(`ext-clad-${finish}`, tint[finish] ?? 0xddd3c2, w, h, finish === 'pvc' ? 0.6 : 0.9);
  }

  // Extension scene — masonry walls per elevation, pitched roof, optional
  // lantern + upper storey. Stands in for a full architectural build.
  // ---- door / window opening assemblies --------------------------------
  // OPENING_PRESET options are priced and configurable in the panel but were
  // never rendered — customers picked "French doors" and saw nothing change.
  // Each preset is a set of glazed units (doors/windows). The SAME layout
  // drives both the visible frame assembly and the wall builders, which cut
  // real apertures around the units — a door must never have brickwork,
  // dwarf wall or glazing running through it.
  // Local coords: origin at wall centre on the floor, x along wall, +z outward.
  type OpeningUnit = { w: number; h: number; cx: number; sill: number; leaves: number };

  function openingLayout(preset: string, wallW: number, wallH: number): OpeningUnit[] {
    const doorH = Math.min(2.05, wallH - 0.2);
    const usable = Math.max(1.2, wallW - 0.5);
    const u: OpeningUnit[] = [];
    if (preset === 'bifold-full') {
      const w = Math.max(1.6, usable);
      u.push({ w, h: doorH, cx: 0, sill: 0, leaves: Math.max(3, Math.round(w / 0.8)) });
    } else if (preset === 'french-pair') {
      const w = Math.min(3.4, usable);
      u.push({ w: w / 2 - 0.02, h: doorH, cx: -w / 4, sill: 0, leaves: 2 });
      u.push({ w: w / 2 - 0.02, h: doorH, cx:  w / 4, sill: 0, leaves: 2 });
    } else if (preset === 'sliders-side-window') {
      const sw = Math.min(2.6, usable * 0.62);
      const sx = -usable / 2 + sw / 2;
      u.push({ w: sw, h: doorH, cx: sx, sill: 0, leaves: 3 });
      const ww = Math.max(0.7, Math.min(1.2, usable - sw - 0.15));
      u.push({ w: ww, h: 1.1, cx: sx + sw / 2 + 0.12 + ww / 2, sill: 0.9, leaves: 1 });
    } else if (preset === 'single-french-windows') {
      const dw = Math.min(1.7, usable * 0.5);
      u.push({ w: dw, h: doorH, cx: 0, sill: 0, leaves: 2 });
      const ww = Math.min(1.0, (usable - dw) / 2 - 0.15);
      if (ww > 0.4) {
        const wx = dw / 2 + 0.12 + ww / 2;
        u.push({ w: ww, h: 1.1, cx: -wx, sill: 0.9, leaves: 1 });
        u.push({ w: ww, h: 1.1, cx:  wx, sill: 0.9, leaves: 1 });
      }
    } else if (preset === 'window-large') {
      u.push({ w: Math.min(2.2, usable), h: 1.4, cx: 0, sill: 0.8, leaves: 2 });
    } else if (preset === 'window-medium') {
      u.push({ w: Math.min(1.2, usable), h: 1.1, cx: 0, sill: 0.9, leaves: 1 });
    } else if (preset === 'window-small') {
      u.push({ w: 0.7, h: 0.8, cx: 0, sill: 1.1, leaves: 1 });
    }
    return u;
  }

  // Complement of the units' x-ranges along a wall run: the kept [x0, x1]
  // intervals of [-len/2, len/2] once each aperture (± margin) is cut out.
  function cutIntervals(len: number, apertures: Array<{ cx: number; w: number }>, margin = 0.04): Array<[number, number]> {
    const cuts = apertures
      .map(a => [a.cx - a.w / 2 - margin, a.cx + a.w / 2 + margin] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    const kept: Array<[number, number]> = [];
    let x = -len / 2;
    for (const [c0, c1] of cuts) {
      if (c0 > x + 0.02) kept.push([x, Math.min(c0, len / 2)]);
      x = Math.max(x, c1);
    }
    if (x < len / 2 - 0.02) kept.push([x, len / 2]);
    return kept;
  }

  function buildOpeningAssembly(units: OpeningUnit[], glassMat: THREE.Material): THREE.Group | null {
    if (!units.length) return null;
    const fm = frameMaterial();
    const g = new THREE.Group();

    const bar = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(PB(Math.abs(w), Math.abs(h), 0.07), fm);
      m.position.set(x, y, 0.03);
      m.castShadow = true;
      g.add(m);
    };
    for (const un of units) {
      const { w, h, cx, sill, leaves } = un;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.05, h - 0.05, 0.02), glassMat);
      pane.position.set(cx, sill + h / 2, 0.015);
      g.add(pane);
      bar(w, 0.06, cx, sill + 0.03);
      bar(w, 0.06, cx, sill + h - 0.03);
      bar(0.06, h, cx - w / 2 + 0.03, sill + h / 2);
      bar(0.06, h, cx + w / 2 - 0.03, sill + h / 2);
      for (let i = 1; i < leaves; i++) bar(0.045, h - 0.08, cx - w / 2 + (w * i) / leaves, sill + h / 2);
      if (sill === 0 && h > 1.6) { // it's a door — handle at the centre stile
        const handle = new THREE.Mesh(PB(0.025, 0.14, 0.035), fm);
        handle.position.set(cx - 0.09, 1.02, 0.06);
        g.add(handle);
      }
    }
    return g;
  }

  // Place an opening assembly on a wall: `at` is the wall centre at the
  // storey floor, `n` the outward normal (unit, xz), `offset` how proud it sits.
  function placeOpening(units: OpeningUnit[], at: [number, number, number], n: [number, number], offset: number, glassMat: THREE.Material) {
    const asm = buildOpeningAssembly(units, glassMat);
    if (!asm) return;
    asm.position.set(at[0] + n[0] * offset, at[1], at[2] + n[1] * offset);
    asm.rotation.y = Math.atan2(n[0], n[1]);
    canopyGroup.add(asm);
  }

  function buildExtensionScene(W: number, D: number, H: number) {
    if (!state) return;

    // Floor slab inside the footprint
    const floorMat = flooringMaterial(W - 0.04, D - 0.04) ?? new THREE.MeshStandardMaterial({ color: 0xa89c84, roughness: 0.9 });
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
    const sides: { side: 'front' | 'back' | 'left' | 'right'; w: number; pos: [number, number, number]; rotY: number; n: [number, number] }[] = [
      { side: 'front', w: W, pos: [0,            baseY + H / 2,  D / 2 - t / 2], rotY: 0,            n: [0, 1] },
      { side: 'back',  w: W, pos: [0,            baseY + H / 2, -D / 2 + t / 2], rotY: Math.PI,      n: [0, -1] },
      { side: 'left',  w: D, pos: [-W / 2 + t / 2, baseY + H / 2,  0],           rotY: Math.PI / 2,  n: [-1, 0] },
      { side: 'right', w: D, pos: [ W / 2 - t / 2, baseY + H / 2,  0],           rotY: -Math.PI / 2, n: [1, 0] },
    ];
    for (const s of sides) {
      const choice = state.extensionWalls[s.side];
      if (!choice) continue;

      // Openings cut real apertures out of the wall; the wall is then built
      // as pier / header / sill segments around each unit. Ground storey uses
      // the full opening presets; upper storeys take windows only, auto-
      // repeated across the elevation (shared layout module keeps the count
      // in lock-step with quote() pricing).
      const isGround = baseY < 0.05;
      const preset = isGround ? state.openings?.[s.side] : state.upperOpenings?.[s.side];
      const units: OpeningUnit[] = !preset || preset === 'solid' ? []
        : isGround
          ? openingLayout(preset, s.w, H)
          : upperWindowLayout(preset, s.w).map(u => ({ ...u, leaves: u.w > 1.5 ? 2 : 1 }));

      // Wall group rotated by the outward normal — same axis convention as the
      // opening assembly, so asymmetric layouts land exactly in their apertures.
      const wallGroup = new THREE.Group();
      wallGroup.position.set(s.pos[0], baseY, s.pos[2]);
      wallGroup.rotation.y = Math.atan2(s.n[0], s.n[1]);
      canopyGroup.add(wallGroup);

      // Each segment gets a material fitted to its own size so brick courses
      // and render grain stay at real-world scale.
      const seg = (x0: number, x1: number, y0: number, y1: number) => {
        const w = x1 - x0, h = y1 - y0;
        if (w < 0.03 || h < 0.03) return;
        const mSeg = extensionWallMaterial(choice.kind, choice.finish, w, h);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mSeg);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        m.castShadow = true; m.receiveShadow = true;
        wallGroup.add(m);
      };

      if (!units.length) {
        seg(-s.w / 2, s.w / 2, 0, H);
      } else {
        for (const [x0, x1] of cutIntervals(s.w, units)) seg(x0, x1, 0, H); // piers
        for (const un of units) {
          const x0 = un.cx - un.w / 2 - 0.04, x1 = un.cx + un.w / 2 + 0.04;
          if (un.sill > 0.05) seg(x0, x1, 0, un.sill);                   // below a window
          if (un.sill + un.h < H - 0.05) seg(x0, x1, un.sill + un.h, H); // header above
        }
        // Frame assembly recessed into the reveal, slightly proud of the face.
        placeOpening(units, [s.pos[0], baseY, s.pos[2]], s.n, t / 2 - 0.05, tintedGlassMaterial());
      }
    }
  }

  function buildExtensionRoof(W: number, D: number, baseY: number, shape: 'flat' | 'mono' | 'dual' | 'hipped', tileKey: string, lantern: boolean) {
    const mat = tileMaterial(tileKey, W, D);
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
          const gableMat = extensionWallMaterial(choice.kind, choice.finish, D, ridgeH);
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
      const cap = new THREE.Mesh(PB(ls + 0.1, 0.06, ls + 0.1), lanternFrame);
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
    const n = footprint.length;
    const xs = footprint.map(p => p[0]), zs = footprint.map(p => p[1]);
    const floorMat = flooringMaterial(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
      ?? new THREE.MeshStandardMaterial({ color: 0x9c8e76, roughness: 0.85 });
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
  // Door apertures (units whose sill sits below the wall top) cut the run
  // into separate segments — the dwarf wall must not pass through a door.
  function buildDwarfSegment(a: Pt, b: Pt, h: number, brickKey: string, apertures?: OpeningUnit[]) {
    if (h <= 0.02) return;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const nx = dz / len, nz = -dx / len;            // outward normal (CCW footprint)
    const rotA = Math.atan2(nx, nz);                // same convention as placeOpening
    const local = (lx: number): [number, number] => [mx + Math.cos(rotA) * lx, mz - Math.sin(rotA) * lx];
    const t = 0.12;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.6, metalness: 0.02 });
    const capH = 0.04, capOver = 0.02;

    const doorCuts = (apertures ?? []).filter(u => u.sill < h - 0.02);
    const runs = doorCuts.length ? cutIntervals(len, doorCuts) : [[-len / 2, len / 2] as [number, number]];
    for (const [x0, x1] of runs) {
      const w = x1 - x0;
      if (w < 0.05) continue;
      const [wx, wz] = local((x0 + x1) / 2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), brickMaterial(brickKey, w, h));
      wall.position.set(wx, h / 2, wz);
      wall.rotation.y = rotA;
      wall.castShadow = true; wall.receiveShadow = true;
      canopyGroup.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + capOver * 2, capH, t + capOver * 2), capMat);
      cap.position.set(wx, h + capH / 2, wz);
      cap.rotation.y = rotA;
      cap.castShadow = true; cap.receiveShadow = true;
      canopyGroup.add(cap);
    }
  }

  // Build a glazed wall panel + mullion grid above the dwarf wall on one edge.
  // Apertures cut the pane/mullions/transom around door + window units, so a
  // door shows a clear opening (with a glazed toplight above) instead of the
  // glazing grid running through it.
  function buildGlazedSegment(a: Pt, b: Pt, baseY: number, height: number, apertures?: OpeningUnit[]) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const nx = dz / len, nz = -dx / len;            // outward normal (CCW footprint)
    const rotA = Math.atan2(nx, nz);                // same convention as placeOpening
    const local = (lx: number): [number, number] => [mx + Math.cos(rotA) * lx, mz - Math.sin(rotA) * lx];
    const fm = frameMaterial();
    const gm = glassMaterial();
    const panelH = height - baseY - 0.08;
    if (panelH <= 0.1) return;
    const paneY0 = baseY + 0.04, paneY1 = baseY + panelH + 0.04;
    const units = apertures ?? [];

    const pane = (x0: number, x1: number, y0: number, y1: number) => {
      const w = x1 - x0, h = y1 - y0;
      if (w < 0.04 || h < 0.04) return;
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), gm);
      const [wx, wz] = local((x0 + x1) / 2);
      p.position.set(wx, (y0 + y1) / 2, wz);
      p.rotation.y = rotA;
      canopyGroup.add(p);
    };

    if (!units.length) {
      pane(-len / 2 + 0.04, len / 2 - 0.04, paneY0, paneY1);
    } else {
      for (const [x0, x1] of cutIntervals(len, units)) {
        pane(Math.max(x0, -len / 2 + 0.04), Math.min(x1, len / 2 - 0.04), paneY0, paneY1);
      }
      for (const un of units) {
        const x0 = un.cx - un.w / 2 - 0.04, x1 = un.cx + un.w / 2 + 0.04;
        const top = un.sill + un.h;
        if (top < paneY1 - 0.05) pane(x0, x1, top + 0.02, paneY1);          // toplight above
        if (un.sill > paneY0 + 0.05) pane(x0, x1, paneY0, un.sill - 0.02);  // glass below a window
      }
    }

    // Mullion grid: vertical mullions every ~1m — skipped inside apertures
    // (the opening's own border frame takes over there).
    const cols = Math.max(2, Math.round(len / 1.05));
    for (let i = 0; i <= cols; i++) {
      const u = -len / 2 + (len * i) / cols;
      if (units.some(un => Math.abs(u - un.cx) < un.w / 2 + 0.06)) continue;
      const mullion = new THREE.Mesh(PB(0.045, panelH, 0.06), fm);
      const [wx, wz] = local(u);
      mullion.position.set(wx, baseY + panelH / 2 + 0.04, wz);
      mullion.rotation.y = rotA;
      mullion.castShadow = true;
      canopyGroup.add(mullion);
    }
    // Transom — split around apertures.
    const transomY = baseY + panelH * 0.65 + 0.04;
    const tRuns = units.length ? cutIntervals(len, units) : [[-len / 2 + 0.02, len / 2 - 0.02] as [number, number]];
    for (const [x0, x1] of tRuns) {
      if (x1 - x0 < 0.1) continue;
      const transom = new THREE.Mesh(PB(x1 - x0 - 0.02, 0.06, 0.06), fm);
      const [wx, wz] = local((x0 + x1) / 2);
      transom.position.set(wx, transomY, wz);
      transom.rotation.y = rotA;
      canopyGroup.add(transom);
    }
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
      const post = new THREE.Mesh(PB(postSize, H, postSize), fm);
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
      const beam = new THREE.Mesh(PB(len, beamH, postSize), fm);
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

    // Doors / windows land on each configured elevation's longest matching
    // edge (facets classified by outward normal, so the Victorian bay's front
    // door lands on the widest front-facing facet). Resolved BEFORE building
    // segments so dwarf wall + glazing cut real apertures around the units.
    const edgeOpenings = new Map<number, { preset: string; units: OpeningUnit[]; len: number; mid: [number, number]; n: [number, number] }>();
    if (state.openings) {
      const best = new Map<string, { i: number; len: number; mid: [number, number]; n: [number, number] }>();
      for (let i = 1; i < footprint.length; i++) {
        const a = footprint[i], b = footprint[(i + 1) % footprint.length];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.3) continue;
        const nx = dz / len, nz = -dx / len; // outward normal (CCW footprint)
        const side = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'right' : 'left') : (nz > 0 ? 'front' : 'back');
        const cur = best.get(side);
        if (!cur || len > cur.len) best.set(side, { i, len, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n: [nx, nz] });
      }
      for (const [side, e] of best) {
        const preset = state.openings[side as 'front' | 'back' | 'left' | 'right'];
        if (!preset || preset === 'solid') continue;
        edgeOpenings.set(e.i, { preset, units: openingLayout(preset, e.len, H - 0.2), len: e.len, mid: e.mid, n: e.n });
      }
    }

    // Skip edge 0 (back wall against the house) — it's not rendered as glazing.
    for (let i = 1; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length];
      const units = edgeOpenings.get(i)?.units;
      buildDwarfSegment(a, b, dwarfHeight, brickKey, units);
      buildGlazedSegment(a, b, dwarfHeight, H, units);
    }

    buildPerimeterFrame(footprint, H);

    // The opening frame assemblies, seated in their apertures.
    for (const e of edgeOpenings.values()) {
      placeOpening(e.units, [e.mid[0], 0, e.mid[1]], e.n, 0.02, glassMaterial());
    }

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
      const mul = new THREE.Mesh(PB(0.05, 0.09, slopeLen + overhang), fm);
      mul.position.set(x, H + rise / 2 + 0.06, 0);
      mul.rotation.x = -angle;
      mul.castShadow = true;
      canopyGroup.add(mul);
    }
    const ridge = new THREE.Mesh(PB(W + 0.12, 0.14, 0.18), fm);
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
      const rafter = new THREE.Mesh(PB(0.06, 0.08, len), fm);
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
      const m = new THREE.Mesh(PB(w, h, d), fm);
      m.position.set(x, y, z);
      canopyGroup.add(m);
    }
    // Brick piers at the 4 outer corners + 2 mid-front.
    const pierW = 0.36, pierD = 0.36;
    const pierMat = brickMaterial(brickKey, pierW, H);
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
      const rafter = new THREE.Mesh(PB(0.05, 0.07, len), fm);
      rafter.position.set((x + cx) / 2, (H + peakY) / 2, (z + cz) / 2);
      rafter.lookAt(cx, peakY, cz);
      rafter.castShadow = true;
      canopyGroup.add(rafter);
    }
  }

  // House backdrop for wall-mounted products. It fills a third of most frames,
  // so it carries real render / cladding, eaves with a gutter, a pitched slate
  // roof rising away from the viewer and two storeys of windows: it should
  // read as a house, not a wall.
  function buildHouse(W: number, D: number, H: number) {
    const houseW = W + 4, houseH = H + 1.9, houseT = 0.35;
    const zFace = -D / 2 - 0.02;                 // front face of the house wall
    const wallMat = claddingMaterial(houseW, houseH)
      ?? setMaterial('house-render', 'plaster', 0xf6f3ec, houseW, houseH, { roughness: 0.95, normalScale: 0.45, fallback: { map: plasterTex, color: 0xe9e4da, bump: 0.15 } });
    const house = new THREE.Mesh(new THREE.BoxGeometry(houseW, houseH, houseT), wallMat);
    house.position.set(0, houseH / 2, zFace - houseT / 2);
    house.receiveShadow = true; house.castShadow = true;
    canopyGroup.add(house);

    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.55 });
    const soffit = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.3, 0.05, 0.5), trimMat);
    soffit.position.set(0, houseH + 0.025, zFace - houseT / 2 + 0.25);
    soffit.castShadow = true; canopyGroup.add(soffit);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.3, 0.2, 0.03), trimMat);
    fascia.position.set(0, houseH + 0.12, zFace - houseT / 2 + 0.5);
    fascia.castShadow = true; canopyGroup.add(fascia);
    const gutterMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.45, metalness: 0.1 });
    const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, houseW + 0.3, 12), gutterMat);
    gutter.rotation.z = Math.PI / 2;
    gutter.position.set(0, houseH + 0.16, zFace - houseT / 2 + 0.56);
    gutter.castShadow = true; canopyGroup.add(gutter);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, houseH + 0.1, 10), gutterMat);
    pipe.position.set(houseW / 2 - 0.35, (houseH + 0.1) / 2, zFace + 0.05);
    pipe.castShadow = true; canopyGroup.add(pipe);
    const pitch = THREE.MathUtils.degToRad(32);
    const run = 3.4, rise = Math.tan(pitch) * run, slope = Math.hypot(run, rise);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(houseW + 0.34, 0.1, slope), tileMaterial('slate-grey', houseW, slope));
    roof.position.set(0, houseH + 0.22 + rise / 2, zFace - houseT / 2 + 0.55 - run / 2);
    roof.rotation.x = -pitch; // higher at the back (-Z), eave at the front
    roof.castShadow = true; roof.receiveShadow = true;
    canopyGroup.add(roof);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3a4d, roughness: 0.4 });
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.18, 0.05), trimMat);
    doorFrame.position.set(0, 1.09, zFace + 0.02);
    canopyGroup.add(doorFrame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.05), doorMat);
    door.position.set(0, 1.05, zFace + 0.04);
    canopyGroup.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), new THREE.MeshStandardMaterial({ color: 0xc9a55e, roughness: 0.25, metalness: 0.8 }));
    knob.position.set(0.35, 1.05, zFace + 0.08);
    canopyGroup.add(knob);

    const winGlass = glazing('houseGlass', { tint: 0x9fb4bd, transmission: 0.5, roughness: 0.05, opacity: 0.75, env: 1 });
    const rows = [1.5, houseH - 1.3].filter(y => y + 0.65 < houseH - 0.05);
    for (const wy of rows) for (const wx of [-W * 0.40, W * 0.40]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.06), trimMat);
      f.position.set(wx, wy, zFace + 0.015);
      f.castShadow = true; canopyGroup.add(f);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.06, 0.03), winGlass);
      win.position.set(wx, wy, zFace + 0.04);
      canopyGroup.add(win);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.06, 0.04), trimMat);
      bar.position.set(wx, wy, zFace + 0.045);
      canopyGroup.add(bar);
      const cill = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.12), trimMat);
      cill.position.set(wx, wy - 0.63, zFace + 0.05);
      cill.castShadow = true; canopyGroup.add(cill);
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

    // Sofa — photoscanned model once loaded, box construction as fallback.
    if (!placeModel('sofa', 0, -0.5)) {
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
    }

    // Coffee table — round photoscanned table, or the box top + legs.
    if (!placeModel('coffeeTable', 0, 0.7)) {
      const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 });
      const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.6), woodMat);
      top.position.set(0, 0.4, 0.85);
      top.castShadow = true; top.receiveShadow = true;
      canopyGroup.add(top);
      for (const [lx, lz] of [[-0.44, -0.24], [0.44, -0.24], [0.44, 0.24], [-0.44, 0.24]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), legMat);
        leg.position.set(lx, 0.2, 0.85 + lz);
        leg.castShadow = true;
        canopyGroup.add(leg);
      }
    }

    // Side seating — the folding table + chairs set when there's room for it,
    // otherwise the two box chairs flanking the sofa.
    const setX = Math.min(W / 4 + 0.4, W / 2 - 1.0);
    if (!(W >= 4.6 && placeModel('outdoorSet', setX, 0.35, -0.35))) {
      const fabricMat = new THREE.MeshStandardMaterial({ color: 0x504a44, roughness: 0.95 });
      const cushMat = new THREE.MeshStandardMaterial({ color: 0xa79a85, roughness: 0.95 });
      const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
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
    }

    // Potted plant in the corner — photoscanned plant (scaled up so the
    // real-world ~40cm pot reads at patio distance), or pot + jittered bush.
    if (!placeModel('plant', W / 2 - 0.55, D / 2 - 0.5, 0, 1.5)) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 18), new THREE.MeshStandardMaterial({ color: 0xb0a28c, roughness: 0.8 }));
      pot.position.set(W / 2 - 0.5, 0.21, D / 2 - 0.45);
      pot.castShadow = true;
      canopyGroup.add(pot);
      const bush = new THREE.Mesh(jitterGeo(new THREE.SphereGeometry(0.34, 12, 10), 0.07), leafMat);
      bush.position.set(W / 2 - 0.5, 0.68, D / 2 - 0.45);
      bush.castShadow = true;
      canopyGroup.add(bush);
    }
  }

  function buildCar() {
    // Licensed model when loaded: scaled to a 4.4 m length, laid along X,
    // seated on the paving and centred under the roof. The box build below
    // remains the first-paint fallback.
    const carModel = modelCache.get('car');
    if (carModel) {
      const inst = carModel.clone(true);
      inst.userData.sharedAssets = true;
      const size = new THREE.Box3().setFromObject(inst).getSize(new THREE.Vector3());
      const alongZ = size.z > size.x;
      inst.scale.setScalar(4.4 / (alongZ ? size.z : size.x));
      if (alongZ) inst.rotation.y = Math.PI / 2;
      const box = new THREE.Box3().setFromObject(inst);
      inst.position.set(-(box.min.x + box.max.x) / 2, -box.min.y + 0.012, -(box.min.z + box.max.z) / 2);
      inst.rotation.y += 0.06;
      canopyGroup.add(inst);
      return;
    }
    const car = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x7e1f2c, metalness: 0.7, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
    const darkGlass = glazing('carGlass', { tint: 0x1a2530, transmission: 0.2, roughness: 0.08, opacity: 0.92, env: 1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.6 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.95 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xb9b9b9, roughness: 0.25, metalness: 0.85 });
    const body = new THREE.Mesh(PB(3.9, 0.5, 1.75, 0.09), paint);
    body.position.y = 0.55; car.add(body);
    const hood = new THREE.Mesh(PB(3.96, 0.12, 1.8, 0.04), trimMat);
    hood.position.y = 0.32; car.add(hood);
    const cabin = new THREE.Mesh(PB(2.0, 0.5, 1.62, 0.14), paint);
    cabin.position.set(-0.25, 1.02, 0); car.add(cabin);
    const glasshouse = new THREE.Mesh(PB(1.85, 0.36, 1.66, 0.1), darkGlass);
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
    const corrMat = new THREE.MeshStandardMaterial({ map: corrTex, roughness: 0.5, metalness: 0.2 });

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
    const sliderFrame = new THREE.Mesh(PB(0.06, H, 0.06), fm);
    sliderFrame.position.set(frontPanelW / 2, baseY + H / 2, D / 2 - wallT / 2);
    canopyGroup.add(sliderFrame);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.025, H * 0.45, 1.4), glassMaterial());
    win.position.set(-W / 2 + wallT / 2 - 0.005, baseY + H * 0.55, 0);
    canopyGroup.add(win);
    const winFrame = new THREE.Mesh(PB(0.04, H * 0.5, 1.46), fm);
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

    const floorMat = flooringMaterial(W - 0.12, D - 0.12);
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
    const clad = claddingMaterial(1.8, H);
    const slatMat = clad ?? fm;
    const panelMat = clad ?? plankMaterial('fence-panel', 0xd2ad7e, 1.8, H, 0.85);

    pad.scale.set(W + 1.4, 1.2, 1);
    paverTex.repeat.set((W + 1.4) / 2.4, 0.5);
    contact.scale.set(W + 0.6, 0.6, 1);

    const postSize = 0.1, panelSpan = 1.8;
    const numPanels = Math.max(2, Math.round(W / panelSpan));
    const cellW = W / numPanels;
    const fenceH = H;

    for (let i = 0; i <= numPanels; i++) {
      const x = -W / 2 + i * cellW;
      const post = new THREE.Mesh(PB(postSize, fenceH + 0.1, postSize), fm);
      post.position.set(x, (fenceH + 0.1) / 2, 0);
      post.castShadow = true; post.receiveShadow = true;
      canopyGroup.add(post);
      const cap = new THREE.Mesh(PB(postSize * 1.4, 0.05, postSize * 1.4), fm);
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
          const s = new THREE.Mesh(PB(innerW, slatTh, 0.04), slatMat);
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

    const rail = new THREE.Mesh(PB(W, 0.08, 0.05), fm);
    rail.position.set(0, 0.04, 0); canopyGroup.add(rail);
    const railTop = new THREE.Mesh(PB(W, 0.08, 0.05), fm);
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
    const houseW = W * 2.2, houseH = H + 1.4, wallT = 0.3;
    const wallMat = claddingMaterial(houseW, houseH) ?? renderMaterial('cream', houseW, houseH);

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
    const trimTop = new THREE.Mesh(PB(doorW + 0.2, doorFrameT, 0.05), trimMat);
    trimTop.position.set(0, doorH + doorFrameT / 2, 0.04);
    canopyGroup.add(trimTop);
    for (const sx of [-doorW / 2 - 0.05, doorW / 2 + 0.05]) {
      const tr = new THREE.Mesh(PB(doorFrameT, doorH, 0.05), trimMat);
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
          const wframe = new THREE.Mesh(PB(doorW / 4.5 + 0.04, panelH * 0.5 + 0.04, 0.012), trimMat);
          wframe.position.set(wx, y, 0.04);
          canopyGroup.add(wframe);
        }
      }
    }

    const handle = new THREE.Mesh(PB(0.45, 0.04, 0.03), trimMat);
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
    // Sun path: rises at the left of the house, stands in front of it at
    // midday (lighting the product and the facade) and sets front-right. The
    // prototype's path ran behind the house, which the path tracer exposed as
    // a shadowed patio in every photo.
    const azim = 275 + dayFrac * 155;
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

    moonLight.intensity = night * 0.35;

    skyU.turbidity.value = lerp(5, 11, lowSun);
    skyU.rayleigh.value = lerp(1.4, 2.6, lowSun);
    skyU.mieCoefficient.value = lerp(0.004, 0.012, lowSun);

    // Environment: the HDRI while the sun is up (rotated so its sun lines up
    // with the sun light, so reflections track the time slider); the
    // procedural sky's PMREM for sunset and night. PMREM regeneration costs a
    // few ms, so the sky env only refreshes once the time has moved enough.
    const useHdri = !!hdriEnv && lowSun < 0.72;
    if (useHdri) {
      scene.environment = hdriEnv;
      scene.environmentIntensity = 0.3 + day * 0.6;
      scene.environmentRotation.y = hdriSunAzimuth - Math.atan2(sunVec.z, sunVec.x);
    } else {
      if (Math.abs(timeOfDay - envTime) > 0.2 || scene.environment === hdriEnv) { envTime = timeOfDay; updateEnvironment(day); }
      scene.environmentIntensity = 0.14 + day * 0.21;
      scene.environmentRotation.y = 0;
    }
    // Analytic fills are the fallback ambient; the HDRI supplies most of it.
    const fill = useHdri ? 0.45 : 1;
    hemi.intensity = (0.06 + day * 0.42) * fill;
    ambient.intensity = (0.04 + day * 0.2) * fill;

    starMat.opacity = night * 0.9;

    const fogDay = new THREE.Color(0xdde4ea), fogSet = new THREE.Color(0xd9b393), fogNight = new THREE.Color(0x141b27);
    const fogC = fogDay.clone().lerp(fogSet, lowSun).lerp(fogNight, night);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(fogC);

    // Daylight gets NO bloom — on real GPUs the bright sky blooms a milky
    // veil over everything against it. Bloom is for night LEDs + sunset glow.
    bloom.strength = night * 0.55 + lowSun * 0.06;
    bloom.threshold = lerp(0.95, 0.55, night);
    bloom.enabled = profile.bloom && bloom.strength > 0.02;
    renderer.toneMappingExposure = lerp(0.95, 0.6, night);

    const ledOn = 0.2 + night * 4.2;
    ledMeshes.forEach(m => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = ledOn * (state?.addons.lighting || bollardLights.length ? 1 : 0);
    });
    glowLights.forEach(l => { l.intensity = night * 1.6; });
    bollardLights.forEach(l => { l.intensity = night * 0.8; });
    heaterEmitters.forEach(m => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + night * 2.6; });
  }

  // --- photo mode: path-traced still ---
  // Replaces the live raster view with a progressive, physically based render
  // (three-gpu-pathtracer, loaded on demand). The tracer snapshots visible
  // objects and reads scene.environment / scene.background as equirect maps,
  // so the traced scene is built with a "photo look": the raster-only
  // backdrop (sky dome, stars, contact blob) hidden, the raw HDRI as the only
  // light (its sun disc is the sun, so the analytic sun light is off) and
  // glazing rebuilt as true refractive glass whatever the live tier.
  //
  // The tracer's shader is very large and its first compile can take a minute
  // or more on laptop graphics. The compile is asynchronous, so photo mode
  // runs in two phases: 'compiling' keeps drawing the live view (cancellable)
  // while the shader builds; 'rendering' then takes over the canvas with one
  // sample per frame. A single tracer is kept for the session so later photos
  // reuse the compiled program. Any change to the configuration, view or time
  // ends photo mode.
  let tracerInstance: WebGLPathTracer | null = null;
  // Edge-preserving denoise (the library's smart-denoise shader) applied when
  // the accumulated samples are drawn to the canvas and when the photo is
  // saved: a 60-sample render reads as clean instead of grainy.
  let photoDenoise = true;
  let denoiseQuad: FullScreenQuad | null = null;
  type Photo = {
    tracer: WebGLPathTracer;
    phase: 'compiling' | 'rendering';
    onProgress: (samples: number) => void;
    onEnd: () => void;
    liveProfile: QualityProfile;
    photoLook: () => void;
    liveLook: () => void;
    startedAt: number;
    /** GPU fence for the last submitted tile: the next tile waits for it. */
    fence: WebGLSync | null;
  };
  let photo: Photo | null = null;
  // Submit one tile at a time. Without this the tracer queues work far faster
  // than the GPU finishes it: the canvas lags many seconds behind the sample
  // counter and any readback (Save, screenshots) blocks on the backlog.
  function photoSubmit(p: Photo): boolean {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (p.fence) {
      const st = gl.clientWaitSync(p.fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return false; // previous tile still running
      gl.deleteSync(p.fence);
      p.fence = null;
    }
    p.tracer.renderSample();
    p.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return true;
  }
  // Desktop-class GPUs only: the tracer needs WebGL2 float buffers, and on a
  // phone the shader compile alone would freeze the browser for minutes.
  function photoSupported(): boolean {
    const gl = renderer.getContext();
    return renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float') && !!hdriEquirect
      && profile.tier !== 'low' && !isMobileDevice();
  }
  async function startPhoto(onProgress: (samples: number) => void, onEnd: () => void) {
    if (photo || !state || !photoSupported()) return;
    const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer');
    const hdri = hdriEquirect;
    if (photo || !hdri) return;
    const t0 = performance.now();
    const log = (msg: string) => { if (process.env.NODE_ENV !== 'production') console.info(`photo: ${msg} (+${Math.round(performance.now() - t0)} ms)`); };

    const liveProfile = profile;
    if (!liveProfile.transmission) { profile = { ...liveProfile, transmission: true }; clearMaterialCache(); buildCanopy(); }
    controls.enabled = false;
    camAnim = null;

    const prev = {
      env: scene.environment, bg: scene.background, envI: scene.environmentIntensity, fog: scene.fog,
      sun: sunLight.visible, sky: sky.visible, stars: stars.visible, contact: contact.visible, grass: grass?.visible ?? true,
    };
    const photoLook = () => {
      sky.visible = false; stars.visible = false; contact.visible = false; sunLight.visible = false;
      if (grass) grass.visible = false;
      scene.fog = null;
      scene.environment = hdri;
      scene.background = hdri;
      scene.backgroundRotation.copy(scene.environmentRotation);
      scene.environmentIntensity = 1;
    };
    const liveLook = () => {
      sky.visible = prev.sky; stars.visible = prev.stars; contact.visible = prev.contact; sunLight.visible = prev.sun;
      if (grass) grass.visible = prev.grass;
      scene.fog = prev.fog; scene.environment = prev.env; scene.background = prev.bg; scene.environmentIntensity = prev.envI;
    };

    const tracer = tracerInstance ?? (tracerInstance = new WebGLPathTracer(renderer));
    tracer.bounces = 6;
    tracer.transmissiveBounces = 12;   // glass-heavy products need deep refraction paths
    tracer.filterGlossyFactor = 0.5;   // tames fireflies on the powder coat and glazing
    tracer.minSamples = 1;
    tracer.renderScale = 1;
    tracer.dynamicLowRes = false;
    const t = liveProfile.tier === 'high' ? 2 : 3; // tiles keep the page responsive while a sample renders
    tracer.tiles.set(t, t);
    tracer.fadeDuration = 0;
    if (!denoiseQuad) {
      const mat = new DenoiseMaterial() as unknown as THREE.ShaderMaterial;
      // Tuned on 40-sample renders: strong enough to settle lawn and paving
      // grain, mild enough to keep profiles and mullions crisp. The filter
      // works on HDR values, so a larger threshold smears bright surfaces.
      mat.uniforms.sigma.value = 4;
      mat.uniforms.kSigma.value = 1.2;
      mat.uniforms.threshold.value = 0.18;
      denoiseQuad = new FullScreenQuad(mat);
    }
    tracer.renderToCanvasCallback = (target, r, quad) => {
      const autoClear = r.autoClear;
      r.autoClear = false;
      if (photoDenoise && denoiseQuad && tracer.samples >= 2) {
        (denoiseQuad.material as THREE.ShaderMaterial).uniforms.map.value = target.texture;
        denoiseQuad.render(r);
      } else {
        quad.render(r);
      }
      r.autoClear = autoClear;
    };

    // Build the traced scene from the photo look, then put the live look back
    // while the shader compiles.
    photoLook();
    tracer.setScene(scene, camera);
    liveLook();
    log('scene set (BVH + textures)');
    tracer.renderToCanvas = false; // compile phase: samples accumulate off-screen, the live view stays up

    photo = { tracer, phase: 'compiling', onProgress, onEnd, liveProfile, photoLook, liveLook, startedAt: t0, fence: null };
  }
  function photoTick(now: number) {
    const p = photo!;
    if (p.phase === 'compiling') {
      // Driving the tracer off-canvas starts the (asynchronous) shader compile
      // and, once the program is ready, the first samples. The first draw can
      // still stall the GPU driver for a while; nothing to be done about that.
      photoSubmit(p);
      if (p.tracer.samples < 1) return false; // live view carries on
      p.phase = 'rendering';
      p.photoLook();
      p.tracer.renderToCanvas = true;
      if (process.env.NODE_ENV !== 'production') console.info(`photo: first sample (+${Math.round(now - p.startedAt)} ms)`);
    }
    photoSubmit(p);
    p.onProgress(p.tracer.samples);
    return true;
  }
  function stopPhoto() {
    if (!photo) return;
    const p = photo;
    photo = null;
    if (p.fence) { (renderer.getContext() as WebGL2RenderingContext).deleteSync(p.fence); p.fence = null; }
    p.tracer.renderToCanvas = false;
    if (p.phase === 'rendering') p.liveLook();
    controls.enabled = true;
    if (profile !== p.liveProfile) { profile = p.liveProfile; clearMaterialCache(); buildCanopy(); }
    p.onEnd();
  }
  function setPhotoDenoise(on: boolean) { photoDenoise = on; }
  function photoDataUrl(): string | null {
    if (!photo || photo.phase !== 'rendering') return null;
    photo.tracer.renderSample(); // the canvas has no preserved buffer: draw, then read in the same task
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // --- camera ---
  type CamAnim = { t0: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; tg0: THREE.Vector3; tg1: THREE.Vector3 };
  let camAnim: CamAnim | null = null;
  function tweenCamera(pos: THREE.Vector3, target: THREE.Vector3, dur = 900) {
    camAnim = { t0: performance.now(), dur, p0: camera.position.clone(), p1: pos, tg0: controls.target.clone(), tg1: target };
  }
  function applyView(animate = true) {
    if (!state) return;
    const W = state.length, D = state.depth;
    // Two-storey extensions are ~2× taller — frame the full build, not just
    // the ground floor.
    const H = state.product === 'extension' && state.storeys === 2 ? state.height * 2 : state.height;
    const r = Math.max(W, D, H * 1.6) * 1.55 * (opts.frameScale ?? 1);
    let pos: THREE.Vector3, tgt: THREE.Vector3;
    if (view === 'iso')        { pos = new THREE.Vector3(r, r * 0.62, r);    tgt = new THREE.Vector3(0, H * 0.42, 0); controls.enableRotate = true; }
    else if (view === 'front') { pos = new THREE.Vector3(0, H / 2 + 0.2, r * 1.45); tgt = new THREE.Vector3(0, H / 2, 0); controls.enableRotate = false; }
    else if (view === 'side')  { pos = new THREE.Vector3(r * 1.45, H / 2 + 0.2, 0); tgt = new THREE.Vector3(0, H / 2, 0); controls.enableRotate = false; }
    else                       { pos = new THREE.Vector3(0, r * 1.8, 0.01);  tgt = new THREE.Vector3(0, 0, 0);          controls.enableRotate = false; }
    if (animate) tweenCamera(pos, tgt);
    else { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); }
  }

  // --- resize ---
  let resizeCount = 0;
  function resize() {
    resizeCount++;
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    composer.setSize(r.width, r.height);
    if (profile.ao && profile.aoScale < 1) {
      // AO at reduced resolution: the denoiser smooths it and it is blended
      // back at full resolution, so half-res is nearly free visually.
      const pr = renderer.getPixelRatio();
      gtao.setSize(Math.max(1, Math.round(r.width * pr * profile.aoScale)), Math.max(1, Math.round(r.height * pr * profile.aoScale)));
    }
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  function applyProfile(p: QualityProfile) {
    profile = p;
    const dpr = Math.min(window.devicePixelRatio, p.maxDpr);
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    gtao.enabled = p.ao;
    sunLight.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    sunLight.shadow.map?.dispose();
    sunLight.shadow.map = null;
    resize();
    clearMaterialCache();           // glass / clearcoat variants depend on the tier
    if (state) buildCanopy();
    opts.onTier?.(p.tier);
  }
  window.addEventListener('resize', resize);
  const resizeObs = new ResizeObserver(resize);
  resizeObs.observe(container);
  resize();

  // --- loop ---
  let lastT = performance.now();
  let frames = 0, fpsT = lastT, totalFrames = 0;
  let raf = 0;
  function animate(now: number) {
    raf = requestAnimationFrame(animate);
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (photo && photoTick(now)) {
      // Photo mode, rendering phase: one path-tracing sample per frame drawn
      // straight to the canvas; the live loop (controls, composer, probe) waits.
      frames++; totalFrames++;
      if (now - fpsT > 1000) { onFps?.(frames); frames = 0; fpsT = now; }
      return;
    }
    if (camAnim) {
      const k = Math.max(0, Math.min(1, (now - camAnim.t0) / camAnim.dur));
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.tg0, camAnim.tg1, e);
      if (k >= 1) camAnim = null;
    }
    if (spin && view === 'iso' && !camAnim && !photo) {
      const theta = Math.atan2(camera.position.z, camera.position.x) + dt * 0.22;
      const rad = Math.hypot(camera.position.x, camera.position.z);
      camera.position.x = Math.cos(theta) * rad;
      camera.position.z = Math.sin(theta) * rad;
    }
    const targetTilt = roofOpen ? -1.15 : 0;
    for (const s of louvreSlats) {
      // Blades pivot about their own long axis (X for slats across the depth, Z otherwise).
      const axis = (s.userData.axis as 'x' | 'z' | undefined) ?? 'z';
      s.rotation[axis] += (targetTilt - s.rotation[axis]) * Math.min(dt * 5, 1);
    }
    if (awning) {
      const targetExt = roofOpen ? 0.05 : 1;
      awning.ext += (targetExt - awning.ext) * Math.min(dt * 3, 1);
      awning.cloth.scale.z = awning.ext;
      awning.bar.position.z = awning.backZ + awning.span * awning.ext;
      awning.bar.position.y = awning.yBack + (awning.yFront - awning.yBack) * awning.ext;
    }
    if (!photo) controls.update(); // photo mode (compiling phase) holds the camera still
    grassUniforms.uTime.value = now / 1000;
    composer.render();
    frames++; totalFrames++;
    if (now - fpsT > 1000) {
      onFps?.(frames);
      frames = 0; fpsT = now;
    }
    // Adaptive quality: once the first paint has settled, step the tier down
    // while the sustained frame rate is below ~24 fps. A rebuild (textures or
    // models arriving, an option change) stalls a few frames, so a window
    // containing one restarts instead of blaming the GPU. Hidden tabs get a
    // throttled rAF and are skipped.
    if (!tierLocked && !photo && !document.hidden && now - sceneStart > 4000) {
      if (!probeT0 || lastBuildAt > probeT0) { probeT0 = now; probeFrames = 0; }
      probeFrames++;
      const el = now - probeT0;
      if (el > 3000) {
        const fps = probeFrames * 1000 / el;
        const next = fps < 24 ? lowerTier(profile.tier) : null;
        if (next) { applyProfile(PROFILES[next]); probeT0 = 0; }
        else tierLocked = true;
      }
    }
  }
  const sceneStart = performance.now();
  let tierLocked = opts.quality !== 'auto';
  let probeT0 = 0, probeFrames = 0;
  raf = requestAnimationFrame(animate);
  // Dev-only inspection hook (renderer.info, tier, resize count) for the
  // Playwright performance probe.
  if (process.env.NODE_ENV !== 'production') {
    (window as unknown as { __canopy?: unknown }).__canopy = {
      renderer, scene, composer,
      get tier() { return profile.tier; },
      get resizes() { return resizeCount; },
      get builds() { return buildCount; },
      get frames() { return totalFrames; },
      get photoSamples() { return photo ? photo.tracer.samples : -1; },
      photoDataUrl: () => photoDataUrl(),
      setPhotoDenoise,
      get photoTracer() { return photo?.tracer ?? null; },
      get photoDenoiseMaterial() { return denoiseQuad?.material ?? null; },
    };
  }

  // --- pointer cursor ---
  canvas.addEventListener('pointerdown', () => { canvas.style.cursor = 'grabbing'; camAnim = null; });
  window.addEventListener('pointerup', () => { canvas.style.cursor = 'grab'; });

  // --- public API ---
  return {
    setState(s, productSceneId) {
      stopPhoto();
      const colorChanged = state?.frameColor !== s.frameColor || state?.slatColor !== s.slatColor || state?.cladding !== s.cladding || state?.flooring !== s.flooring;
      state = s;
      productScene = productSceneId;
      if (colorChanged) clearMaterialCache();
      buildCanopy();
      if (!camAnim) applyView(false);
    },
    setView(v) {
      stopPhoto();
      view = v;
      applyView(true);
    },
    setTime(t) {
      stopPhoto();
      timeOfDay = t;
      applyTime();
    },
    setSpin(b) { if (b) stopPhoto(); spin = b; },
    setRoofOpen(b) { stopPhoto(); roofOpen = b; },
    photoSupported,
    startPhoto,
    stopPhoto,
    photoDataUrl,
    setPhotoDenoise,
    snapshot(width = 1920, type = 'image/png', quality = 0.9) {
      // Render once at print-friendly resolution, then restore the live DPR.
      const r = container.getBoundingClientRect();
      const live = renderer.getPixelRatio();
      const scale = Math.max(live, Math.min(4, width / Math.max(1, r.width)));
      renderer.setPixelRatio(scale);
      composer.setPixelRatio(scale);
      resize();
      composer.render();
      const url = canvas.toDataURL(type, quality);
      renderer.setPixelRatio(live);
      composer.setPixelRatio(live);
      resize();
      return url;
    },
    dispose() {
      stopPhoto();
      tracerInstance?.dispose();
      denoiseQuad?.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      resizeObs.disconnect();
      disposeGroup(canopyGroup);
      clearMaterialCache();
      modelCache.forEach(root => root.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach(mat => {
          const s = mat as THREE.MeshStandardMaterial;
          s.map?.dispose(); s.normalMap?.dispose(); s.roughnessMap?.dispose();
          s.metalnessMap?.dispose(); s.aoMap?.dispose();
          mat.dispose();
        });
      }));
      modelCache.clear();
      pavingMaps.forEach(t => t.dispose());
      hdriEquirect?.dispose();
      ktx2.dispose();
      gtao.dispose();
      envRT?.dispose();
      envSky.geometry.dispose();
      (envSky.material as THREE.Material).dispose();
      envGround.geometry.dispose();
      envGroundMat.dispose();
      pmrem.dispose();
      composerRT.dispose();
      renderer.dispose();
      container.removeChild(canvas);
    },
  };
}
