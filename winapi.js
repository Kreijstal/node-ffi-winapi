var winapicore=require('./winapijson.js')
var {ffi,ref, ArrayType,Struct, Union,wintypes}=winapicore;
var util=require("node:util");
var constants={};
function MAKELANGID(p,s){
	return s<<10|p;
}
//we assume correct input
function LOWORD(i){
	return i>>16;
}
function HIWORD(i){
	return i&((1<<16)-1);
}
function HIBYTE(i){
	return i&((1<<8)-1);
}
function LOBYTE(i){
	return i>>8;
}
var macros={MAKELANGID,LOWORD,HIWORD,HIBYTE,LOBYTE};
constants.macros=macros;


function nonZero(i){return i!==0}
function isZero(i){return i===0}
var errorResults={	
	CreateWindowExA:nonZero,
	RegisterClassA:nonZero,
	GetRawInputDeviceList:_=>_==(-1>>>0)
}
const {lazyRegistry} = require('./lib/lazy-registry');
var fnproxy = lazyRegistry({
  has: name => name in winapicore.functions,
  names: () => Object.keys(winapicore.functions),
  resolve: name => winapicore.bind(name)
});


function Win32Exception(){
	var error=winapicore.functions.GetLastError.deref()();
	var errorText=Buffer.allocUnsafe(8);
	let formatmessageconstants=wintypes[winapicore.functions.FormatMessageA.type.Params[0].Type.Name].values
	errorText.type = ref.types.CString;
	//console.log("errorText",errorText)
	winapicore.functions.FormatMessageA.deref()(// use system message tables to retrieve error text
		formatmessageconstants.FORMAT_MESSAGE_FROM_SYSTEM
		// allocate buffer on local heap for error text
		|formatmessageconstants.FORMAT_MESSAGE_ALLOCATE_BUFFER
		// Important! will fail otherwise, since we're not 
		// (and CANNOT) pass insertion parameters
		|formatmessageconstants.FORMAT_MESSAGE_IGNORE_INSERTS,  
		ref.NULL,    // unused with FORMAT_MESSAGE_FROM_SYSTEM
		error,
		MAKELANGID(wintypes.UInt32.constants.LANG_NEUTRAL, wintypes.UInt32.constants.SUBLANG_DEFAULT),
		errorText,  // output 
		0, // minimum size for output buffer
		ref.NULL);   // arguments)
	return errorText.deref();
}
function errorHandling(fn,errcondition,name){
	return (..._)=>{var result;
		result=fn(..._);
		if(errcondition(result)){
			var errorText=Win32Exception();
			console.log("function errored",{name,/*arg:_,result,*/errorText});
			return result;
		}else{return result;}
	}	
}

var events=require('node:events');

var goodies={}
goodies.Win32Exception=Win32Exception;
//goodies.errorHandling=errorHandling;

 //goodies.MSG=new wintypes.MSG();
var defaultFcts={message:function(message){
	//	messages.map(_=>{//Performance cost is too great, isn't it amazing?
	//if(wintypes.msg[message.message]){
	win32messageHandler.emit(message.message,message.lParam,message.wParam);
	fnproxy.TranslateMessage(message.ref());
	fnproxy.DispatchMessageA(message.ref());
}
};
var win32messageHandler=new events();
require('./eventUtils.js').addEventUtilsToEventDispatcher(win32messageHandler);
//
win32messageHandler.uniqueOn=function(event,cb){
	if(!eventcblist[event])eventcblist[event]=[];
	if(!eventcblist[event].includes(cb)){
		eventcblist[event].push(cb);
		this.on(event,cb);
		this.conditionalOnce('removeListener',_=>remove(eventcblist[event],cb),(ev,listener)=>ev==event&&cb==listener);
	}	
}
goodies.win32messageHandler=win32messageHandler;

