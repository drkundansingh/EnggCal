// Stamps a unique BUILD_ID into service-worker.js so every deploy produces
// a new cache name and the previous cache is purged on activate.
//
// Run this before uploading:  node stamp-build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const id = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
const path = './service-worker.js';
let sw = readFileSync(path, 'utf8');

// Replace either the placeholder (first run) or a previously stamped id.
const before = sw;
sw = sw.replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${id}';`);

if (sw === before) {
  console.error('Could not find BUILD_ID line in service-worker.js — not stamped.');
  process.exit(1);
}
writeFileSync(path, sw);
console.log(`Stamped BUILD_ID = ${id}  (cache name: enghub-${id})`);
