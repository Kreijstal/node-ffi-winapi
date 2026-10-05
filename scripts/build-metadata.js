'use strict';

// Compile one namespace at a time. The runtime reads individual records by byte
// offset, so neither bindings nor reflection need to parse whole API files.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {VERSION, SHARDS, CATEGORIES, shardFor} = require('../lib/metadata-format');

function buildMetadata(source, destination) {
  const namespaces = fs.readdirSync(source).filter(n => n.endsWith('.json')).sort();
  const indexes = Object.fromEntries(CATEGORIES.map(kind => [kind, Array.from({length: SHARDS}, () => [])]));
  const counts = Object.fromEntries(CATEGORIES.map(kind => [kind, 0]));
  const temporary = destination + '.tmp-' + process.pid;
  fs.mkdirSync(temporary, {recursive: true});
  const fd = fs.openSync(path.join(temporary, 'records.jsonl'), 'w');
  let offset = 0;
  try {
    namespaces.forEach((filename, api) => {
      const namespace = JSON.parse(fs.readFileSync(path.join(source, filename), 'utf8'));
      for (const [category, field] of [['types','Types'], ['functions','Functions'], ['constants','Constants']]) {
        for (const definition of namespace[field] || []) {
          const bytes = Buffer.from(JSON.stringify(definition) + '\n');
          let written = 0;
          while (written < bytes.length) written += fs.writeSync(fd, bytes, written, bytes.length - written);
          // name, namespace ID, byte offset, length, kind, architectures, constant type
          const entry = [definition.Name, api, offset, bytes.length, definition.Kind || category,
            definition.Architectures || [], definition.Type?.Name || null];
          indexes[category][shardFor(definition.Name)].push(entry);
          counts[category]++;
          offset += bytes.length;
        }
      }
    });
  } finally {
    fs.closeSync(fd);
  }
  for (const category of CATEGORIES) {
    fs.mkdirSync(path.join(temporary, category));
    indexes[category].forEach((entries, shard) => {
      fs.writeFileSync(path.join(temporary, category, shard + '.json'), JSON.stringify(entries));
    });
  }
  fs.writeFileSync(path.join(temporary, 'manifest.json'), JSON.stringify({version: VERSION,
    namespaces: namespaces.map(n => n.slice(0,-5)), counts, bytes: offset}));
  // Only publish a complete catalog. Existing readers must finish before rebuild.
  fs.rmSync(destination, {recursive: true, force: true});
  fs.renameSync(temporary, destination);
  return counts;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const source = path.join(root, 'win32json', 'api');
  const destination = path.join(root, 'metadata');
  if (!fs.existsSync(source) && fs.existsSync(path.join(destination, 'manifest.json'))) {
    // Published packages carry the compiled catalog and need no git checkout.
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
    if (manifest.version !== VERSION) throw new Error('Packaged Win32 catalog has an unsupported version.');
    console.log('Using packaged Win32 reflection catalog.');
  } else {
    if (!fs.existsSync(source)) {
      const result = spawnSync('git', ['submodule', 'update', '--init', '--depth', '1'], {cwd: root, stdio: 'inherit'});
      if (result.status !== 0 || !fs.existsSync(source)) {
        throw new Error('Win32 metadata is missing. Run git submodule update --init, then npm run build:metadata.');
      }
    }
    console.log('Built Win32 reflection catalog:', buildMetadata(source, destination));
  }
}

module.exports = {buildMetadata};
