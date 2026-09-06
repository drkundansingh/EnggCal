// audit_fuzz.mjs — systematic robustness audit across every calculator
// module. For each exported function, extracts its parameter names (from
// destructured object params or positional names) and tries a battery of
// boundary/garbage argument sets. Flags:
//   BAD:  returns a numeric result containing NaN/Infinity without throwing
//   BAD:  throws a raw JS error (TypeError etc.) instead of a clear,
//         human-readable validation Error
//   OK:   throws a clear Error with a message (expected for bad input)
//   OK:   returns a valid, finite result (input was actually valid)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'js', 'calculators');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

function extractFunctionSignatures(src) {
  const fns = [];
  // export function name({ a, b, c }) {  or  export function name(a, b) {
  const re = /export function (\w+)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, argsRaw] = m;
    fns.push({ name, argsRaw: argsRaw.trim() });
  }
  return fns;
}

function parseParamNames(argsRaw) {
  // Destructured object: { a, b = 5, c }
  const destructMatch = argsRaw.match(/^\{([\s\S]*)\}$/);
  if (destructMatch) {
    return destructMatch[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split('=')[0].trim())
      .filter((p) => p && !p.startsWith('...'));
  }
  // Positional: a, b, c = 5
  if (!argsRaw) return [];
  return argsRaw.split(',').map((p) => p.trim().split('=')[0].trim()).filter(Boolean);
}

const BOUNDARY_SETS = {
  zeros: () => 0,
  negatives: () => -5,
  tiny: () => 1e-12,
  huge: () => 1e12,
  nan: () => NaN,
};

let totalCalls = 0, badResults = [];

for (const file of files) {
  const full = path.join(dir, file);
  const src = fs.readFileSync(full, 'utf8');
  const fns = extractFunctionSignatures(src);
  if (!fns.length) continue;
  const mod = await import(`../js/calculators/${file}`);

  for (const { name, argsRaw } of fns) {
    const fn = mod[name];
    if (typeof fn !== 'function') continue;
    const isDestructured = argsRaw.trim().startsWith('{');
    const paramNames = parseParamNames(argsRaw);
    if (!paramNames.length && !isDestructured) continue; // zero-arg functions, skip

    for (const [setName, valueFn] of Object.entries(BOUNDARY_SETS)) {
      totalCalls++;
      try {
        let result;
        if (isDestructured) {
          const obj = {};
          for (const p of paramNames) obj[p] = valueFn();
          result = fn(obj);
        } else {
          const args = paramNames.map(() => valueFn());
          result = fn(...args);
        }
        // Function returned without throwing -- check for silent NaN/Infinity leakage.
        const flat = JSON.stringify(result);
        if (flat && (/\bnull\b/.test(flat) === false) && (flat.includes('NaN') || /\be\+?\d{3,}/.test(flat))) {
          // JSON.stringify can't represent NaN/Infinity (become null), so
          // check the actual object values directly instead.
        }
        const hasNonFinite = (() => {
          function walk(v) {
            if (typeof v === 'number') return !Number.isFinite(v);
            if (v && typeof v === 'object') return Object.values(v).some(walk);
            return false;
          }
          return walk(result);
        })();
        if (hasNonFinite) {
          badResults.push({ file, name, setName, issue: 'silent NaN/Infinity in result', result: JSON.stringify(result).slice(0, 200) });
        }
      } catch (e) {
        const isCleanError = e instanceof Error && e.message && !/Cannot read propert|is not a function|is not defined|undefined is not|reduce of empty array/.test(e.message);
        if (!isCleanError) {
          badResults.push({ file, name, setName, issue: 'unhelpful raw JS error', message: e.message });
        }
      }
    }
  }
}

console.log(`Fuzzed ${totalCalls} (function x boundary-set) combinations across ${files.length} modules.\n`);
if (badResults.length === 0) {
  console.log('CLEAN: no silent NaN/Infinity leakage, no unhelpful raw JS errors found.');
} else {
  console.log(`FOUND ${badResults.length} ISSUE(S):\n`);
  for (const b of badResults) {
    console.log(`[${b.file}] ${b.name}(${b.setName}) -- ${b.issue}`);
    console.log(`    ${b.message || b.result}`);
  }
}
