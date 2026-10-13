// Encode every public/textures/*.jpg to a sibling .ktx2 (Basis Universal ETC1S)
// so the scene can upload GPU-native compressed textures (about 1 MB of GPU
// memory per 1K map instead of 5 MB). JPEGs stay as the fallback.
//   npm run textures:ktx2            (skips files whose .ktx2 is newer than the .jpg)
//   _color maps are flagged sRGB; _normal maps use the encoder's normal-map tuning.
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'public/textures';
const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
let total = 0, totalJpg = 0, encoded = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()) {
  const src = join(dir, f), out = join(dir, f.replace(/\.jpg$/, '.ktx2'));
  totalJpg += statSync(src).size;
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) { total += statSync(out).size; continue; }
  const kind = f.includes('_color') ? 'srgb' : f.includes('_normal') ? 'normal' : 'linear';
  const data = await encodeToKTX2(new Uint8Array(readFileSync(src)), {
    imageDecoder, generateMipmap: true, isUASTC: false, compressionLevel: 2,
    qualityLevel: kind === 'normal' ? 200 : 160,
    isSetKTX2SRGBTransferFunc: kind === 'srgb',
    ...(kind === 'normal' ? { isNormalMap: true } : {}),
  });
  writeFileSync(out, data);
  total += data.length; encoded++;
  console.log(`${f} -> ${Math.round(data.length / 1024)} KB [${kind}]`);
}
console.log(`${encoded} encoded; ktx2 total ${Math.round(total / 1024)} KB vs jpg ${Math.round(totalJpg / 1024)} KB`);
