// Default option schema per catalog product, mirroring
// products.default_schema_json in the seed migrations. The database is the
// source of truth for tenant routes; this copy serves the dev scene, the
// thumbnail generator and the headless render page, which must work without
// a database connection.
export const PRODUCT_SCHEMAS: Record<string, Record<string, unknown>> = {
  pergola:           { structure: 'freestanding', roof: 'louvred-retract' },
  veranda:           { structure: 'wallmounted',  roof: 'glass-sloped' },
  'veranda-glass':   { structure: 'wallmounted',  roof: 'glass-sloped' },
  'veranda-poly':    { structure: 'wallmounted',  roof: 'poly-sloped' },
  carport:           { structure: 'freestanding', roof: 'poly-sloped', scene: 'car' },
  'carport-premium': { structure: 'freestanding', roof: 'solid-alu',   scene: 'car' },
  studio:            { structure: 'freestanding', roof: 'glass-flat' },
  awning:            { structure: 'wallmounted',  roof: 'fabric-retract', scene: 'awning' },
  container:         { structure: 'freestanding', scene: 'container' },
  fence:             { scene: 'fence' },
  garage:            { structure: 'wallmounted',  scene: 'garage' },
  glassroom:         { structure: 'freestanding', roof: 'glass-flat' },
  enclosure:         { structure: 'freestanding', roof: 'glass-sloped' },
  extension:         { structure: 'wallmounted',  scene: 'extension' },
};

export function productSchema(key: string): Record<string, unknown> {
  if (key.startsWith('conservatory-')) {
    return { scene: key, structure: 'wallmounted', roof: key === 'conservatory-orangery' ? 'glass-flat' : 'glass-sloped' };
  }
  return { ...(PRODUCT_SCHEMAS[key] ?? PRODUCT_SCHEMAS.veranda) };
}