/*function startintervalmsgloop(){
			win32messageHandler._msgInterval=setInterval(_=>{
					var i=0;
				//Don't use GetMessage, it blocks making node unable to do anything else!
					while(current.PeekMessageA(goodies.MSG.ref(),0,0,0,constants.styles.PM_REMOVE)){
						win32messageHandler.emit("message",goodies.MSG);
					}		
				},0);
			win32messageHandler.conditionalOnce('removeListener',(events,listener)=>{
				console.log('interval removed')
				clearInterval(win32messageHandler._msgInterval);	
				win32messageHandler.conditionalOnce('newListener',startintervalmsgloop,e=>e==="message");
		},(events)=>events=="message"&&win32messageHandler.listenerCount('message')==0)

		}
		win32messageHandler.conditionalOnce('newListener',startintervalmsgloop,e=>e==="message");*/

function typePointerBuffer(p,t){
	var load=Buffer.allocUnsafe(8);
	load.writeBigUint64LE(BigInt(p));
	load.type=t;
	return load;
}
win32messageHandler.oneTimeListen("message",_=>setInterval(_=>{
	var i=0;
	//Don't use GetMessage, it blocks making node unable to do anything else!
	while(fnproxy.PeekMessageA(goodies.MSG.ref(),0,0,0,wintypes.PEEK_MESSAGE_REMOVE_TYPE.values.PM_REMOVE)){
		win32messageHandler.emit("message",goodies.MSG);
	}		
},0),_=>{clearInterval(_);return true});
const keyHandler_LL=(nCode,wParam,lParam)=>{
	//console.log("Low Level keyhandler callback being executed")
	var load=typePointerBuffer(lParam,ref.refType(wintypes.KBDLLHOOKSTRUCT))
	//console.log("Low Level keyhandler a")
	let deref=load.deref();
	//console.log("Low Level keyhandler b")
	deref=deref.deref();
	//console.log("Low Level keyhandler c")
	let json=deref.toJSON();
	//console.log("Low Level keyhandler d")
	var kbldstruct=Object.fromEntries(json);
	//console.log("Low Level keyhandler e")
	var obj={nCode,wParam,...kbldstruct};
	//console.log("Low Level keyhandler before event emit")
	win32messageHandler.emit("WH_KEYBOARD_LL",obj);
	//console.log("Low Level keyhandler after event emit")
	if(!"$codeHandle" in keyHandler_LL){
		console.log("how do you even call CallNextHookEx, no $code found")
	}
	return obj.defaultPrevent?1:fnproxy.CallNextHookEx(keyHandler_LL.$codeHandle??0, nCode, wParam, lParam);
};

win32messageHandler.oneTimeListen("WH_KEYBOARD_LL",_=>{
	const  WH_KEYBOARD_LL=13;
	//var stopgarbageColection=[];//we save the value from SetWindowsHookExA ""
	//goodies._WH_KEYBOARD_LL_storage=stopgarbageColection
	//var callback=keyHandler_LL;
	var handle=keyHandler_LL.$codeHandle=fnproxy.SetWindowsHookExA(WH_KEYBOARD_LL, keyHandler_LL, 0, 0);
	//stopgarbageColection.push(callback);
	return handle;},(HHandle)=>{
		fnproxy.UnhookWindowsHookEx(HHandle);
	        //goodies._WH_KEYBOARD_LL_storage=[];
		return true;});


