// Rendering quality tiers. Everything in the 3D view runs on the visitor's
// own GPU, so the same page has to scale from a desktop with a discrete card
// down to a mid-range phone. A tier is the per-frame budget: pixel ratio,
// shadow resolution, MSAA, ambient occlusion and whether glass uses the
// (expensive) transmission pass. The scene starts from a heuristic guess and
// steps down while the measured frame rate stays low.

export type QualityTier = 'high' | 'medium' | 'low';

export type QualityProfile = {
  tier: QualityTier;
  /** Cap applied to window.devicePixelRatio. */
  maxDpr: number;
  /** Directional-light shadow map resolution. */
  shadowMapSize: number;
  /** MSAA samples on the post-processing render target (0 = off). Fixed at start-up. */
  msaa: number;
  /** Ground-truth ambient occlusion pass. */
  ao: boolean;
  /** AO buffer resolution relative to the frame (1 = full, 0.5 = half). */
  aoScale: number;
  /** Refractive glass (renders the scene an extra time behind glazing). */
  transmission: boolean;
  /** Clearcoat layer on powder-coated aluminium. */
  clearcoat: boolean;
  /** Bloom pass for night LEDs / sunset glow. */
  bloom: boolean;
  /** Texture anisotropy. */
  anisotropy: number;
  /** Shadow map covers the whole garden (true) or just the product + patio. */
  wideShadows: boolean;
  /** Instanced grass blades around the patio. */
  grass: boolean;
};

export const PROFILES: Record<QualityTier, QualityProfile> = {
  high:   { tier: 'high',   maxDpr: 2,    shadowMapSize: 4096, msaa: 4, ao: true,  aoScale: 1,   transmission: true,  clearcoat: true,  bloom: true,  anisotropy: 8, wideShadows: true,  grass: true },
  medium: { tier: 'medium', maxDpr: 1.5,  shadowMapSize: 2048, msaa: 2, ao: true,  aoScale: 0.5, transmission: false, clearcoat: true,  bloom: true,  anisotropy: 4, wideShadows: false, grass: false },
  low:    { tier: 'low',    maxDpr: 1,    shadowMapSize: 1024, msaa: 0, ao: false, aoScale: 0,   transmission: false, clearcoat: false, bloom: false, anisotropy: 2, wideShadows: false, grass: false },
};

export const TIER_ORDER: QualityTier[] = ['high', 'medium', 'low'];

export function lowerTier(t: QualityTier): QualityTier | null {
  const i = TIER_ORDER.indexOf(t);
  return i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

/** Phone or tablet: touch-first pointer or a mobile user agent. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const uaMobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return uaMobile || coarse;
}

/** Heuristic starting tier.
 *  - Phones / tablets start on medium (low when the device reports little memory).
 *  - Desktops with an integrated or entry-level GPU (from the unmasked WebGL
 *    renderer string) start on medium; everything else starts on high.
 *  The runtime frame-rate probe in the scene corrects an optimistic guess. */
export function detectTier(gpu = ''): QualityTier {
  if (typeof window === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;           // iOS never reports it; assume capable
  const cores = navigator.hardwareConcurrency ?? 4;
  if (isMobileDevice()) return mem >= 4 && cores >= 4 ? 'medium' : 'low';
  const weakGpu = /Intel|Iris|UHD Graphics|HD Graphics|GeForce MX|Radeon\(TM\) Graphics|Vega [368]|SwiftShader|llvmpipe/i.test(gpu);
  if (weakGpu) return 'medium';
  return mem >= 4 ? 'high' : 'medium';
}
