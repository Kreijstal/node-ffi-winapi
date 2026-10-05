'use strict';

// This entry point works without ffi-napi or Windows. Full metadata stays on disk.
const path = require('node:path');
const {MetadataCatalog} = require('./lib/metadata-catalog');
const catalog = new MetadataCatalog(path.join(__dirname, 'metadata'));
module.exports = {
  namespaces: () => catalog.manifest.namespaces.slice(),
  list: (category, options) => catalog.list(category, options),
  get: (category, name, options) => catalog.get(category, name, options),
  clearCache: () => catalog.clearCache(),
  stats: () => catalog.stats(),
  catalog
};