//goodies.CreateWindowExA=errorHandling(fnproxy.CreateWindowExA,/*isZero*/nonZero,"CreateWindowExA")
//goodies.RegisterClassA=errorHandling(fnproxy.RegisterClassA,/*isZero*/nonZero,"RegisterClassA")
goodies.getRawInputDeviceInfo=function(hDevice,uiCommand,pData=ref.NULL){
	//if(pData==ref.NULL)
	var strsize=ref.alloc(wintypes.UINT);
	fnproxy.GetRawInputDeviceInfoA(hDevice, uiCommand, pData, strsize);
	pData=Buffer.allocUnsafe(strsize.readUint32LE());
	var gridi=errorHandling(fnproxy.GetRawInputDeviceInfoA,isZero,"GetRawInputDeviceInfoA");
	gridi(hDevice, uiCommand, pData, strsize);
	return pData;

}
goodies.getRawInputDeviceList=function getRawInputDeviceList(){
	//var gridl=errorHandling(fnproxy.GetRawInputDeviceList,_=>_==(-1>>>0));
	var nofdevices=Buffer.allocUnsafe(4); 
	fnproxy.GetRawInputDeviceList(ref.NULL,nofdevices,wintypes.RAWINPUTDEVICELIST.size);
	var devices=new (ArrayType(wintypes.RAWINPUTDEVICELIST))(nofdevices.readUint32LE())
	//var devices=Buffer.allocUnsafe(wintypes.RAWINPUTDEVICELIST.size*testtt.readUint32LE());
	fnproxy.GetRawInputDeviceList(devices.buffer,nofdevices,wintypes.RAWINPUTDEVICELIST.size);
	return devices;
}
function sleep(ms) {
	    return new Promise(resolve => setTimeout(resolve, ms));
}
var win32dependees={};
win32messageHandler.addDependency=dep=>{
	var i=win32dependees[dep]|0;
	if(i==0){
		win32messageHandler.on(dep,defaultFcts[dep]);
		win32dependees[dep]=i+1;
	}

}
win32messageHandler.removeDependency=dep=>{
	var i=win32dependees[dep]|0;
	if(--i==0){
		win32messageHandler.off(dep,defaultFcts[dep]);
		win32dependees[dep]=0
	}

}
var eventcblist={};
function remove(array, element) {
	const index = array.indexOf(element);

	if (index !== -1) {
		array.splice(index, 1);
	}
}

win32messageHandler.open=_=>{
	win32messageHandler.addDependency('message')
};
win32messageHandler.close=_=>{
	win32messageHandler.removeDependency('message')
};

function stringToFlagsParser(de,pos,neg){
		return str=>str.split('').reduce((a,b)=>(a|(pos[b]))&~neg[b],de)
	} 

var hotkeyflagparser;

