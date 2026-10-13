'use client';

// Headless render page body, driven by render-worker/worker.mjs. Mounts the
// scene at a fixed size on the high tier, starts photo mode as soon as the
// HDRI and textures are in, lets it accumulate `samples` samples (or run for
// `maxMs` after the first sample), then publishes the JPEG on
// `window.__renderResult` for the worker to collect. No controls, no UI.

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { SceneHandle } from './Scene';
import { initialConfigState } from './ConfiguratorClient';
import type { ConfigState } from '@/lib/pricing';

const Scene = dynamic(() => import('./Scene').then(m => m.Scene), { ssr: false });

export type RenderResult = { dataUrl: string; samples: number; ms: number };
declare global {
  interface Window { __renderResult?: RenderResult; __renderError?: string }
}

type Props = {
  productKey: string;
  /** Product scene id (car, container, extension, ...) or null. */
  scene: string | null;
  /** The quoted configuration; when absent the product's defaults are rendered. */
  state?: ConfigState | null;
  schema?: Record<string, unknown>;
  samples: number;
  maxMs: number;
  width: number;
  height: number;
};

export function RenderClient(props: Props) {
  const sceneRef = useRef<SceneHandle>(null);
  const [status, setStatus] = useState('loading scene');
  const [state] = useState<ConfigState>(() => props.state ?? initialConfigState(props.productKey, props.schema ?? {}));

  useEffect(() => {
    let cancelled = false;
    let firstSampleAt = 0;
    let finished = false;
    const t0 = performance.now();
    const finish = (samples: number) => {
      if (finished) return;
      finished = true;
      const dataUrl = sceneRef.current?.photoDataUrl();
      if (!dataUrl) { window.__renderError = 'no photo output'; setStatus('failed: no photo output'); return; }
      window.__renderResult = { dataUrl, samples: Math.floor(samples), ms: Math.round(performance.now() - t0) };
      setStatus(`done: ${Math.floor(samples)} samples`);
    };
    // Wait for the scene's assets (HDRI, textures) before starting the tracer.
    const waitStart = performance.now();
    const tick = window.setInterval(() => {
      if (cancelled) return;
      if (!sceneRef.current?.photoSupported()) {
        if (performance.now() - waitStart > 90_000) { window.__renderError = 'photo mode unavailable'; setStatus('failed: photo mode unavailable'); window.clearInterval(tick); }
        return;
      }
      window.clearInterval(tick);
      // A few extra seconds so late textures and models are in the traced scene.
      window.setTimeout(() => {
        if (cancelled) return;
        setStatus('rendering');
        sceneRef.current?.startPhoto(
          samples => {
            if (samples >= 1 && !firstSampleAt) firstSampleAt = performance.now();
            setStatus(`rendering: ${Math.floor(samples)} samples`);
            if (samples >= props.samples || (firstSampleAt && performance.now() - firstSampleAt > props.maxMs)) finish(samples);
          },
          () => { if (!finished) { window.__renderError = 'photo mode ended early'; setStatus('failed: ended early'); } },
        );
      }, 4000);
    }, 500);
    return () => { cancelled = true; window.clearInterval(tick); };
  }, [props.samples, props.maxMs]);

  return (
    <div style={{ width: props.width, height: props.height, background: '#0e1116', position: 'relative' }}>
      <Scene
        ref={sceneRef}
        state={state}
        scene={props.scene}
        view="iso"
        time={13}
        spin={false}
        roofOpen={false}
        quality="high"
        frameScale={0.82}
      />
      <div data-render-status style={{ position: 'absolute', left: 8, bottom: 8, font: '12px monospace', color: '#fff', opacity: 0.6 }}>{status}</div>
    </div>
  );
}
