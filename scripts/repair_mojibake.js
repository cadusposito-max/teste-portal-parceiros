const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_EXTS = new Set(['.js', '.html', '.css', '.json', '.md', '.webmanifest']);
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const CP1252_TO_BYTE = new Map([
  [0x20AC, 0x80], [0x201A, 0x82], [0x0192, 0x83], [0x201E, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02C6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8A], [0x2039, 0x8B], [0x0152, 0x8C],
  [0x017D, 0x8E], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93],
  [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02DC, 0x98], [0x2122, 0x99], [0x0161, 0x9A], [0x203A, 0x9B],
  [0x0153, 0x9C], [0x017E, 0x9E], [0x0178, 0x9F],
]);

const suspectPattern = /[\u00C2-\u00F4\u0192\u201A\u201E\u2026\u2020\u2021\u02C6\u2030\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u203A\u0153\u017E\u0178\u00A1-\u00BF\uFFFD]/;
const junkPattern = /[\u0192\u201A\u201E\u2026\u2020\u2021\u02C6\u2030\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u203A\u0153\u017E\u0178\u00A1-\u00BF]/g;
const c3JunkPattern = /\u00C3[\u00A1-\u00BF\u0192]/g;
const c2JunkPattern = /\u00C2[\u00A1-\u00BF\u0192]/g;

const hardFixes = [
  [/\bUsu\uFFFDrio\b/g, 'Usu\u00e1rio'],
  [/\s\uFFFD\s/g, ' \u2022 '],
  [/\bUltimo acesso\b/g, '\u00daltimo acesso'],
];

function collectFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.idea') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (TARGET_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function decodeWin1252AsUtf8(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_TO_BYTE.get(code);
    if (mapped === undefined) return str;
    bytes.push(mapped);
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.includes('\uFFFD')) return str;
  return decoded;
}

function artifactCount(str) {
  let score = 0;
  const replacements = str.match(/\uFFFD/g);
  if (replacements) score += replacements.length * 4;

  const junk = str.match(junkPattern);
  if (junk) score += junk.length * 2;

  const c3Junk = str.match(c3JunkPattern);
  if (c3Junk) score += c3Junk.length * 2;

  const c2Junk = str.match(c2JunkPattern);
  if (c2Junk) score += c2Junk.length * 2;

  return score;
}

function accentCount(str) {
  const accents = str.match(/[\u00C0-\u017F]/g);
  return accents ? accents.length : 0;
}

function isBetter(candidate, best) {
  const candArtifact = artifactCount(candidate);
  const bestArtifact = artifactCount(best);
  if (candArtifact < bestArtifact) return true;
  if (candArtifact > bestArtifact) return false;
  return accentCount(candidate) > accentCount(best);
}

function fixSegment(segment) {
  if (!suspectPattern.test(segment)) return segment;

  const original = segment;
  let best = original;
  let current = original;

  for (let i = 0; i < 5; i++) {
    const decoded = decodeWin1252AsUtf8(current);
    if (decoded === current) break;
    if (isBetter(decoded, best)) {
      best = decoded;
      if (artifactCount(best) === 0) break;
    }
    current = decoded;
  }

  return best;
}

function applyHardFixes(content) {
  let out = content;
  for (const [pattern, replacement] of hardFixes) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function fixContent(content) {
  const decoded = content.replace(/[^\s]+/g, fixSegment);
  return applyHardFixes(decoded);
}

function run() {
  const files = collectFiles(ROOT);
  let changed = 0;
  let touched = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const fixed = fixContent(raw);
    if (fixed !== raw) {
      fs.writeFileSync(file, fixed, 'utf8');
      changed++;
      touched += (raw.match(suspectPattern) || []).length;
      console.log(`fixed: ${path.relative(ROOT, file)}`);
    }
  }

  console.log(`done: ${changed} files changed, ${touched} suspicious chars processed`);
}

run();
