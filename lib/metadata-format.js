'use strict';

const VERSION = 1;
const SHARDS = 256;
const CATEGORIES = ['types', 'functions', 'constants'];

function shardFor(name) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) % SHARDS;
}

module.exports = {VERSION, SHARDS, CATEGORIES, shardFor};
