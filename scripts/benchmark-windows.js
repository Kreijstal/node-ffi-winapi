'use strict';

// Run on the interactive Windows desktop to include real window messages.
const {performance} = require('node:perf_hooks');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  if (process.platform !== 'win32') throw new Error('Run this benchmark on Windows.');
  const originalLog = console.log;
  let logCalls = 0;
  console.log = () => { logCalls++; };
  try {
    const start = performance.now();
    const library = require(process.argv[2] ? path.resolve(process.argv[2]) : '../winapi');
    const {fn,winapicore:core} = await library.done;
    const report = {startupMs:performance.now()-start, heapMiB:process.memoryUsage().heapUsed/1024**2,
      architecture:process.arch, iterations:[]};
    const types=core.wintypes;
    // Binding lookup is included on first use; subsequent iterations reuse CIFs.
    for (let iteration=0;iteration<3;iteration++) {
      const sample={};
      const timed=(name,action)=>{const start=performance.now();const value=action();sample[name]=performance.now()-start;return value;};
      let callbacks=0;
      const callback=(hwnd,msg,w,l)=>{callbacks++;return fn.DefWindowProcA(hwnd,msg,w,l);};
      const name=Buffer.from(`WinFfiBenchmark${process.pid}_${iteration}\0`);
      const cls=new types.WNDCLASSA();
      cls.lpfnWndProc=callback;
      cls.lpszClassName=name;
      if(!timed('registerMs',()=>fn.RegisterClassA(cls.ref()))) throw new Error('RegisterClassA failed');
      let hwnd;
      try {
        hwnd=timed('createMs',()=>fn.CreateWindowExA(0,name,name,0x00cf0000,100,100,400,200,0,0,0,core.ref.NULL));
        if(!hwnd) throw new Error('CreateWindowExA failed');
        timed('showMs',()=>fn.ShowWindow(hwnd,5));
        const message=new types.MSG();
        timed('pumpMs',()=>{let count=0;while(count++<500&&fn.PeekMessageA(message.ref(),0,0,0,1)) {
          fn.TranslateMessage(message.ref());fn.DispatchMessageA(message.ref());
        }});
      } finally {
        if(hwnd) timed('destroyMs',()=>fn.DestroyWindow(hwnd));
        fn.UnregisterClassA(name,0);
      }
      sample.callbacks=callbacks;
      report.iterations.push(sample);
    }
    report.catalog=core.reflection?.stats();
    report.suppressedLogCalls=logCalls;
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.env.WINFFI_BENCH_OUTPUT) fs.writeFileSync(process.env.WINFFI_BENCH_OUTPUT,json);
    process.stdout.write(json);
  } finally { console.log=originalLog; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
