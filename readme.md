#winffiapi

ffi bindings and helper functions for win32api.
-----
Okay so you're probably wondering why this exist, if there is already another package that handles the windows ffi api https://github.com/waitingsong/node-win32-api
The reason is, well, I don't know typescript, and I wanted to understand the win32 api myself anyway.
Typescript is not compatible with the way I work, since I tend to use the repl a bit too much. and yes I know you can use typescript on the repl, but I like the idea of interpreted languages, not of compiled languages, if I wanted a compiled languages I would use rust.
I do have to document the utilities that make it easier to use, but otherwise just use this as the bindings. No, not all of them are implemented. Read the code to see how everything works, create an issue if you have questions.

## Loading and reflection

The complete Win32 catalog is available for reflection. Native bindings are
created only when requested; consumers do not need to redeclare signatures.

The catalog compiler writes individual metadata records to `metadata/records.jsonl`
and small sharded indexes containing their byte offsets. At runtime, detailed
records are read individually through bounded caches (four index shards and
sixteen records). API JSON files are never loaded into `require.cache`. Binding
and type caches retain only the functions and dependency types actually used.

### Discover and inspect APIs

Reflection works on any supported Node.js platform and does not import native
FFI modules or load Windows DLLs:

```js
const reflection = require('@kreijstal/winffiapi/reflection');

for (const api of reflection.list('functions', {
  api: 'UI.WindowsAndMessaging',
  prefix: 'CreateWindow'
})) {
  console.log(api.name, api.api);
}

const signature = reflection.get('functions', 'CreateWindowExA', {
  api: 'UI.WindowsAndMessaging'
});
console.log(signature.ReturnType, signature.Params);

const wndclass = reflection.get('types', 'WNDCLASSA');
const wmPaint = reflection.get('constants', 'WM_PAINT', {
  api: 'UI.WindowsAndMessaging'
});
console.log(wndclass.Fields, wmPaint.Value);
```

`list(category, options)` is an iterator over lightweight descriptions. Categories
are `functions`, `types`, and `constants`; filters include `api`, `prefix`, `kind`,
and constant `type`. Enumeration reads indexes, without reading detailed records
or constructing native types. Architecture variants are filtered for the current
process; `allArchitectures: true` includes all variants when browsing.

`get(category, name, {api})` returns an independent copy of the original metadata
record, or `undefined` for an unknown name. An ambiguous name requires its namespace.
`namespaces()` lists namespaces, `stats()` reports cache sizes, and `clearCache()`
drops metadata caches without invalidating existing native bindings.

### Call Windows APIs

```js
const winapi = require('@kreijstal/winffiapi');

async function main() {
  const {fn, winapicore} = await winapi.done;
  console.log(fn.GetCurrentProcessId());

  // Explicit qualification is available for colliding names.
  const createWindow = winapicore.bind('CreateWindowExA', 'UI.WindowsAndMessaging');
  const WNDCLASSA = winapicore.resolveType('WNDCLASSA', 'UI.WindowsAndMessaging');

  // Existing callers can still inspect and dereference the function pointer.
  console.log(winapicore.functions.CreateWindowExA.type.Params);
  console.log(createWindow === winapicore.functions.CreateWindowExA.deref());
}
main();
```

The existing `{goodies, constants, done}` exports remain available. `fn`,
`winapicore`, `wintypes`, and `reflection` are also exported directly. Await `done`
before using the window/message-loop helpers. A callable and its FFI signature
are compiled once and reused. Missing functions return `undefined` through `fn`;
explicit `bind()` throws on unknown names or unavailable DLL exports.

Type dependencies resolve by metadata namespace and process architecture. Native
constants remain available through `wintypes.UInt32.constants.WM_PAINT` and similar
properties, with individual values resolved on demand. Enum values remain under
`wintypes.WINDOW_STYLE.values`. Enumerating keys does not bind functions; accessing
all values with `Object.entries()` intentionally materializes those values. Raw
buffers retain their normal Node.js JSON serialization.

Metadata availability does not guarantee every declaration can be called: unusual
packing, calling conventions, and COM interface layouts still require native
validation. The native checks currently cover Windows x64 window creation and
callbacks, constants, recursive structures, anonymous unions, and normal process
exit after window callbacks. Native dependencies are pinned to compatible Git
commits and `ffi-napi` shares the same upstream `ref-napi` instance. The newer
`btsimonh/ref-napi` fork was excluded after a Windows process-shutdown crash in
the window benchmark; upstream still uses large native pointer views, so keeping
the metadata catalog out of the JavaScript heap remains important.

## Building and validating

Use Node.js 20.19 or newer. From a source checkout:

```sh
git submodule update --init --depth 1
npm ci
npm run build:metadata
npm test
```

`prepare` builds the catalog for installation from Git. Published packages include
the compiled catalog, so reflection does not require the source submodule. Rebuild
after changing the Win32 metadata, with application processes stopped. Generated
catalog files are ignored by Git and included in the npm package.

On Windows, `npm run test:windows` exercises real DLLs and callbacks. For performance
measurements, run `npm run benchmark:windows` from an interactive Windows desktop
(or RDP session). It measures startup, heap usage, and three window create/show/
dispatch/destroy cycles, including first-use binding costs. To compare another
checkout using the same benchmark, pass its `winapi.js` path:

```sh
node scripts/benchmark-windows.js C:/path/to/baseline/winapi.js
```
