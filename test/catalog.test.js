'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {buildMetadata} = require('../scripts/build-metadata');
const {MetadataCatalog} = require('../lib/metadata-catalog');
const {lazyRegistry} = require('../lib/lazy-registry');

function fixture(t, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'winffi-catalog-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const source = path.join(root, 'api');
  const output = path.join(root, 'metadata');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'A.json'), JSON.stringify({Types:[
    {Name:'Wide', Kind:'Struct', Architectures:['X64'], Fields:[], Documentation:'日本語'},
    {Name:'Wide', Kind:'Struct', Architectures:['X86'], Fields:[{Name:'x86'}]},
    {Name:'Shared', Kind:'Enum', Architectures:[], Values:[]}],
    Functions:[{Name:'GetThing', Params:[], DllImport:'example', ReturnType:{Kind:'Native',Name:'UInt32'}}],
    Constants:[{Name:'ANSWER', Type:{Name:'UInt32'}, Value:42}]}));
  fs.writeFileSync(path.join(source,'B.json'), JSON.stringify({Types:[
    {Name:'Shared', Kind:'Struct', Architectures:[], Fields:[]}],
    Functions:[{Name:'Next', Params:[], DllImport:'example'}], Constants:[]}));
  buildMetadata(source, output);
  return {output, catalog: new MetadataCatalog(output, options)};
}

test('byte offsets preserve Unicode records and select architecture variants', t => {
  const {catalog, output} = fixture(t, {architecture:'x64'});
  assert.equal(catalog.get('types','Wide').Documentation, '日本語');
  assert.equal(catalog.get('functions','GetThing').DllImport,'example');
  const x86 = new MetadataCatalog(output, {architecture:'ia32'});
  assert.equal(x86.get('types','Wide').Fields[0].Name,'x86');
});
test('qualified lookup disambiguates namespace collisions', t => {
  const {catalog}=fixture(t);
  assert.equal(catalog.has('types','Shared'),true);
  assert.throws(()=>catalog.get('types','Shared'), /Ambiguous/);
  assert.equal(catalog.get('types','Shared',{api:'B'}).Kind,'Struct');
  assert.equal(catalog.get('types','Missing'),undefined);
});
test('enumeration exposes signatures by name without reading any records', t => {
  const {catalog}=fixture(t);
  assert.deepEqual([...catalog.list('functions',{api:'A',prefix:'Get'})].map(x=>x.name),['GetThing']);
  assert.equal([...catalog.list('constants',{type:'UInt32'})][0].name,'ANSWER');
  assert.equal(catalog.stats().recordReads,0);
  assert.equal(catalog.stats().records,0);
  assert.ok(catalog.stats().indexShards<=4);
});
test('both caches stay bounded and returned metadata cannot mutate later reads', t => {
  const {catalog}=fixture(t,{recordCacheSize:1,indexCacheSize:1});
  const record=catalog.get('functions','GetThing');
  record.Params.push({Name:'corruption'});
  assert.equal(catalog.get('functions','GetThing').Params.length,0);
  catalog.get('functions','Next');
  catalog.get('types','Wide');
  assert.equal(catalog.stats().records,1);
  assert.equal(catalog.stats().indexShards,1);
  catalog.clearCache();
  assert.equal(catalog.stats().records,0);
});
test('catalog rejects a truncated record instead of returning partial metadata', t => {
  const {catalog,output}=fixture(t);
  fs.truncateSync(path.join(output,'records.jsonl'),0);
  assert.throws(()=>catalog.get('types','Wide'),/Truncated/);
});
test('registry inspection does not construct values', () => {
  let resolved=0;
  const registry=lazyRegistry({has:name=>name==='A',names:()=>['A'],resolve:()=>{resolved++;return {value:1};}});
  assert.equal('A' in registry,true);
  assert.deepEqual(Object.keys(registry),['A']);
  assert.equal(resolved,0);
  assert.equal(registry.A,registry.A);
  assert.equal(resolved,1);
  assert.equal(registry[Symbol.toStringTag],undefined);
});
