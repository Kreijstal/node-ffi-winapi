'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// These tests call the real DLLs and callbacks. Metadata tests run on any OS.
test('Windows bindings, reflection, and window callbacks', {skip:process.platform !== 'win32'}, async t => {
  const library=require('../winapi');
  const {fn,winapicore:core}=await library.done;
  await t.test('discovery and signature reflection do not load DLLs or cache the Win32 tree', () => {
    const before=Object.keys(core.dll);
    assert.equal('CreateWindowExA' in core.functions,true);
    assert.ok(Object.keys(core.functions).includes('GetCurrentProcessId'));
    assert.ok(Object.keys(fn).includes('CreateWindowExA'));
    assert.equal(core.reflection.get('functions','CreateWindowExA').Params.length,12);
    assert.deepEqual(Object.keys(core.dll),before);
    assert.equal(Object.keys(require.cache).filter(p=>/[\\/]win32json[\\/]api[\\/]/.test(p)).length,0);
    assert.ok(core.reflection.stats().indexShards<=4);
    assert.ok(core.reflection.stats().records<=16);
  });
  await t.test('bindings and legacy deref return the same cached callable', () => {
    assert.equal(fn.GetCurrentProcessId(),process.pid);
    assert.equal(core.functions.GetCurrentProcessId.deref(),fn.GetCurrentProcessId);
    assert.equal(core.bind('GetCurrentProcessId','System.Threading'),fn.GetCurrentProcessId);
    assert.equal(fn.DefinitelyNotAWin32Function,undefined);
    assert.equal(core.functions.GetCurrentProcessId.type.Params.length,0);
  });
  await t.test('native constants resolve without changing shared ref-napi types', () => {
    assert.equal(core.wintypes.UInt32.constants.WM_PAINT,15);
    assert.equal(core.wintypes.Int32.constants.CW_USEDEFAULT,-2147483648);
    assert.equal(core.wintypes.UInt32.constants.CW_USEDEFAULT,undefined);
    assert.equal(Object.hasOwn(core.ref.types.uint32,'constants'),false);
    assert.equal(core.wintypes.WINDOW_STYLE.values.WS_VISIBLE,0x10000000);
    assert.equal(core.wintypes[Symbol.toStringTag],undefined);
  });
  await t.test('qualified enum types preserve namespace collisions', () => {
    const namespaces=['NetworkManagement.NetworkPolicyServer','Security.Authentication.Identity.Provider'];
    const types=namespaces.map(api=>core.resolveType('IDENTITY_TYPE',api));
    assert.notEqual(types[0],types[1]);
    namespaces.forEach((api,i)=>assert.deepEqual(types[i].values,Object.fromEntries(
      core.reflection.get('types','IDENTITY_TYPE',{api}).Values.map(v=>[v.Name,v.Value]))));
    assert.throws(()=>core.wintypes.IDENTITY_TYPE,/Ambiguous/);
  });
  await t.test('explicit custom metadata remains usable', async () => {
    core.procedureConvertApiFromJSON({Types:[{Name:'WINFFI_TEST_ENUM',Kind:'Enum',IntegerBase:'UInt32',
      Architectures:[],Values:[{Name:'FLAG',Value:2}]}],
      Constants:[{Name:'WINFFI_TEST_CONSTANT',Type:{Name:'WINFFI_TEST_ENUM'},Value:7}]});
    const type=await core.wintypes.attr('WINFFI_TEST_ENUM');
    assert.equal(type.values.FLAG,2);
    assert.equal(type.constants.WINFFI_TEST_CONSTANT,7);
    assert.ok(Object.keys(type.constants).includes('WINFFI_TEST_CONSTANT'));
  });
  await t.test('recursive pointers and anonymous unions have usable native layouts', () => {
    const record=core.resolveType('EXCEPTION_RECORD','System.Diagnostics.Debug');
    assert.equal(record.fields.ExceptionRecord.type.indirection,2);
    assert.equal(Object.getPrototypeOf(record.fields.ExceptionRecord.type),record);
    assert.equal(new record().ref().length,152);
    const input=new core.wintypes.INPUT();
    input.type=1;
    input.ki.wVk=65;
    assert.equal(input.Anonymous.ki.wVk,65);
    assert.equal(input.ref().length,core.wintypes.INPUT.size);
  });
  await t.test('register, create, dispatch, and destroy a real window', () => {
    const types=core.wintypes;
    const name=Buffer.from(`WinFfiTest${process.pid}\0`);
    let callbacks=0;
    const callback=(hwnd,msg,w,l)=>{callbacks++;return fn.DefWindowProcA(hwnd,msg,w,l);};
    const cls=new types.WNDCLASSA();
    cls.lpfnWndProc=callback;
    cls.lpszClassName=name;
    assert.equal(cls.ref().length,process.arch==='x64'?72:40);
    assert.ok(fn.RegisterClassA(cls.ref()));
    let hwnd;
    try {
      hwnd=fn.CreateWindowExA(0,name,name,0,0,0,100,100,0,0,0,core.ref.NULL);
      assert.ok(hwnd);
      assert.ok(callbacks>0);
      const msg=new types.MSG();
      for(let i=0;i<100&&fn.PeekMessageA(msg.ref(),0,0,0,1);i++) {
        fn.TranslateMessage(msg.ref());fn.DispatchMessageA(msg.ref());
      }
    } finally {
      if(hwnd) assert.ok(fn.DestroyWindow(hwnd));
      fn.UnregisterClassA(name,0);
    }
  });
});

// Native finalizers run after the test runner reports results. Exercise a separate
// process so a shutdown access violation becomes a failing test.
test('window callbacks allow a standalone process to exit normally', {skip:process.platform !== 'win32'}, () => {
  const {spawnSync}=require('node:child_process');
  const path=require('node:path');
  const env={...process.env};
  delete env.WINFFI_BENCH_OUTPUT;
  const child=spawnSync(process.execPath,[path.join(__dirname,'../scripts/benchmark-windows.js')],
    {encoding:'utf8',timeout:30000,env});
  assert.ifError(child.error);
  assert.equal(child.status,0,`Window process exited with ${child.status} (${child.signal}): ${child.stderr}`);
  const report=JSON.parse(child.stdout);
  assert.equal(report.iterations.length,3);
  assert.ok(report.iterations.every(iteration=>iteration.callbacks>0));
});
