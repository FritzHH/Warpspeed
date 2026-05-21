// Trace polyfill consumers from rollup-plugin-visualizer stats.json
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('build/stats.json', 'utf8'));
const metas = data.nodeMetas;

// Build uid -> meta lookup (id is path)
const byUid = {};
for (const [uid, m] of Object.entries(metas)) byUid[uid] = m;

// Helper: extract npm package name from a node_modules path
function pkgFromPath(p) {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('node_modules/');
  if (idx === -1) return null;
  const rest = norm.slice(idx + 'node_modules/'.length);
  const parts = rest.split('/');
  if (parts[0].startsWith('@')) return parts[0] + '/' + parts[1];
  return parts[0];
}

// Polyfill packages we're investigating
const polyfills = [
  'browserify-sign', 'elliptic', 'bn.js', 'browserify-rsa',
  'readable-stream', 'ripemd160', 'asn1.js', 'hash.js',
  'browserify-aes', 'sha.js', 'des.js', 'util',
  'create-hash', 'create-hmac', 'crypto-browserify', 'stream-browserify',
  'buffer', 'process', 'events', 'string_decoder', 'inherits',
  'safe-buffer', 'pbkdf2', 'parse-asn1', 'evp_bytestokey',
  'cipher-base', 'md5.js', 'public-encrypt', 'randombytes',
  'randomfill', 'diffie-hellman', 'miller-rabin', 'create-ecdh',
  'hash-base'
];

// For each polyfill, find all modules belonging to it, then walk upward to find non-polyfill consumers
function isPolyfillPkg(name) {
  return polyfills.includes(name);
}

// Build reverse map: collect ancestors (BFS up importedBy) until we hit a non-polyfill package
function findExternalConsumers(targetPkg) {
  const consumers = new Map(); // consumerPkg -> Set of entry points
  const startUids = Object.entries(metas)
    .filter(([, m]) => pkgFromPath(m.id) === targetPkg)
    .map(([uid]) => uid);

  for (const startUid of startUids) {
    const visited = new Set();
    const queue = [startUid];
    while (queue.length) {
      const uid = queue.shift();
      if (visited.has(uid)) continue;
      visited.add(uid);
      const meta = byUid[uid];
      if (!meta) continue;
      for (const imp of (meta.importedBy || [])) {
        const parent = byUid[imp.uid];
        if (!parent) continue;
        const parentPkg = pkgFromPath(parent.id);
        // If parent is also a polyfill, keep walking up
        if (parentPkg && (isPolyfillPkg(parentPkg) || parentPkg === 'vite-plugin-node-polyfills')) {
          queue.push(imp.uid);
        } else if (parentPkg) {
          if (!consumers.has(parentPkg)) consumers.set(parentPkg, new Set());
          consumers.get(parentPkg).add(parent.id);
        } else {
          // App source (not in node_modules)
          if (!consumers.has('__app__')) consumers.set('__app__', new Set());
          consumers.get('__app__').add(parent.id);
        }
      }
    }
  }
  return consumers;
}

// Get module bytes per polyfill from tree
function getPolyfillSize(targetPkg) {
  let total = 0;
  for (const [, m] of Object.entries(metas)) {
    if (pkgFromPath(m.id) !== targetPkg) continue;
    for (const partUid of Object.values(m.moduleParts || {})) {
      const part = data.nodeParts[partUid];
      if (part && typeof part.renderedLength === 'number') total += part.renderedLength;
    }
  }
  return total;
}

const targets = [
  'browserify-sign', 'elliptic', 'bn.js', 'browserify-rsa',
  'readable-stream', 'ripemd160', 'asn1.js', 'hash.js',
  'browserify-aes', 'sha.js', 'des.js', 'util',
  'crypto-browserify', 'stream-browserify', 'buffer',
  'create-hash', 'create-hmac', 'pbkdf2', 'public-encrypt',
  'diffie-hellman', 'parse-asn1'
];

console.log('Polyfill consumer trace:\n');
console.log('| Polyfill | Size (raw) | Consumer packages |');
console.log('|---|---|---|');
for (const t of targets) {
  const size = getPolyfillSize(t);
  if (size === 0) continue;
  const consumers = findExternalConsumers(t);
  const list = [...consumers.keys()].sort().join(', ') || '(none found)';
  console.log(`| ${t} | ${(size/1024).toFixed(1)} KB | ${list} |`);
}
