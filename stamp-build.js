// Stamps a unique BUILD_ID across every file that needs it, so each deploy
// gets a fresh service-worker cache name AND a visible version number you
// can check in the running app.
//
// Run before every upload:  node stamp-build.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const id = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
let touched = 0;

function stamp(path, pattern, replacement) {
  if (!existsSync(path)) { console.warn(`  skipped (missing): ${path}`); return; }
  const before = readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before) { console.warn(`  WARNING: no match in ${path} — not stamped`); return; }
  writeFileSync(path, after);
  console.log(`  stamped ${path}`);
  touched++;
}

console.log(`Build ID: ${id}`);
stamp('./service-worker.js', /const BUILD_ID = '[^']*';/, `const BUILD_ID = '${id}';`);
stamp('./js/app.js',         /const APP_BUILD = '[^']*';/, `const APP_BUILD = '${id}';`);
stamp('./version.json',      /"build"\s*:\s*"[^"]*"/,      `"build": "${id}"`);
stamp('./reset.html',        /Build on server: [^']*'/,     `Build on server: ${id}'`);

if (!touched) { console.error('Nothing was stamped — check the files exist.'); process.exit(1); }
console.log(`\nDone. Cache name will be: enghub-${id}`);
console.log('Now commit and upload — INCLUDING service-worker.js, reset.html and .htaccess.');
