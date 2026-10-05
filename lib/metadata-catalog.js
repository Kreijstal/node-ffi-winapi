'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {VERSION, SHARDS, CATEGORIES, shardFor} = require('./metadata-format');
const architectures = {x64: 'X64', ia32: 'X86', arm64: 'Arm64'};

class LRU {
  constructor(limit) { this.limit = limit; this.values = new Map(); }
  get(key) {
    if (!this.values.has(key)) return undefined;
    const value = this.values.get(key);
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.limit === 0) return value;
    this.values.delete(key);
    this.values.set(key, value);
    if (this.values.size > this.limit) this.values.delete(this.values.keys().next().value);
    return value;
  }
}

class MetadataCatalog {
  constructor(directory, {architecture = process.arch, indexCacheSize = 4, recordCacheSize = 16} = {}) {
    this.directory = directory;
    try { this.manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('Win32 catalog is missing. Run npm run build:metadata.', {cause: error});
      throw error;
    }
    if (this.manifest.version !== VERSION) throw new Error('Unsupported Win32 catalog version; rebuild metadata.');
    this.architecture = architectures[architecture] || architecture;
    this.indexCache = new LRU(indexCacheSize);
    this.recordCache = new LRU(recordCacheSize);
    this.recordReads = 0;
  }
  supports(entry) { return !entry[5].length || entry[5].includes(this.architecture); }
  index(category, shard) {
    if (!CATEGORIES.includes(category)) throw new TypeError('Unknown metadata category: ' + category);
    const key = category + '/' + shard;
    return this.indexCache.get(key) || this.indexCache.set(key,
      JSON.parse(fs.readFileSync(path.join(this.directory, key + '.json'), 'utf8')));
  }
  matches(category, name, {api, type, kind} = {}) {
    return this.index(category, shardFor(name)).filter(entry => entry[0] === name && this.supports(entry)
      && (api === undefined || this.manifest.namespaces[entry[1]] === api)
      && (type === undefined || entry[6] === type)
      && (kind === undefined || entry[4] === kind));
  }
  has(category, name, options) { return this.matches(category, name, options).length > 0; }
  find(category, name, options) {
    const matches = this.matches(category, name, options);
    const namespaces = new Set(matches.map(entry => entry[1]));
    if (namespaces.size > 1) throw new Error(`Ambiguous ${category} symbol ${name}; specify its api namespace.`);
    // Prefer a platform-specific definition over a generic fallback.
    return matches.find(entry => entry[5].length) || matches[0];
  }
  describe(entry) {
    return {name: entry[0], api: this.manifest.namespaces[entry[1]], kind: entry[4],
      architectures: entry[5].slice(), ...(entry[6] ? {type: entry[6]} : {})};
  }
  read(entry) {
    if (!entry) return undefined;
    const cached = this.recordCache.get(entry[2]);
    if (cached !== undefined) return structuredClone(cached);
    const bytes = Buffer.alloc(entry[3]);
    const fd = fs.openSync(path.join(this.directory, 'records.jsonl'), 'r');
    try {
      let count = 0;
      while (count < bytes.length) {
        const n = fs.readSync(fd, bytes, count, bytes.length - count, entry[2] + count);
        if (!n) throw new Error('Truncated Win32 catalog; rebuild metadata.');
        count += n;
      }
    } finally { fs.closeSync(fd); }
    this.recordReads++;
    const record = JSON.parse(bytes.toString('utf8'));
    this.recordCache.set(entry[2], record);
    return structuredClone(record);
  }
  get(category, name, options) { return this.read(this.find(category, name, options)); }
  *list(category, {api, type, prefix, kind, allArchitectures = false} = {}) {
    // Enumeration does not materialize native types, load DLLs, or read records.
    for (let shard = 0; shard < SHARDS; shard++) {
      for (const entry of this.index(category, shard)) {
        if ((!allArchitectures && !this.supports(entry))
          || (api !== undefined && this.manifest.namespaces[entry[1]] !== api)
          || (type !== undefined && entry[6] !== type)
          || (prefix !== undefined && !entry[0].startsWith(prefix))
          || (kind !== undefined && entry[4] !== kind)) continue;
        yield this.describe(entry);
      }
    }
  }
  clearCache() { this.indexCache.values.clear(); this.recordCache.values.clear(); }
  stats() { return {indexShards: this.indexCache.values.size, records: this.recordCache.values.size,
    recordReads: this.recordReads}; }
}

module.exports = {MetadataCatalog};
