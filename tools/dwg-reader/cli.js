// SPDX-License-Identifier: GPL-3.0-only
// This standalone component uses LibreDWG; see README.md and LICENSE.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { LibreDwg } from '@mlightcad/libredwg-web';

const [inputPath, outputPath] = process.argv.slice(2);
const supported = new Set(['ARC','CIRCLE','DIMENSION','ELLIPSE','INSERT','LINE','LWPOLYLINE','MTEXT','SPLINE','TEXT','TABLE','ACAD_TABLE']);
const escapeXml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function escaped(value) {
  if (typeof value === 'string') return escapeXml(value);
  if (Array.isArray(value)) return value.map(escaped);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,escaped(v)]));
  return value;
}

try {
  if (!inputPath || !outputPath) throw new Error('input/output paths required');
  const bytes = fs.readFileSync(inputPath);
  if (bytes.length < 128 || bytes.length > 25 * 1024 * 1024 || !/^AC10\d{2}$/.test(bytes.subarray(0,6).toString('ascii'))) throw new Error('invalid DWG');
  const require = createRequire(import.meta.url);
  const wasmDirectory = path.resolve(path.dirname(require.resolve('@mlightcad/libredwg-web')), '../wasm');
  const reader = await LibreDwg.create(wasmDirectory);
  reader.FS.writeFile('input.dwg', bytes);
  const decoded = reader.dwg_read_file('input.dwg');
  if (!decoded.data || decoded.error >= 256) throw new Error('DWG could not be decoded');
  try {
    const { database, stats } = reader.convertEx(decoded.data);
    const blocks = database.tables.BLOCK_RECORD.entries;
    const model = blocks.find(b => b.name.toUpperCase() === '*MODEL_SPACE');
    if (!model || !model.entities.length) throw new Error('no model-space entities');
    const hiddenLayers = new Set(database.tables.LAYER.entries.filter(l => l.off || l.frozen).map(l => l.name));
    let skipped = stats.unknownEntityCount || 0;
    for (const block of blocks) {
      block.entities = block.entities.filter(entity => {
        if (hiddenLayers.has(entity.layer) || entity.isVisible === false) return false;
        if (!supported.has(entity.type)) { skipped++; return false; }
        return true;
      });
    }
    // Referenced block definitions must precede their users in the SVG converter.
    const byName = new Map(blocks.map(b => [b.name,b]));
    const visiting = new Set(), visited = new Set(), ordered = [];
    function visit(block, depth = 0) {
      if (visited.has(block.name)) return;
      if (visiting.has(block.name) || depth > 30) { skipped++; return; }
      visiting.add(block.name);
      for (const entity of block.entities) if (entity.type === 'INSERT' || entity.type === 'DIMENSION') {
        const dependency = byName.get(entity.name);
        if (dependency && dependency !== model) visit(dependency,depth+1);
      }
      visiting.delete(block.name); visited.add(block.name); ordered.push(block);
    }
    visit(model);
    database.tables.BLOCK_RECORD.entries = ordered;
    const svg = reader.dwg_to_svg(escaped(database));
    if (svg.length > 8 * 1024 * 1024) throw new Error('drawing preview too complex');
    fs.writeFileSync(outputPath,JSON.stringify({ svg, version:bytes.subarray(0,6).toString('ascii'), entityCount:model.entities.length, skipped, decodeWarnings:decoded.error !== 0 }));
  } finally { reader.dwg_free(decoded.data); }
} catch {
  // Do not return paths, source drawing text or WASM diagnostics to the browser.
  process.stderr.write('DWG conversion failed.\n');
  process.exitCode = 1;
}