var done=winapicore.done.then(_=>{
	goodies.MSG=new wintypes.MSG();
	hotkeyflagparser=stringToFlagsParser(wintypes.HOT_KEY_MODIFIERS.values.MOD_NOREPEAT,
	{"^":wintypes.HOT_KEY_MODIFIERS.values.MOD_CONTROL,"#":8,
	"!":wintypes.HOT_KEY_MODIFIERS.values.MOD_ALT,"+":wintypes.HOT_KEY_MODIFIERS.values.MOD_SHIFT},
	{"?":wintypes.HOT_KEY_MODIFIERS.values.MOD_NOREPEAT});
	win32messageHandler.on(wintypes.UInt32.constants.WM_HOTKEY,onhotkey);
	//after this anytime WM_HOTKEY:^b is being listened, it will be emitted
	win32messageHandler.oneTimeListen("WM_HOTKEY:^b",([str])=>{
		var [_,str2,str3]=str.match(/:([\^#?+!]+)([A-z]+)$/);
		var i,wVk;
		if(win32messageHandler.hotkeyArray.holes.length>0){win32messageHandler.hotkeyArray[i=win32messageHandler.hotkeyArray.holes.pop()]=str;
		}
		else i=win32messageHandler.hotkeyArray.push(str)-1;
		if(str3.length==1){
			let u=str3.toUpperCase().charCodeAt();
			wVk=u;//if not in 0x30<u<0x59 what else can we do anyway, throw an error?
		}else{
			wVk=Object.entries(wintypes.VIRTUAL_KEY.values).find(([k,v])=>new RegExp(str3,'i').test(k))[1];
		}
		if (fnproxy.RegisterHotKey(0, i, hotkeyflagparser(str2), wVk)) {
			console.log("Hotkey "+str2+str3+" registered\n");
		};
		return i;
	},id=>{
		if(id==win32messageHandler.hotkeyArray.length){
		win32messageHandler.hotkeyArray.pop()
	}else{
		win32messageHandler.hotkeyArray.holes.push(id)
		delete win32messageHandler.hotkeyArray[id];
	}
		fnproxy.UnregisterHotKey(id);
	});
	
});


win32messageHandler.hotkeyArray=[];
	win32messageHandler.hotkeyArray.holes=[];
	function onhotkey(lParam,hotkeyID){
		console.log("Hello, does this even get executed?")
		var c=constants.macros.HIWORD(lParam)
		var str=`${c&MOD_CONTROL?"{Control Up}":""}${c&MOD_SHIFT?"{Shift Up}":""}${c&MOD_ALT?"{Alt Up}":""}${c&MOD_WIN?"{Windows Up}":""}`
		if(str.length>0)
		goodies.sendInputAhkSync(str);
		win32messageHandler.emit(win32messageHandler.hotkeyArray[hotkeyID],lParam);
	}
		
	

goodies.createWindow=function createWindow(params){
	var window=new events();
	require('./eventUtils.js').addEventUtilsToEventDispatcher(window);

	var WindowProc=
		(hwnd, uMsg, wParam, lParam) => {
			//console.log('WndProc callback',winapi.msg[uMsg],uMsg.toString(16),"wParam:",wParam,"lParam:",ref.address(lParam));
			let result = 0;
			var obj={hwnd,wParam,lParam};
			window.emit("message",{uMsg,...obj});
			//console.log(uMsg," Window message")
			window.emit(uMsg,obj);
			if(obj.preventDefaulted){
				result=obj.result;
			}else
			{
				result = fnproxy.DefWindowProcA(hwnd, uMsg, wParam, lParam); 
			}
			//console.info('Sending LRESULT: ' + result) 
			return result
		};
	
	window.WindowProc=WindowProc;
	var wClass=new wintypes.WNDCLASSA();
	//wClass.cbSize=wClass.ref().byteLength;
	var sclass=params.className;//Buffer.from("Okay let's change this\0",'ucs2');
	wClass.lpfnWndProc=WindowProc;
	wClass.lpszClassName=sclass;
	if(fnproxy.RegisterClassA(wClass.ref())){
		//var dStyle= constants.styles.WS_CAPTION|constants.styles.WS_SYSMENU;

		var hwnd=fnproxy.CreateWindowExA(
			params.ExStyle,
			sclass,
			params.title,
			params.Style,
			params.X,
			params.Y,
			params.nWidth,
			params.nHeight,
			params.hWndParent,
			params.hMenu,
			params.hInstance,
			params.lParam);
		window.hwnd=hwnd;

		//params.hWndParent);
		if(hwnd){
			fnproxy.ShowWindow(hwnd,params.swflag);
			win32messageHandler.addDependency('message');//open message loop
			window.on(wintypes.UInt32.constants.WM_DESTROY,_=>win32messageHandler.removeDependency('message'));//close message loop

			//	user32.UpdateWindow(hwnd);
		}else{
			console.error("CreateWindow failed to create window..");
		}
	}else{
		console.error("Register Class Failed User32/RegisterClassEx")
	}	
	window.hotkeyArray=[];
	window.hotkeyArray.holes=[];
	function onhotkey(lParam,hotkeyID){
		console.log("Hello, does this even get executed?")
		var c=constants.macros.HIWORD(lParam)
		var str=`${c&MOD_CONTROL?"{Control Up}":""}${c&MOD_SHIFT?"{Shift Up}":""}${c&MOD_ALT?"{Alt Up}":""}${c&MOD_WIN?"{Windows Up}":""}`
		if(str.length>0)
		goodies.sendInputAhkSync(str);
		window.emit(window.hotkeyArray[hotkeyID],lParam);
	}
	window.on(wintypes.UInt32.constants.WM_HOTKEY,onhotkey);
	window.oneTimeListen("WM_HOTKEY:^b",([str])=>{
		var [_,str2,str3]=str.match(/:([\^#?+!]+)([A-z]+)$/);
		var i,wVk;
		if(window.hotkeyArray.holes.length>0){window.hotkeyArray[i=window.hotkeyArray.holes.pop()]=str;
		}
		else i=window.hotkeyArray.push(str)-1;
		if(str3.length==1){
			let u=str3.toUpperCase().charCodeAt();
			wVk=u;//if not in 0x30<u<0x59 what else can we do anyway, throw an error?
		}else{
			wVk=Object.entries(wintypes.VIRTUAL_KEY.values).find(([k,v])=>new RegExp(str3,'i').test(k))[1];
		}
		if (fnproxy.RegisterHotKey(hwnd, i, hotkeyflagparser(str2), wVk)) {
			console.log("Hotkey "+str2+str3+" registered\n");
		};
		return i;
	},id=>{
		if(id==window.hotkeyArray.length){
		window.hotkeyArray.pop()
	}else{
		window.hotkeyArray.holes.push(id)
		delete window.hotkeyArray[id];
	}
		fnproxy.UnregisterHotKey(id);
	});
	return window;
}
goodies.typePointerBuffer=typePointerBuffer;
goodies.getFocusedHandle=function GetFocusedHandle(){
	//from https://stackoverflow.com/questions/12102000/send-win-api-paste-cmd-from-background-c-sharp-app
	var info = new wintypes.GUITHREADINFO();
	info.cbSize = wintypes.GUITHREADINFO.size;
	if (!fnproxy.GetGUIThreadInfo(0, info.ref()))
		throw new Win32Exception();
	return info.hwndFocus;	
}

var messagecallback = (hWnd,uMsg,dwData,lresult) => {
	messagecallback.relateddata[dwData-1](null,{hWnd,uMsg,lresult});
	messagecallback.relateddata.splice(dwData-1,1);
};
messagecallback.relateddata=[];
/**
 * 
 * @param {Number} hWnd 
 * @param {Number} uMsg 
 * @param {Number} wParam 
 * @param {Number} lParam 
 * @param {Sendasyncproc} cb 
 */
goodies.SendMessageCallbackA=function SendMessageCallbackA(hWnd,uMsg,wParam,lParam,cb){
	var s=messagecallback.relateddata.push(cb);
	var r=fnproxy.SendMessageCallbackA(hWnd,uMsg,wParam,lParam,messagecallback,s);
	if(!r){
		messagecallback.relateddata.pop();
		cb(Error(Win32Exception()));
	}
}
/**
 * This callback is displayed as a global member.
 * @callback Sendasyncproc
 * @param {*} error
 * @param {Number} hWnd
 * @param {Number} uMsg
 * @param {Number} lresult
 */
goodies.PSendMessageCallbackA=util.promisify(goodies.SendMessageCallbackA);
goodies.wsendFocus=function sendFocus(msg,wParam,lParam){
	//Promisifies and sends message to focused window
	var hWnd = winapi.goodies.getFocusedHandle();
	return goodies.PSendMessageCallbackA(hWnd, msg, wParam, lParam);
	}


goodies.setClipboard=function setClipboard(clipboardType,clipboardContent){
	const GMEM_MOVEABLE=0x2;
	var stringbuffer=clipboardContent;
	var hmem=fnproxy.GlobalAlloc(wintypes.GLOBAL_ALLOC_FLAGS.values.GMEM_MOVEABLE,stringbuffer.length);
	var lptstr = fnproxy.GlobalLock(hmem);
	stringbuffer.copy(ref.reinterpret(lptstr, stringbuffer.length));
	fnproxy.GlobalUnlock(hmem);
	if (!fnproxy.OpenClipboard(0)){
		fnproxy.GlobalLock(hmem);
		fnproxy.GlobalFree(hmem);
		fnproxy.GlobalUnlock(hmem);
		return 1
	}
	fnproxy.EmptyClipboard();
	fnproxy.SetClipboardData(clipboardType, hmem);
	fnproxy.CloseClipboard();
	return 0;//C type error
}


goodies.getClipboard=function getClipboard(clipBoardFormat) {
	if (!fnproxy.IsClipboardFormatAvailable(clipBoardFormat) || !fnproxy.OpenClipboard(0))
		return ref.NULL;
	var hglb = fnproxy.GetClipboardData(clipBoardFormat) //,wintypes.HGLOBAL);	   
	var lptstr = fnproxy.GlobalLock(hglb);
	var size = fnproxy.GlobalSize(hglb);
	console.log("buffer size:", size)
	var k=Buffer.from(Buffer.from(ref.reinterpret(lptstr, size)));
	fnproxy.GlobalUnlock(hglb)
	fnproxy.CloseClipboard();
	return k;
}


function generatekey(keys2generate,up=false,extended=false) {
	//nobody cares about scancodes, they map to the physical keyboard, and it never changes no matter which language you are in. We don't want to send real keys, we want to send characters, so we simply don't use it.
	var wVk;
	var dwFlags=0;
	var wScan=0;
	var t
	if(keys2generate.length==1){
		var k=keys2generate.charCodeAt();
		if(0x30<=k&&k<=0x59){
			wVk=k;		
		}else{
		wVk=0;
		wScan=k;
		dwFlags|= wintypes.KEYBD_EVENT_FLAGS.values.KEYEVENTF_UNICODE;
		}
	} else if(t=keys2generate.match(/U\+([A-Fa-f0-9]+)/)){
		wVk=0;
		wScan=parseInt(t[1],16)
		dwFlags|= wintypes.KEYBD_EVENT_FLAGS.values.KEYEVENTF_UNICODE;
	} else 
		wVk=Object.entries(wintypes.VIRTUAL_KEY.values).find(([k,v])=>new RegExp(keys2generate,'i').test(k))[1];
	if(!wVk&&!wScan)
		throw new Error("no valid key given");
	if (up) {
		dwFlags|= wintypes.KEYBD_EVENT_FLAGS.values.KEYEVENTF_KEYUP;	
	}
	if(extended){
		dwFlags|= wintypes.KEYBD_EVENT_FLAGS.values.KEYEVENT_EXTENDEDKEY;
	}
	//console.log(keys2generate,wVk,dwFlags,wScan)
	return new wintypes.INPUT({type:wintypes.INPUT_TYPE.values.INPUT_KEYBOARD,Anonymous:{ki:{wVk,dwFlags,wScan}}});
}
function bracketParse(key,command) {
	if(key.toLowerCase()=="sleep")
		return {type:"sleep",time:parseInt(command)||1}
	var buf=[];
	if(typeof command=="undefined"){
		command=1;
	}
	if(command=="Down"){
		buf.push(generatekey(key,false));
	}else if (command=="Up") {
		buf.push(generatekey(key,true));
	} else {
		var i=parseInt(command);
		for(var ii=0;ii<i;ii++){
			buf.push(generatekey(key,false));
			buf.push(generatekey(key,true));
		}		
	}
	return buf;
}
function ahkformat(ahktext){
	return	[...ahktext.matchAll(/\{(\}|[^ \}]+)(?: (Down|Up|[0-9]+))?\}/g)].map(a=>a.slice(1)).map(([key,command])=>bracketParse(key,command)).flat()
	.reduce(([left,index],right)=>{
		left[index]=[].concat(left[index]||[]);
		if(right.type=="sleep"){
			if(left[index]?.length)index++;
			left[index]=right;
			index++;			
		}else{
			left[index].push(right)
		}
		return [left,index];
	},[[],0])[0]//.map(_=>_.ref());
}
goodies.ahkformat=ahkformat;
goodies.sendInput=sendInput;
function sendInput(arr){
	//console.log("sendInput is being sent",arr)
	errorResults.SendInput=_=>_!==arr.length;
	return fnproxy.SendInput(arr.length,Buffer.concat(arr),wintypes.INPUT.size);
}

goodies.sendInputAhk=async function sendInputAhk(ahktext){
	return await ahkformat(ahktext).reduce(async (a,b)=>{
		await a;
		if(b.type=="sleep"){
			return sleep(b.time)

		}else{
			return sendInput(b.map(_=>_.ref()))
		}
	},null);
}
goodies.sendInputAhkSync=ahktext=>goodies.sendInput(ahkformat(ahktext).flat().map(_=>_.ref()));
/*var winapi={ffi,goodies,constants,gdi32,kernel32,ref,Union,Struct:StructType,Array:ArrayType,ole32};


winapi.interfaces=winterface;
winapi.types=wintypes
winapi.user32=current

*/
module.exports=({goodies,constants,fn:fnproxy,winapicore,wintypes,reflection:winapicore.reflection,done:done.then(_=>{
	return {fn:fnproxy,winapicore}
})});