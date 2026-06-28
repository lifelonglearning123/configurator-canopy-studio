// Dev-only endpoint that writes product thumbnail JPGs into public/products/.
// Called by the standalone configurator's `#dumpthumbs` flow.
//
// Refuses to run in production: snapshots must be committed to the repo, not
// written to a serverless filesystem at runtime.

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'dev_only' }, { status: 403 });
  }

  let body: { thumbnails?: Record<string, string> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const thumbs = body.thumbnails ?? {};
  const outDir = join(process.cwd(), 'public', 'products');
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
  for (const [key, dataUrl] of Object.entries(thumbs)) {
    // Accept only safe slug-ish keys to keep this from writing outside outDir.
    if (!/^[a-z0-9-]+$/.test(key)) continue;
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl);
    if (!m) continue;
    const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
    const bytes = Buffer.from(m[2], 'base64');
    await writeFile(join(outDir, `${key}.${ext}`), bytes);
    written.push(`${key}.${ext}`);
  }

  return NextResponse.json({ ok: true, written });
}
