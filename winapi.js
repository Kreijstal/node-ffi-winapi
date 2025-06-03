var ffi =require('ffi-napi')
var ref = require('ref-napi');
var ArrayB =require('ref-array-di')(ref);
var Struct = require('ref-struct-di')(ref);
var Union = require('ref-union-di')(ref);
var util=require("node:util");
var assert=require('node:assert')
//Ok this is a mega long file where definitions and helper functions are all in one file together, we can split this file later after most of the bulkwork has been completed


//Should this be optional or something?
Buffer.prototype._toJSON=Buffer.prototype.toJSON
Buffer.prototype.toJSON=function toJSON(){
	var obj=this._toJSON();
	var size=this?.type?.size;
	var indirection=this.type.indirection;
	var type=this?.type?.name;
	var address=this.address();
	return {...obj,size,indirection,type,address};
}
const isObject = (input) => (
	null !== input &&  typeof input === 'object' &&     Object.getPrototypeOf(input).isPrototypeOf(Object)
)

/**
 * @param   {object}    obj
 * @param   {string}    path
 * @param   {any}       value
 */

const setByString = (obj, path, value) => {
	const pList = Array.isArray(path) ? path : path.split('.');
	const len = pList.length;
	// changes second last key to {}
	for (let i = 0; i < len - 1; i++) {
		const elem = pList[i];
		if (!obj[elem] || !isObject(obj[elem])) {
			obj[elem] = {};
		}
		obj = obj[elem];
	}

	// set value to second last key
	obj[pList[len - 1]] = value;
};
function flattenObject(o, prefix = '', result = {}, keepNull = true) {
	if (typeof o!=="object" || (keepNull && o==null)) {
		result[prefix] = o;
		return result;
	}
	for (let i in o) {
		let pref = prefix;
		if (Array.isArray(o)) {
			pref = pref + `[${i}]`;
		} else {
			if (Object.keys(prefix).length === 0) {
				pref = i;
			} else {
				pref = prefix + '.' + i;
			}
		}
		flattenObject(o[i], pref, result, keepNull);
	}
	return result;
}
function StructType(){
	function toJSONrec(){
		var that=this;
		while(that.toJSON==toJSONrec){//find previous JSON definition :)
			that=that.__proto__;
		}
		//assert(this.__proto__.__proto__.toJSON!=toJSONrec,"this shouldn't be the same...")
		return Object.entries(that.toJSON.call(this)).map(([k,v])=>[k,(v.toJSON)?v.toJSON():v])
	}
	var obj=Struct(...arguments);
	var someproto=Object.create(Object.getPrototypeOf(obj.prototype))
	someproto.toJSON=toJSONrec;
	someproto.fromObject=function(d){
		//var l=this;
		Object.entries(flattenObject(d)).forEach(([k,v])=>setByString(this,k,v))
	}
	Object.setPrototypeOf(obj.prototype,someproto)
	obj.defineProperties=(_=>Object.entries(_).forEach(([k,v])=>obj.defineProperty(k,v)));
	return obj;
}
function ArrayType(){
	function toJSONrec(){
		return this._toJSON().map(_=>_.toJSON?_.toJSON():_);
	}
	var obj=ArrayB(...arguments);
	obj.prototype._toJSON=obj.prototype.toJSON
	obj.prototype.toJSON=toJSONrec;
	return obj;
}
var wchar_size = process.platform == 'win32' ? 2 : 4;
ref.types.wchar_t = ref.types.ushort;
ref.types.WCString = Object.create(ref.types.CString)
ref.types.WCString.get = function get (buf, offset) {
	var _buf = buf.readPointer(offset)
	if (_buf.isNull()) {
		return null
	}
	var stringBuf = _buf.reinterpretUntilZeros(wchar_size)
	return stringBuf.toString('utf16le') // TODO: decode UTF-32 on Unix
};
ref.types.WCString.set = function set (buf, offset, val) {
	// TODO: better UTF-16 and UTF-32 encoding
	var _buf = new Buffer((val.length + 1) * wchar_size)
	_buf.fill(0)
	var l = 0
	for (var i = wchar_size - 1; i < _buf.length; i += wchar_size) {
		_buf[i] = val.charCodeAt(l++)
	}
	return buf.writePointer(_buf, offset);
};
// Define Winapi types according to 
//  https://msdn.microsoft.com/en-us/library/windows/desktop/aa383751%28v=vs.85%29.aspx
//var wintypes = {};
function longeSTring(a, b) {
	return a.length > b.length ? a : b;
}
//There are so many types that it's better to lazily dynamically generate them because otherwise the list would be just too long.
//LP,P,NP,SP, this is overkill but why did microsoft just made so many names for the same thing?
//we have to execute this many times because structs contain pointers already and they're referenced as pointers as well
var wintypes=new Proxy({},{
	get: function(target, name) {
		var arr,lname;
		if (name in target) return  target[name] ;
		else if(name.toLowerCase() in ref.types)
			return target[name]=ref.types[name.toLowerCase()]
		else if((arr=name.match(/^[LNS]?P(C?(U?(N?(Z?(Z?(.*)|.*)|.*)|.*)|.*)|.*)/)?.slice(1).filter(_=>this.has(target,_)))?.length|0>0){
			if((lname=arr.reduce(longeSTring))=="STR"){
				return target[name]=ref.types.CString;
			}else
				return target[name]=ref.refType(this.get(target,lname));
		}
		else if(name[0]=="H") return target[name]=ref.types.uint64;
	},
	has: function(target, name) {
		if (name in target||
			name.toLowerCase() in ref.types||
			name.match(/^[LNS]?P(C?(U?(N?(Z?(Z?(.*)|.*)|.*)|.*)|.*)|.*)/)?.slice(1).filter(_=>this.has(target,_))?.length|0>0||
			name[0]=="H"||name=="STR") return true;
		else return false;
	}
});


wintypes.WCHAR=wintypes.WSTR= ref.types.wchar_t;
wintypes.WCH=wintypes.WSTR;
wintypes.NWPSTR=wintypes.PWCHAR;
wintypes.SSIZE_T= wintypes.INT_PTR=wintypes.LONG_PTR = ref.types.int64;//64bit
wintypes.SIZE_T=wintypes.UINT_PTR=wintypes.ULONG_PTR = ref.types.uint64;//64bit
wintypes.LRESULT = wintypes.LONG_PTR;
wintypes.LPARAM = wintypes.LONG_PTR;//ref.refType(ref.types.void);//
wintypes.WPARAM = wintypes.UINT_PTR;
wintypes.WORD = ref.types.ushort;
wintypes.DWORD = ref.types.ulong;
wintypes.ATOM = wintypes.WORD;
wintypes.BOOL = ref.types.int;
wintypes.BYTE = ref.types.uchar;
wintypes.CALLBACK = ref.types.void;
wintypes.BOOLEAN = wintypes.BYTE;
//what is _MAC?
wintypes.HFILE= ref.types.int;
wintypes.GLOBALHANDLE = wintypes.HANDLE;
wintypes.LOCALHANDLE = wintypes.HANDLE;
wintypes.DPI_AWARENESS_CONTEXT = wintypes.HANDLE;
wintypes.COLORREF = wintypes.DWORD;
wintypes.POINTER_INPUT_TYPE=wintypes.DWORD;
wintypes.ACCESS_MASK=wintypes.DWORD;
wintypes.OLECHAR=wintypes.CHAR;
wintypes.LPOLESTR=ref.types.CString;
/*typedef struct _GUID {
    unsigned long  Data1;
    unsigned short Data2;
    unsigned short Data3;
    unsigned char  Data4[ 8 ];
} GUID;*/
wintypes.GUID=StructType({
	Data1:wintypes.ULONG,
	Data2:wintypes.USHORT,
	Data3:wintypes.USHORT,
	Data4:ArrayType(wintypes.UCHAR,8)
});
wintypes.CLSID=wintypes.GUID;
wintypes.IID=wintypes.GUID;
wintypes.FMTID=wintypes.GUID;
wintypes.RECT=wintypes.RECTL=StructType({
	left:wintypes.LONG,
	top:wintypes.LONG,
	right:wintypes.LONG,
	bottom:wintypes.LONG
})
wintypes.POINT=wintypes.POINTL=StructType({
	x:wintypes.LONG,
	y:wintypes.LONG
})
const tagMOUSEHOOKSTRUCT = {
	pt: wintypes.POINT,
	hwnd: wintypes.HWND,
	wHitTestCode: wintypes.UINT,
	dwExtraInfo: wintypes.ULONG_PTR
};
//Thanks to https://github.com/deskbtm/win32-ffi/blob/master/lib/cpp/user32/win_user_struct.ts
wintypes.MOUSEHOOKSTRUCT=StructType(tagMOUSEHOOKSTRUCT);
wintypes.MOUSEHOOKSTRUCTEX =StructType({
	mouseData: wintypes.DWORD,
	...tagMOUSEHOOKSTRUCT
});
wintypes.POINTS=StructType({
	x:wintypes.SHORT,
	y:wintypes.SHORT
});
wintypes.SIZE=StructType({
	cx:wintypes.LONG,
	cy:wintypes.LONG
});
wintypes.PAINTSTRUCT=StructType({
	hdc:wintypes.HDC,
	fErase:wintypes.BOOL,
	rcPaint:wintypes.RECT,
	fRestore:wintypes.BOOL,
	fIncUpdate:wintypes.BOOL,
	rgbReserved:ArrayType(wintypes.BYTE,32)
});
wintypes.ACCEL=StructType({
	fVirt:wintypes.BYTE,
	key:wintypes.WORD,
	cmd:wintypes.WORD
});
wintypes.CREATESTRUCTA=StructType({
	lpCreateParams:wintypes.LPVOID,
	hInstance:wintypes.HINSTANCE,
	hMenu:wintypes.HMENU,
	hwndParent:wintypes.HWND,
	cy:ref.types.int,
	cx:ref.types.int,
	y:ref.types.int,
	x:ref.types.int,
	style:wintypes.LONG,
	lpszName:wintypes.LPCSTR,
	lpszClass:wintypes.LPCSTR,
	dwExStyle:wintypes.DWORD
});
wintypes.LUID=StructType({
	LowPart:wintypes.DWORD,
	HighPart:wintypes.LONG
});
wintypes.BSMINFO=StructType({
	cbSize:wintypes.UINT,
	hdesk:wintypes.HDESK,
	hwnd:wintypes.HWND,
	luid:wintypes.LUID
});
wintypes.MSG=StructType({
	hwnd:wintypes.HWND,
	message:wintypes.UINT,
	wParam:wintypes.WPARAM,
	lParam:wintypes.LPARAM,
	time:wintypes.DWORD,
	pt:wintypes.POINT,
	//	lPrivate:wintypes.DWORD,
});
wintypes.DEVMODEA=StructType({
	dmDeviceName:ArrayType(wintypes.BYTE,32),
	dmSpecVersion:wintypes.WORD,
	dmDriverVersion:wintypes.WORD,
	dmSize:wintypes.WORD,
	dmDriverExtra:wintypes.WORD,
	dmFields:wintypes.DWORD,
	DUMMYUNIONNAME:new Union({
		DUMMYSTRUCTNAME:StructType({
			dmORiotation:ref.types.short,
			dmPaperSize:ref.types.short,
			dmPaperLength:ref.types.short,
			dmPaperWidth:ref.types.short,
			dmScale:ref.types.short,
			dmCopies:ref.types.short,
			dmDefaultSource:ref.types.short,
			dmPrintQuality:ref.types.short,
		}),
		DUMMYSTRUCTNAME2:StructType({
			dmPosition:wintypes.POINTL,
			dmDisplayOrientation:wintypes.DWORD,
			dmDisplayFixedOutput:wintypes.DWORD
		})
	}),
	dmColor:ref.types.short,
	dmDuplex:ref.types.short,
	dmYResolution:ref.types.short,
	dmTToption:ref.types.short,
	dmCollate:ref.types.short,
	dmFormName:ArrayType(wintypes.WCHAR,32),
	dmLogPixels:wintypes.WORD,
	dmBitsPerPel:wintypes.DWORD,
	dmPelsWidth:wintypes.DWORD,
	dmPelsHeight:wintypes.DWORD,
	DUMMYUNIONNAME2:new Union({
		dmDisplayFlags:wintypes.DWORD,
		dmNup:wintypes.DWORD
	}),
	dmDisplayFrequency:wintypes.DWORD,
	dmICMMethod:wintypes.DWORD,
	dmICMIntent:wintypes.DWORD,
	dmMediaType:wintypes.DWORD,
	dmDitherType:wintypes.DWORD,
	dmReserved1:wintypes.DWORD,
	dmReserved2:wintypes.DWORD,
	dmPanningWidth:wintypes.DWORD,
	dmPanningHeight:wintypes.DWORD,
});
wintypes.DEVMODE=wintypes.DEVMODEW=StructType({
	dmDeviceName:ArrayType(wintypes.WCHAR,32),
	dmSpecVersion:wintypes.WORD,
	dmDriverVersion:wintypes.WORD,
	dmSize:wintypes.WORD,
	dmDriverExtra:wintypes.WORD,
	dmFields:wintypes.DWORD,
	DUMMYUNIONNAME:new Union({
		DUMMYSTRUCTNAME:StructType({
			dmORiotation:ref.types.short,
			dmPaperSize:ref.types.short,
			dmPaperLength:ref.types.short,
			dmPaperWidth:ref.types.short,
			dmScale:ref.types.short,
			dmCopies:ref.types.short,
			dmDefaultSource:ref.types.short,
			dmPrintQuality:ref.types.short,
		}),
		DUMMYSTRUCTNAME2:StructType({
			dmPosition:wintypes.POINTL,
			dmDisplayOrientation:wintypes.DWORD,
			dmDisplayFixedOutput:wintypes.DWORD
		})
	}),
	dmColor:ref.types.short,
	dmDuplex:ref.types.short,
	dmYResolution:ref.types.short,
	dmTToption:ref.types.short,
	dmCollate:ref.types.short,
	dmFormName:ArrayType(wintypes.WCHAR,32),
	dmLogPixels:wintypes.WORD,
	dmBitsPerPel:wintypes.DWORD,
	dmPelsWidth:wintypes.DWORD,
	dmPelsHeight:wintypes.DWORD,
	DUMMYUNIONNAME2:new Union({
		dmDisplayFlags:wintypes.DWORD,
		dmNup:wintypes.DWORD
	}),
	dmDisplayFrequency:wintypes.DWORD,
	dmICMMethod:wintypes.DWORD,
	dmICMIntent:wintypes.DWORD,
	dmMediaType:wintypes.DWORD,
	dmDitherType:wintypes.DWORD,
	dmReserved1:wintypes.DWORD,
	dmReserved2:wintypes.DWORD,
	dmPanningWidth:wintypes.DWORD,
	dmPanningHeight:wintypes.DWORD,
});
wintypes.CHANGEFILTERSTRUCT=StructType({
	cbSize:wintypes.DWORD,
	ExtStatus:wintypes.DWORD
});
wintypes.SECURITY_ATTRIBUTES=StructType({
	nLength:wintypes.DWORD,
	lpSecurityDescriptor:wintypes.LPVOID,
	bInheritHandle:wintypes.BOOL
});
wintypes.DLGTEMPLATEA=wintypes.DLGTEMPLATEW=wintypes.DLGTEMPLATE=StructType({
	style:wintypes.DWORD,
	dwExtendedStyle:wintypes.DWORD,
	cdit:wintypes.WORD,
	x:ref.types.short,
	y:ref.types.short,
	cx:ref.types.short,
	cy:ref.types.short,
});
wintypes.ICONINFO=StructType({
	fIcon:wintypes.BOOL,
	xHotspot:wintypes.DWORD,
	yHotspot:wintypes.DWORD,
	hbmMask:wintypes.HBITMAP,
	hbmColor:wintypes.HBITMAP,
});

wintypes.RAWINPUTDEVICE=StructType({
	usUsagePage:wintypes.USHORT,
	usUsage:wintypes.USHORT,
	dwFlags:wintypes.DWORD,
	hwndTarget:wintypes.HWND
});
wintypes.RAWHID=StructType({
	dwSizeHid:wintypes.DWORD,
	dwCount:wintypes.DWORD,
	bRawData:ArrayType(wintypes.BYTE,1)
});
wintypes.RAWKEYBOARD=StructType({
	MakeCode:wintypes.USHORT, 
	Flags:wintypes.USHORT,
	Reserved:wintypes.USHORT,
	VKey:wintypes.USHORT,
	Message:wintypes.UINT,
	ExtraInformation:wintypes.ULONG
});
wintypes.RAWMOUSE=StructType({
	usFlags:wintypes.USHORT,
	DUMMYUNIONNAME:new Union({
		ulButtons:wintypes.ULONG,
		DUMMYSTRUCTNAME:StructType({
			usButtonFlags:wintypes.USHORT,
			usButtonData:wintypes.USHORT
		})
	}),
	ulRawButtons:wintypes.ULONG,
	lLastX:wintypes.LONG,
	lLastY:wintypes.LONG,
	ulExtraInformation:wintypes.ULONG
})
wintypes.RAWINPUTHEADER=StructType({
	dwType:wintypes.DWORD,
	dwSize:wintypes.DWORD,
	hDevice:wintypes.HANDLE,
	wParam:wintypes.WPARAM
})
wintypes.RAWINPUT=StructType( {
	header:wintypes.RAWINPUTHEADER ,
	data:new Union({
		mouse:wintypes.RAWMOUSE,
		keyboard:wintypes.RAWKEYBOARD,
		hid:wintypes.RAWHID  
	})
})
wintypes.RAWINPUTDEVICELIST=StructType({
	hDevice:wintypes.HANDLE,
	dwType:wintypes.DWORD
})

//not strictly a windows type
wintypes.va_list = StructType({
	gp_offset : ref.types.uint,
	fp_offset : ref.types.uint,
	overflow_arg_area : wintypes.PVOID,
	reg_save_area : wintypes.PVOID
});
//enum
;["DPI_AWARENESS","DPI_HOSTING_BEGAVIOR","POINTER_FEEDBACK_MODE"].forEach(_=>{wintypes[_]=ref.types.int});
var fn = {};
fn.WNDPROC = [wintypes.LRESULT,[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]];
fn.DLGPROC = [wintypes.INT_PTR,[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]];
fn.Hookproc = [wintypes.LRESULT,[ref.types.int,wintypes.WPARAM,wintypes.LPARAM]];
fn.ThreadProc = [wintypes.DWORD, [wintypes.LPVOID]];
fn.EnumWindowsProc = [wintypes.BOOL,[wintypes.HWND,wintypes.LPARAM]];
fn.Sendasyncproc = [wintypes.VOID, [wintypes.HWND,wintypes.UINT,wintypes.ULONG_PTR,wintypes.LRESULT]];
var cftype = function(rtype,args){return {
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  rtype,
  name:`(${args.map(a=>a.name).join(',')}) -> ${rtype.name}`,
  ffi_type:ffi.FFI_TYPES.pointer,
  args,
  indirection: 1,
  get: function get (buf, offset) {
    const _buf = ref.readPointer(buf, offset)
    if (ref.isNull(_buf)) {
      return null;
    }
    return ffi.ForeignFunction(_buf,rtype,args);
  },
  set: function set (buf, offset, val) {
    let _buf
    if (Buffer.isBuffer(val)) {
      _buf = val;
    } else if("_buf" in val){
	    _buf=val._buf;
    }else{
      // assume fn
      _buf = ffi.Callback(rtype,args,val);
	  val._buf=_buf;//make lifetime valid as long as val is valid.
    }
    return ref.writePointer(buf, offset, _buf);
  }
}
}
Object.entries(fn).forEach(([k,v],i)=>{
//	console.log(k,v);
	wintypes[k]=cftype(...v)
});
wintypes.THREAD_START_ROUTINE=wintypes.ThreadProc;
wintypes.WNDENUMPROC=wintypes.EnumWindowsProc;
wintypes.HOOKPROC=wintypes.Hookproc;
wintypes.SENDASYNCPROC=wintypes.Sendasyncproc;
wintypes.WNDCLASSA = StructType({
	style: wintypes.UINT,
	lpfnWndProc: wintypes.WNDPROC,
	cbClsExtra: ref.types.int,
	cbWndExtra: ref.types.int,
	hInstance: wintypes.HINSTANCE,
	hIcon: wintypes.HICON,
	hCursor: wintypes.HCURSOR,
	hbrBackground: wintypes.HBRUSH,
	lpszMenuName: wintypes.LPCSTR,
	lpszClassName: wintypes.LPCSTR
});
wintypes.WNDCLASSEXA=StructType({
	cbSize:wintypes.UINT,
	style:wintypes.UINT,
	lpfnWndProc:wintypes.WNDPROC,
	cbClsExtra:ref.types.int,
	cbWndExtra:ref.types.int,
	hInstance:wintypes.HINSTANCE,
	hIcon:wintypes.HICON,
	hCursor:wintypes.HCURSOR,
	hbrBackground:wintypes.HBRUSH,
	lpszMenuName:wintypes.LPCSTR,
	lpszClassName:wintypes.LPCSTR,
	hIconSm:wintypes.HICON
});
wintypes.WNDCLASSEXW=StructType({
	cbSize:wintypes.UINT,
	style:wintypes.UINT,
	lpfnWndProc:wintypes.WNDPROC,
	cbClsExtra:ref.types.int,
	cbWndExtra:ref.types.int,
	hInstance:wintypes.HINSTANCE,
	hIcon:wintypes.HICON,
	hCursor:wintypes.HCURSOR,
	hbrBackground:wintypes.HBRUSH,
	lpszMenuName:wintypes.LPCWSTR,
	lpszClassName:wintypes.LPCSTR,
	hIconSm:wintypes.HICON
});

wintypes.KBDLLHOOKSTRUCT=StructType({
	vkCode:wintypes.DWORD,
	scanCode:wintypes.DWORD,
	flags:wintypes.DWORD,
	time:wintypes.DWORD,
	dwExtraInfo:wintypes.ULONG_PTR
})

wintypes.MOUSEINPUT = StructType({
	dx: wintypes.LONG,
	dy: wintypes.LONG,
	mouseData: wintypes.DWORD,
	dwFlags: wintypes.DWORD,
	time: wintypes.DWORD,
	dwExtraInfo: wintypes.ULONG_PTR
})

wintypes.KEYBDINPUT = StructType({
	wVk: wintypes.WORD,
	wScan: wintypes.WORD,
	dwFlags: wintypes.DWORD,
	time: wintypes.DWORD,
	dwExtraInfo: wintypes.ULONG_PTR
})

wintypes.HARDWAREINPUT = StructType({
	uMsg: wintypes.DWORD,
	wParamL: wintypes.WORD,
	wParamH: wintypes.WORD
});

wintypes.INPUT=StructType({type:wintypes.DWORD,DUMMYUNIONNAME:new Union({mi:wintypes.MOUSEINPUT,ki:wintypes.KEYBDINPUT,hi:wintypes.HARDWAREINPUT})})
wintypes.NMHDR=StructType({hwndFrom:wintypes.HWND,idFrom:wintypes.UINT_PTR,code:wintypes.UINT})
wintypes.CLIPBOARDFORMAT=StructType({nmhdr:wintypes.NMHDR,cf:wintypes.DWORD})
wintypes.GUITHREADINFO=StructType({cbSize:wintypes.DWORD,flags:wintypes.DWORD,hwndActive:wintypes.HWND,hwndFocus:wintypes.HWND,hwndCapture:wintypes.HWND,hwndMenuOwner:wintypes.HWND,hwndMoveSize:wintypes.HWND,hwndCaret:wintypes.HWND,rcCaret:wintypes.RECT})
//createWinapiPointers();
//C style Interfaces, thanks Windows
//Unkknwnbase.h
//we must use the Progressive API
wintypes.IUnknown=StructType()
var IUnknownVtbl={
	QueryInterface:[wintypes.HRESULT,[wintypes.REFIID,wintypes.PPVOID]],
	AddRef:[wintypes.ULONG,[]],
	Release:[wintypes.ULONG,[]],
}
//ShObjdl_core.h
var IShellLinkWVtbl={
    
}
wintypes.fn=fn;
var winterface={}
winterface.gdi32= {
	TextOutA:[wintypes.BOOL,[wintypes.HDC,ref.types.int,ref.types.int,wintypes.LPCSTR,ref.types.int]]
};

winterface.ole32={
	CoInitialize:[wintypes.HRESULT,[wintypes.LPVOID]],
	CLSIDFromProgID:[wintypes.HRESULT,[wintypes.LPOLESTR,wintypes.LPCLSID]],
//	CoCreateInstance:


}
//https://github.com/deskbtm/win32-ffi/blob/master/lib/cpp/kernel32/process_threads_api_fns.ts
//https://github.com/waitingsong/node-win32-api/blob/HEAD/packages/win32-api/src/lib/kernel32/api.ts
var kernel32extract=[
	{"params":[["hMem","in","HGLOBAL"]],"rtype":"LPVOID","type":"function","name":"GlobalLock"},
	{"params":[["hMem","in","HGLOBAL"]],"rtype":"BOOL","type":"function","name":"GlobalUnlock"},
	{"params":[["uFlags","in","UINT"],["dwBytes","in","SIZE_T"]],"rtype":"HGLOBAL","type":"function","name":"GlobalAlloc"},
	{"params":[["hMem","in","HGLOBAL"]],"rtype":"SIZE_T","type":"function","name":"GlobalSize"},
	{"params":[["hMem","in","HGLOBAL"]],"rtype":"HGLOBAL","type":"function","name":"GlobalFree"}
]


winterface.Kernel32={...kernel32extract.reduce((a,b)=>{a[b.name]=[wintypes[b.rtype],b.params.map(_=>wintypes[_[2]])];return a;},{}),
	FormatMessageA: [wintypes.DWORD,  [wintypes.DWORD, wintypes.LPCVOID, wintypes.DWORD, wintypes.DWORD, wintypes.LPSTR, wintypes.DWORD, wintypes.va_list] ],
	FormatMessageW: [wintypes.DWORD,  [wintypes.DWORD, wintypes.LPCVOID, wintypes.DWORD, wintypes.DWORD, wintypes.LPWSTR, wintypes.DWORD, wintypes.PVOID]  ],
	FreeConsole: [wintypes.BOOL, [] ],
	CreateThread: [wintypes.HANDLE, [wintypes.LPSECURITY_ATTRIBUTES, wintypes.SIZE_T, wintypes.LPTHREAD_START_ROUTINE, wintypes.LPVOID, wintypes.DWORD, wintypes.LPDWORD]],
	CreateToolhelp32Snapshot: [wintypes.HANDLE,[wintypes.DWORD,wintypes.DWORD]],
	// CreateProcessAsUserA: [BOOL, [HANDLE, LPCSTR, LPSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES, BOOL, DWORD, LPVOID, LPCSTR, LPSTARTUPINFOA, LPPROCESS_INFORMATION]],
	// CreateProcessAsUserW: [BOOL, [HANDLE, LPCWSTR, LPWSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES, BOOL, DWORD, LPVOID, LPCWSTR, LPSTARTUPINFOW, LPPROCESS_INFORMATION]],
	// CreateProcessW: [BOOL, [LPCWSTR, LPWSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES, BOOL, DWORD, LPVOID, LPCWSTR, LPSTARTUPINFOW, LPPROCESS_INFORMATION]],
	CreateRemoteThread:[wintypes.HANDLE,[wintypes.HANDLE,wintypes.LPSECURITY_ATTRIBUTES,wintypes.SIZE_T ,wintypes.LPTHREAD_START_ROUTINE,wintypes.LPVOID, wintypes.DWORD,wintypes.LPDWORD]],
	// CreateRemoteThreadEx: [HANDLE, [HANDLE, LPSECURITY_ATTRIBUTES, SIZE_T, LPTHREAD_START_ROUTINE, LPVOID, DWORD, LPPROC_THREAD_ATTRIBUTE_LIST, LPDWORD]]
	// DeleteProcThreadAttributeList: [VOID, [LPPROC_THREAD_ATTRIBUTE_LIST]],
	// ExitProcess: [VOID, [UINT]],
	// FlushInstructionCache: [BOOL, [HANDLE, LPCVOID, SIZE_T]],
	// FlushProcessWriteBuffers: [VOID, [\placeholder]],
	// GetCurrentProcess: [HANDLE, [\placeholder]],
	// GetCurrentProcessId: [DWORD, [\placeholder]],
	// GetCurrentProcessorNumber: [DWORD, [\placeholder]],
	// GetCurrentProcessorNumberEx: [VOID, [PPROCESSOR_NUMBER]],
	// GetCurrentProcessToken: [HANDLE, [\placeholder]],
	// GetCurrentThread: [HANDLE, [\placeholder]],
	// GetCurrentThreadEffectiveToken: [HANDLE, [\placeholder]],
	// GetCurrentThreadId: [DWORD, [\placeholder]],
	// GetCurrentThreadStackLimits: [VOID, [PULONG_PTR, PULONG_PTR]],
	// GetCurrentThreadToken: [HANDLE, [\placeholder]],
	// GetExitCodeProcess: [BOOL, [HANDLE, LPDWORD]],
	// GetExitCodeThread: [BOOL, [HANDLE, LPDWORD]],
	// GetPriorityClass: [DWORD, [HANDLE]],
	// GetProcessHandleCount: [BOOL, [HANDLE, PDWORD]],
	GetProcessId: [wintypes.DWORD,[wintypes.HANDLE]],
	//GetProcessIdOfThread: ["DWORD", ["HANDLE"]],
	// GetProcessInformation: [BOOL, [HANDLE, PROCESS_INFORMATION_CLASS, LPVOID, DWORD]],
	// GetProcessMitigationPolicy: [BOOL, [HANDLE, PROCESS_MITIGATION_POLICY, PVOID, SIZE_T]],
	// GetProcessPriorityBoost: [BOOL, [HANDLE, PBOOL]],
	// GetProcessShutdownParameters: [BOOL, [LPDWORD, LPDWORD]],
	// GetProcessTimes: [BOOL, [HANDLE, LPFILETIME, LPFILETIME, LPFILETIME, LPFILETIME]],
	// GetProcessVersion: [DWORD, [DWORD]],
	// GetStartupInfoW: [VOID, [LPSTARTUPINFOW]],
	// GetSystemTimes: [BOOL, [PFILETIME, PFILETIME, PFILETIME]],
	// GetThreadContext: [BOOL, [HANDLE, LPCONTEXT]],
	//GetThreadDescription: [HRESULT, [HANDLE, PWSTR]],
	// GetThreadId: ["DWORD", [HANDLE]],
	// GetThreadIdealProcessorEx: [BOOL, [HANDLE, PPROCESSOR_NUMBER]],
	// GetThreadInformation: [BOOL, [HANDLE, THREAD_INFORMATION_CLASS, LPVOID, DWORD]],
	//GetThreadIOPendingFlag: [BOOL, [HANDLE, PBOOL]],
	// GetThreadPriority: [INT, [HANDLE]],
	//GetThreadPriorityBoost: [BOOL, [HANDLE, PBOOL]],
	// GetThreadTimes: [BOOL, [HANDLE, LPFILETIME, LPFILETIME, LPFILETIME, LPFILETIME]],
	// InitializeProcThreadAttributeList: [BOOL, [LPPROC_THREAD_ATTRIBUTE_LIST, DWORD, DWORD, PSIZE_T]],
	//	 IsProcessCritical: [BOOL, [HANDLE, PBOOL]],
	// IsProcessorFeaturePresent: [BOOL, ["DWORD"]],
	OpenProcess: [wintypes.HANDLE, [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD] ],
	// OpenProcessToken: [BOOL, [HANDLE, "DWORD", PHANDLE]],
	// OpenThread: [HANDLE, ["DWORD", BOOL, "DWORD"]],
	// OpenThreadToken: [BOOL, [HANDLE, "DWORD", BOOL, PHANDLE]],
	//ProcessIdToSessionId: [BOOL, ["DWORD", "DWORD"]],
	// QueryProcessAffinityUpdateMode: [BOOL, [HANDLE, LPDWORD]],
	// QueryProtectedPolicy: [BOOL, [LPCGUID, PULONG_PTR]],
	// QueueUserAPC: [DWORD, [PAPCFUNC, HANDLE, ULONG_PTR]],
	// ResumeThread: [DWORD, [HANDLE]],
	// SetPriorityClass: [BOOL, [HANDLE, DWORD]],
	// SetProcessAffinityUpdateMode: [BOOL, [HANDLE, DWORD]],
	// SetProcessDynamicEHContinuationTargets: [BOOL, [HANDLE, USHORT, PPROCESS_DYNAMIC_EH_CONTINUATION_TARGET]],
	// SetProcessInformation: [BOOL, [HANDLE, PROCESS_INFORMATION_CLASS, LPVOID, DWORD]],
	// SetProcessMitigationPolicy: [BOOL, [PROCESS_MITIGATION_POLICY, PVOID, SIZE_T]],
	// SetProcessPriorityBoost: [BOOL, [HANDLE, BOOL]],
	// SetProcessShutdownParameters: [BOOL, [DWORD, DWORD]],
	// SetProtectedPolicy: [BOOL, [LPCGUID, ULONG_PTR, PULONG_PTR]],
	// SetThreadContext: [BOOL, [HANDLE, CONST, CONTEXT]],
	SetThreadDescription: [wintypes.HRESULT, [wintypes.HANDLE, wintypes.PCWSTR]],
	SetThreadIdealProcessor: [wintypes.DWORD, [wintypes.HANDLE, wintypes.DWORD]],
	// SetThreadIdealProcessorEx: [BOOL, [HANDLE, PPROCESSOR_NUMBER, PPROCESSOR_NUMBER]],
	// SetThreadInformation: [BOOL, [HANDLE, THREAD_INFORMATION_CLASS, LPVOID, DWORD]],
	SetThreadPriority: [wintypes.BOOL, [wintypes.HANDLE, wintypes.INT]],
	SetThreadPriorityBoost: [wintypes.BOOL, [wintypes.HANDLE, wintypes.BOOL]],
	SetThreadStackGuarantee: [wintypes.BOOL, [wintypes.PULONG]],
	SetThreadToken: [wintypes.BOOL, [wintypes.PHANDLE, wintypes.HANDLE]],
	SetLastError: [wintypes.VOID, [wintypes.DWORD] ],
	SuspendThread: [wintypes.DWORD, [wintypes.HANDLE]],
	SwitchToThread: [wintypes.BOOL, []],
	TerminateProcess: [wintypes.BOOL, [wintypes.HANDLE, wintypes.UINT]],
	TerminateThread: [wintypes.BOOL, [wintypes.HANDLE, wintypes.DWORD]],
	// TlsAlloc: [DWORD, [\placeholder]],
	TlsFree: [wintypes.BOOL, [wintypes.DWORD]],
	TlsGetValue: [wintypes.LPVOID, [wintypes.DWORD]],
	TlsSetValue: [wintypes.BOOL, [wintypes.DWORD, wintypes.LPVOID]],
	// UpdateProcThreadAttribute: [BOOL, [LPPROC_THREAD_ATTRIBUTE_LIST, DWORD, DWORD_PTR, PVOID, SIZE_T, PVOID, PSIZE_T]],
	// GenerateConsoleCtrlEvent: [wintypes.BOOL, [wintypes.DWORD, wintypes.DWORD] ],
	/** err code: https://msdn.microsoft.com/zh-cn/library/windows/desktop/ms681381(v=vs.85).aspx */
	GetLastError: [wintypes.DWORD, [] ],
	/** retrive value from buf by ret.ref().readUInt32() */
	//GetModuleHandleW: [wintypes.HMODULE, [wintypes.LPCTSTR] ],
	/** flags, optional LPCTSTR name, ref hModule */
	//GetModuleHandleExW: [wintypes.BOOL, [wintypes.DWORD, wintypes.LPCTSTR, wintypes.HMODULE] ],
	//GetProcessHeaps: [wintypes.DWORD, [wintypes.DWORD, wintypes.PHANDLE] ],
	// GetSystemTimes: [wintypes.BOOL, [wintypes.PFILETIME, wintypes.PFILETIME, wintypes.PFILETIME] ],
	//HeapFree: [wintypes.BOOL, [wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID] ],

	//OutputDebugStringW: [wintypes.VOID, [wintypes.LPCTSTR] ],

	SetThreadExecutionState: [wintypes.INT, [wintypes.INT] ],
};
var user32extract=[
	{"params":[["cInputs","in","UINT"],["pInputs","in","LPINPUT"],["cbSize","in","INT"]],"rtype":"UINT","type":"function","name":"SendInput"},
	{"params":[["hwnd","in","HWND"]],"rtype":"BOOL","type":"function","name":"AddClipboardFormatListener"},
	{"params":[["hWndRemove","in","HWND"],["hWndNewNext","in","HWND"]],"rtype":"BOOL","type":"function","name":"ChangeClipboardChain"},
	{"params":[],"rtype":"BOOL","type":"function","name":"CloseClipboard"},
	{"params":[],"rtype":"INT","type":"function","name":"CountClipboardFormats"},
	{"params":[],"rtype":"BOOL","type":"function","name":"EmptyClipboard"},
	{"params":[["format","in","UINT"]],"rtype":"UINT","type":"function","name":"EnumClipboardFormats"},
	{"params":[["uFormat","in","UINT"]],"rtype":"HANDLE","type":"function","name":"GetClipboardData"},
	{"params":[["format","in","UINT"],["lpszFormatName","out","LPSTR"],["cchMaxCount","in","INT"]],"rtype":"INT","type":"function","name":"GetClipboardFormatNameA"},
	{"params":[["format","in","UINT"],["lpszFormatName","out","LPWSTR"],["cchMaxCount","in","INT"]],"rtype":"INT","type":"function","name":"GetClipboardFormatNameW"},
	{"params":[],"rtype":"HWND","type":"function","name":"GetClipboardOwner"},
	{"params":[],"rtype":"DWORD","type":"function","name":"GetClipboardSequenceNumber"},
	{"params":[],"rtype":"HWND","type":"function","name":"GetClipboardViewer"},
	{"params":[],"rtype":"HWND","type":"function","name":"GetOpenClipboardWindow"},
	{"params":[["paFormatPriorityList","in","PUINT"],["cFormats","in","INT"]],"rtype":"INT","type":"function","name":"GetPriorityClipboardFormat"},
	{"params":[["lpuiFormats","out","PUINT"],["cFormats","in","UINT"],["pcFormatsOut","out","PUINT"]],"rtype":"BOOL","type":"function","name":"GetUpdatedClipboardFormats"},
	{"params":[["format","in","UINT"]],"rtype":"BOOL","type":"function","name":"IsClipboardFormatAvailable"},
	{"params":[["hWndNewOwner","in, optional","HWND"]],"rtype":"BOOL","type":"function","name":"OpenClipboard"},
	{"params":[["lpszFormat","in","LPCSTR"]],"rtype":"UINT","type":"function","name":"RegisterClipboardFormatA"},
	{"params":[["lpszFormat","in","LPCWSTR"]],"rtype":"UINT","type":"function","name":"RegisterClipboardFormatW"},
	{"params":[["hwnd","in","HWND"]],"rtype":"BOOL","type":"function","name":"RemoveClipboardFormatListener"},
	{"params":[["uFormat","in","UINT"],["hMem","in, optional","HANDLE"]],"rtype":"HANDLE","type":"function","name":"SetClipboardData"},
	{"params":[["hWndNewViewer","in","HWND"]],"rtype":"HWND","type":"function","name":"SetClipboardViewer"},
	{"params":[["idThread","in","DWORD"],["pgui","in, out","LPGUITHREADINFO"]],"rtype":"BOOL","type":"function","name":"GetGUIThreadInfo"},
	{"params":[["hWnd","in","HWND"],["Msg","in","UINT"],["wParam","in","WPARAM"],["lParam","in","LPARAM"],["lpResultCallBack","in","SENDASYNCPROC"],["dwData","in","ULONG_PTR"]],"rtype":"BOOL","type":"function","name":"SendMessageCallbackA"},
	{"params":[["hWnd","in","HWND"],["Msg","in","UINT"],["wParam","in","WPARAM"],["lParam","in","LPARAM"],["lpResultCallBack","in","SENDASYNCPROC"],["dwData","in","ULONG_PTR"]],"rtype":"BOOL","type":"function","name":"SendMessageCallbackW"}]
//console.log(user32extract.reduce((a,b)=>{a[b.name]=[wintypes[b.rtype],b.params.map(_=>wintypes[_[2]])];return a;},{}))
winterface.User32= {...user32extract.reduce((a,b)=>{a[b.name]=[wintypes[b.rtype],b.params.map(_=>wintypes[_[2]])];return a;},{}),  'MessageBoxA': [ 'int', [ wintypes.HWND, wintypes.LPCSTR, wintypes.LPCSTR, wintypes.UINT ] ],
	'RegisterClassA':[wintypes.ATOM,[wintypes.PWNDCLASSA]],
	ActivateKeyboardLayout: [wintypes.HKL, [wintypes.HKL, wintypes.UINT]],
	//dAddClipboardFormatListener: [wintypes.BOOL, [wintypes.HWND]],
	AdjustWindowRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.DWORD, wintypes.BOOL]],
	AdjustWindowRectEx: [wintypes.BOOL, [wintypes.LPRECT, wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]],
	AdjustWindowRectExForDpi: [wintypes.BOOL, [wintypes.LPRECT, wintypes.DWORD, wintypes.BOOL, wintypes.DWORD, wintypes.UINT]],
	AllowSetForegroundWindow: [wintypes.BOOL, [wintypes.DWORD]],
	AnimateWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD, wintypes.DWORD]],
	AnyPopup: [wintypes.BOOL, []],
	AppendMenuA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCSTR]],
	AppendMenuW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCWSTR]],
	AreDpiAwarenessContextsEqual: [wintypes.BOOL, [wintypes.DPI_AWARENESS_CONTEXT, wintypes.DPI_AWARENESS_CONTEXT]],
	ArrangeIconicWindows: [wintypes.UINT, [wintypes.HWND]],
	AttachThreadInput: [wintypes.BOOL, [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]],
	BeginDeferWindowPos: [wintypes.HDWP, [wintypes.INT]],
	BeginPaint: [wintypes.HDC, [wintypes.HWND, wintypes.LPPAINTSTRUCT]],
	BlockInput: [wintypes.BOOL, [wintypes.BOOL]],
	BringWindowToTop: [wintypes.BOOL, [wintypes.HWND]],
	BroadcastSystemMessage: [wintypes.LONG, [wintypes.DWORD, wintypes.LPDWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	BroadcastSystemMessageExA: [wintypes.LONG, [wintypes.DWORD, wintypes.LPDWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.PBSMINFO]],
	BroadcastSystemMessageExW: [wintypes.LONG, [wintypes.DWORD, wintypes.LPDWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.PBSMINFO]],
	BroadcastSystemMessageW: [wintypes.LONG, [wintypes.DWORD, wintypes.LPDWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	CalculatePopupWindowPosition: [wintypes.BOOL, [wintypes.POINT, wintypes.SIZE, wintypes.UINT, wintypes.RECT, wintypes.RECT]],
	CallMsgFilterA: [wintypes.BOOL, [wintypes.LPMSG, wintypes.INT]],
	CallMsgFilterW: [wintypes.BOOL, [wintypes.LPMSG, wintypes.INT]],
	CallNextHookEx: [wintypes.LRESULT, [wintypes.HHOOK, wintypes.INT, wintypes.WPARAM, wintypes.LPARAM]],
	CallWindowProcA: [wintypes.LRESULT, [wintypes.WNDPROC, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	CallWindowProcW: [wintypes.LRESULT, [wintypes.WNDPROC, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	CascadeWindows: [wintypes.WORD, [wintypes.HWND, wintypes.UINT, wintypes.RECT, wintypes.UINT, wintypes.HWND]],
	//dChangeClipboardChain: [wintypes.BOOL, [wintypes.HWND, wintypes.HWND]],
	ChangeDisplaySettingsA: [wintypes.LONG, [wintypes.DEVMODEA, wintypes.DWORD]],
	ChangeDisplaySettingsExA: [wintypes.LONG, [wintypes.LPCSTR, wintypes.DEVMODEA, wintypes.HWND, wintypes.DWORD, wintypes.LPVOID]],
	ChangeDisplaySettingsExW: [wintypes.LONG, [wintypes.LPCWSTR, wintypes.DEVMODEW, wintypes.HWND, wintypes.DWORD, wintypes.LPVOID]],
	ChangeDisplaySettingsW: [wintypes.LONG, [wintypes.DEVMODEW, wintypes.DWORD]],
	ChangeWindowMessageFilter: [wintypes.BOOL, [wintypes.UINT, wintypes.DWORD]],
	ChangeWindowMessageFilterEx: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.DWORD, wintypes.PCHANGEFILTERSTRUCT]],
	CharLowerA: [wintypes.LPSTR, [wintypes.LPSTR]],
	CharLowerBuffA: [wintypes.DWORD, [wintypes.LPSTR, wintypes.DWORD]],
	CharLowerBuffW: [wintypes.DWORD, [wintypes.LPWSTR, wintypes.DWORD]],
	CharLowerW: [wintypes.LPWSTR, [wintypes.LPWSTR]],
	CharNextA: [wintypes.LPSTR, [wintypes.LPCSTR]],
	CharNextExA: [wintypes.LPSTR, [wintypes.WORD, wintypes.LPCSTR, wintypes.DWORD]],
	CharNextW: [wintypes.LPWSTR, [wintypes.LPCWSTR]],
	CharPrevA: [wintypes.LPSTR, [wintypes.LPCSTR, wintypes.LPCSTR]],
	CharPrevExA: [wintypes.LPSTR, [wintypes.WORD, wintypes.LPCSTR, wintypes.LPCSTR, wintypes.DWORD]],
	CharPrevW: [wintypes.LPWSTR, [wintypes.LPCWSTR, wintypes.LPCWSTR]],
	CharToOemA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPSTR]],
	CharToOemBuffA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPSTR, wintypes.DWORD]],
	CharToOemBuffW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.LPSTR, wintypes.DWORD]],
	CharToOemW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.LPSTR]],
	CharUpperA: [wintypes.LPSTR, [wintypes.LPSTR]],
	CharUpperBuffA: [wintypes.DWORD, [wintypes.LPSTR, wintypes.DWORD]],
	CharUpperBuffW: [wintypes.DWORD, [wintypes.LPWSTR, wintypes.DWORD]],
	CharUpperW: [wintypes.LPWSTR, [wintypes.LPWSTR]],
	CheckDlgButton: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.UINT]],
	CheckMenuItem: [wintypes.DWORD, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	CheckMenuRadioItem: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.UINT, wintypes.UINT]],
	CheckRadioButton: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.INT]],
	ChildWindowFromPoint: [wintypes.HWND, [wintypes.HWND, wintypes.POINT]],
	ChildWindowFromPointEx: [wintypes.HWND, [wintypes.HWND, wintypes.POINT, wintypes.UINT]],
	ClientToScreen: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	ClipCursor: [wintypes.BOOL, [wintypes.RECT]],
	//dCloseClipboard: [wintypes.BOOL, []],
	CloseDesktop: [wintypes.BOOL, [wintypes.HDESK]],
	CloseGestureInfoHandle: [wintypes.BOOL, [wintypes.HGESTUREINFO]],
	CloseTouchInputHandle: [wintypes.BOOL, [wintypes.HTOUCHINPUT]],
	CloseWindow: [wintypes.BOOL, [wintypes.HWND]],
	CloseWindowStation: [wintypes.BOOL, [wintypes.HWINSTA]],
	CopyAcceleratorTableA: [wintypes.INT, [wintypes.HACCEL, wintypes.LPACCEL, wintypes.INT]],
	CopyAcceleratorTableW: [wintypes.INT, [wintypes.HACCEL, wintypes.LPACCEL, wintypes.INT]],
	//	CopyCursor: [wintypes.VOID, [wintypes.HCURSOR]],
	CopyIcon: [wintypes.HICON, [wintypes.HICON]],
	CopyImage: [wintypes.HANDLE, [wintypes.HANDLE, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	CopyRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.RECT]],
	CopyImage: [wintypes.HANDLE, [wintypes.HANDLE, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	CreateAcceleratorTableA: [wintypes.HACCEL, [wintypes.LPACCEL, wintypes.INT]],
	CreateAcceleratorTableW: [wintypes.HACCEL, [wintypes.LPACCEL, wintypes.INT]],
	CreateCaret: [wintypes.BOOL, [wintypes.HWND, wintypes.HBITMAP, wintypes.INT, wintypes.INT]],
	CreateCursor: [wintypes.HCURSOR, [wintypes.HINSTANCE, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.VOID, wintypes.VOID]],
	CreateDesktopA: [wintypes.HDESK, [wintypes.LPCSTR, wintypes.LPCSTR, wintypes.DEVMODEA, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES]],
	CreateDesktopExA: [wintypes.HDESK, [wintypes.LPCSTR, wintypes.LPCSTR, wintypes.DEVMODEA, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES, wintypes.ULONG, wintypes.PVOID]],
	CreateDesktopExW: [wintypes.HDESK, [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DEVMODEW, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES, wintypes.ULONG, wintypes.PVOID]],
	CreateDesktopW: [wintypes.HDESK, [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DEVMODEW, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES]],
	//	CreateDialogIndirectA: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATE, wintypes.HWND, wintypes.DLGPROC]],
	CreateDialogIndirectParamA: [wintypes.HWND, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATEA, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	CreateDialogIndirectParamW: [wintypes.HWND, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATEW, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	//	CreateDialogIndirectW: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATE, wintypes.HWND, wintypes.DLGPROC]],
	CreateDialogParamA: [wintypes.HWND, [wintypes.HINSTANCE, wintypes.LPCSTR, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	CreateDialogParamW: [wintypes.HWND, [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	//	CreateDialogW: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCTSTR, wintypes.HWND, wintypes.DLGPROC]],
	CreateIcon: [wintypes.HICON, [wintypes.HINSTANCE, wintypes.INT, wintypes.INT, wintypes.BYTE, wintypes.BYTE, wintypes.BYTE, wintypes.BYTE]],
	CreateIconFromResource: [wintypes.HICON, [wintypes.PBYTE, wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]],
	CreateIconFromResourceEx: [wintypes.HICON, [wintypes.PBYTE, wintypes.DWORD, wintypes.BOOL, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.UINT]],
	CreateIconIndirect: [wintypes.HICON, [wintypes.PICONINFO]],
	CreateMDIWindowA: [wintypes.HWND, [wintypes.LPCSTR, wintypes.LPCSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HINSTANCE, wintypes.LPARAM]],
	CreateMDIWindowW: [wintypes.HWND, [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HINSTANCE, wintypes.LPARAM]],
	CreateMenu: [wintypes.HMENU, []],
	CreatePopupMenu: [wintypes.HMENU, []],
	CreateSyntheticPointerDevice: [wintypes.HSYNTHETICPOINTERDEVICE, [wintypes.POINTER_INPUT_TYPE, wintypes.ULONG, wintypes.POINTER_FEEDBACK_MODE]],
	//	CreateWindowA: [wintypes.VOID, [wintypes.LPCTSTR, wintypes.LPCTSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]],
	CreateWindowExA: [wintypes.HWND, [wintypes.DWORD, wintypes.LPCSTR, wintypes.LPCSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]],
	CreateWindowExW: [wintypes.HWND, [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]],/*
			CreateWindowStationA: [wintypes.HWINSTA, [wintypes.LPCSTR, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES]],
			CreateWindowStationW: [wintypes.HWINSTA, [wintypes.LPCWSTR, wintypes.DWORD, wintypes.ACCESS_MASK, wintypes.LPSECURITY_ATTRIBUTES]],
			CreateWindowW: [wintypes.VOID, [wintypes.LPCTSTR, wintypes.LPCTSTR, wintypes.DWORD, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]],
			DefDlgProcW: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
			DeferWindowPos: [wintypes.HDWP, [wintypes.HDWP, wintypes.HWND, wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.UINT]],*/
	DefFrameProcA: [wintypes.LRESULT, [wintypes.HWND, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DefFrameProcW: [wintypes.LRESULT, [wintypes.HWND, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DefMDIChildProcA: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DefMDIChildProcW: [wintypes.LRESULT,  [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DefRawInputProc: [wintypes.LRESULT, [wintypes.PRAWINPUT, wintypes.INT, wintypes.UINT]],
	DefWindowProcA: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DefWindowProcW: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	DeleteMenu: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	DeregisterShellHookWindow: [wintypes.BOOL, [wintypes.HWND]],
	DestroyAcceleratorTable: [wintypes.BOOL, [wintypes.HACCEL]],
	DestroyCaret: [wintypes.BOOL, []],
	DestroyCursor: [wintypes.BOOL, [wintypes.HCURSOR]],
	DestroyIcon: [wintypes.BOOL, [wintypes.HICON]],// just crashes?
	DestroyMenu: [wintypes.BOOL, [wintypes.HMENU]],
	DestroySyntheticPointerDevice: [wintypes.VOID, [wintypes.HSYNTHETICPOINTERDEVICE]],
	DestroyWindow: [wintypes.BOOL, [wintypes.HWND]],
	//DialogBoxA: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCTSTR, wintypes.HWND, wintypes.DLGPROC]],
	//DialogBoxIndirectA: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATE, wintypes.HWND, wintypes.DLGPROC]],
	DialogBoxIndirectParamA: [wintypes.INT_PTR, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATEA, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	DialogBoxIndirectParamW: [wintypes.INT_PTR, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATEW, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	//DialogBoxIndirectW: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATE, wintypes.HWND, wintypes.DLGPROC]],
	DialogBoxParamA: [wintypes.INT_PTR, [wintypes.HINSTANCE, wintypes.LPCSTR, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	DialogBoxParamW: [wintypes.INT_PTR, [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]],
	//	DialogBoxW: [wintypes.VOID, [wintypes.HINSTANCE, wintypes.LPCTSTR, wintypes.HWND, wintypes.DLGPROC]],
	DisableProcessWindowsGhosting: [wintypes.VOID, []],
	//	DispatchMessage: [wintypes.LRESULT, [wintypes.MSG]],
	DispatchMessageA: [wintypes.LRESULT, [wintypes.PMSG]],
	DispatchMessageW: [wintypes.LRESULT, [wintypes.PMSG]],
	//DisplayConfigGetDeviceInfo: [wintypes.LONG, [wintypes.DISPLAYCONFIG_DEVICE_INFO_HEADER]],
	//DisplayConfigSetDeviceInfo: [wintypes.LONG, [wintypes.DISPLAYCONFIG_DEVICE_INFO_HEADER]],
	DlgDirListA: [wintypes.INT, [wintypes.HWND, wintypes.LPSTR, wintypes.INT, wintypes.INT, wintypes.UINT]],
	DlgDirListComboBoxA: [wintypes.INT, [wintypes.HWND, wintypes.LPSTR, wintypes.INT, wintypes.INT, wintypes.UINT]],
	DlgDirListComboBoxW: [wintypes.INT, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT, wintypes.INT, wintypes.UINT]],
	DlgDirListW: [wintypes.INT, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT, wintypes.INT, wintypes.UINT]],
	DlgDirSelectComboBoxExA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPSTR, wintypes.INT, wintypes.INT]],
	DlgDirSelectComboBoxExW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT, wintypes.INT]],
	DlgDirSelectExA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPSTR, wintypes.INT, wintypes.INT]],
	DlgDirSelectExW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT, wintypes.INT]],
	DragDetect: [wintypes.BOOL, [wintypes.HWND, wintypes.POINT]],
	DrawAnimatedRects: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.RECT, wintypes.RECT]],
	DrawCaption: [wintypes.BOOL, [wintypes.HWND, wintypes.HDC, wintypes.RECT, wintypes.UINT]],
	DrawEdge: [wintypes.BOOL, [wintypes.HDC, wintypes.LPRECT, wintypes.UINT, wintypes.UINT]],
	DrawFocusRect: [wintypes.BOOL, [wintypes.HDC, wintypes.RECT]],
	DrawFrameControl: [wintypes.BOOL, [wintypes.HDC, wintypes.LPRECT, wintypes.UINT, wintypes.UINT]],
	DrawIcon: [wintypes.BOOL, [wintypes.HDC, wintypes.INT, wintypes.INT, wintypes.HICON]],
	DrawIconEx: [wintypes.BOOL, [wintypes.HDC, wintypes.INT, wintypes.INT, wintypes.HICON, wintypes.INT, wintypes.INT, wintypes.UINT, wintypes.HBRUSH, wintypes.UINT]],
	DrawMenuBar: [wintypes.BOOL, [wintypes.HWND]],
	//DrawStateA: [wintypes.BOOL, [wintypes.HDC, wintypes.HBRUSH, wintypes.DRAWSTATEPROC, wintypes.LPARAM, wintypes.WPARAM, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	//DrawStateW: [wintypes.BOOL, [wintypes.HDC, wintypes.HBRUSH, wintypes.DRAWSTATEPROC, wintypes.LPARAM, wintypes.WPARAM, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	//DrawText: [wintypes.INT, [wintypes.HDC, wintypes.LPCTSTR, wintypes.INT, wintypes.LPRECT, wintypes.UINT]],
	DrawTextA: [wintypes.INT, [wintypes.HDC, wintypes.LPCSTR, wintypes.INT, wintypes.LPRECT, wintypes.UINT]],/*
			DrawTextExA: [wintypes.INT, [wintypes.HDC, wintypes.LPSTR, wintypes.INT, wintypes.LPRECT, wintypes.UINT, wintypes.LPDRAWTEXTPARAMS]],
			DrawTextExW: [wintypes.INT, [wintypes.HDC, wintypes.LPWSTR, wintypes.INT, wintypes.LPRECT, wintypes.UINT, wintypes.LPDRAWTEXTPARAMS]],*/
	DrawTextW: [wintypes.INT, [wintypes.HDC, wintypes.LPCWSTR, wintypes.INT, wintypes.LPRECT, wintypes.UINT]],
	//dEmptyClipboard: [wintypes.BOOL, []],
	EnableMenuItem: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	EnableMouseInPointer: [wintypes.BOOL, [wintypes.BOOL]],
	EnableNonClientDpiScaling: [wintypes.BOOL, [wintypes.HWND]],
	EnableScrollBar: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.UINT]],
	EnableWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.BOOL]],
	EndDeferWindowPos: [wintypes.BOOL, [wintypes.HDWP]],
	EndDialog: [wintypes.BOOL, [wintypes.HWND, wintypes.INT_PTR]],
	EndMenu: [wintypes.BOOL, []],
	EndPaint: [wintypes.BOOL, [wintypes.HWND, wintypes.PPAINTSTRUCT]],
	EndTask: [wintypes.BOOL, [wintypes.HWND, wintypes.BOOL, wintypes.BOOL]],
	EnumChildWindows: [wintypes.BOOL, [wintypes.HWND, wintypes.WNDENUMPROC, wintypes.LPARAM]],
	//dEnumClipboardFormats: [wintypes.UINT, [wintypes.UINT]],
	//EnumDesktopsA: [wintypes.BOOL, [wintypes.HWINSTA, wintypes.DESKTOPENUMPROCA, wintypes.LPARAM]],
	//EnumDesktopsW: [wintypes.BOOL, [wintypes.HWINSTA, wintypes.DESKTOPENUMPROCW, wintypes.LPARAM]],
	EnumDesktopWindows: [wintypes.BOOL, [wintypes.HDESK, wintypes.WNDENUMPROC, wintypes.LPARAM]],
	//EnumDisplayDevicesA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.DWORD, wintypes.PDISPLAY_DEVICEA, wintypes.DWORD]],
	//EnumDisplayDevicesW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.DWORD, wintypes.PDISPLAY_DEVICEW, wintypes.DWORD]],
	//EnumDisplayMonitors: [wintypes.BOOL, [wintypes.HDC, wintypes.LPCRECT, wintypes.MONITORENUMPROC, wintypes.LPARAM]],
	EnumDisplaySettingsA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.DWORD, wintypes.DEVMODEA]],
	EnumDisplaySettingsExA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.DWORD, wintypes.DEVMODEA, wintypes.DWORD]],
	EnumDisplaySettingsExW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DEVMODEW, wintypes.DWORD]],
	EnumDisplaySettingsW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DEVMODEW]],
	//EnumPropsA: [wintypes.INT, [wintypes.HWND, wintypes.PROPENUMPROCA]],
	//EnumPropsExA: [wintypes.INT, [wintypes.HWND, wintypes.PROPENUMPROCEXA, wintypes.LPARAM]],
	//EnumPropsExW: [wintypes.INT, [wintypes.HWND, wintypes.PROPENUMPROCEXW, wintypes.LPARAM]],
	//EnumPropsW: [wintypes.INT, [wintypes.HWND, wintypes.PROPENUMPROCW]],
	EnumThreadWindows: [wintypes.BOOL, [wintypes.DWORD, wintypes.WNDENUMPROC, wintypes.LPARAM]],
	EnumWindows: [wintypes.BOOL, [wintypes.WNDENUMPROC, wintypes.LPARAM]],
	//EnumWindowStationsA: [wintypes.BOOL, [wintypes.WINSTAENUMPROCA, wintypes.LPARAM]],
	//EnumWindowStationsW: [wintypes.BOOL, [wintypes.WINSTAENUMPROCW, wintypes.LPARAM]],
	EqualRect: [wintypes.BOOL, [wintypes.RECT, wintypes.RECT]],
	//EvaluateProximityToPolygon: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINT, wintypes.TOUCH_HIT_TESTING_INPUT, wintypes.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION]],
	//EvaluateProximityToRect: [wintypes.BOOL, [wintypes.RECT, wintypes.TOUCH_HIT_TESTING_INPUT, wintypes.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION]],
	ExcludeUpdateRgn: [wintypes.INT, [wintypes.HDC, wintypes.HWND]],
	//	ExitWindows: [wintypes.VOID, [wintypes.INT, wintypes.LONG]],
	ExitWindowsEx: [wintypes.BOOL, [wintypes.UINT, wintypes.DWORD]],
	FillRect: [wintypes.INT, [wintypes.HDC, wintypes.PRECT, wintypes.HBRUSH]],
	FindWindowA: [wintypes.HWND, [wintypes.LPCSTR, wintypes.LPCSTR]],
	FindWindowExA: [wintypes.HWND, [wintypes.HWND, wintypes.HWND, wintypes.LPCSTR, wintypes.LPCSTR]],
	FindWindowExW: [wintypes.HWND, [wintypes.HWND, wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR]],
	FindWindowW: [wintypes.HWND, [wintypes.LPCWSTR, wintypes.LPCWSTR]],
	FlashWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.BOOL]],
	//FlashWindowEx: [wintypes.BOOL, [wintypes.PFLASHWINFO]],
	FrameRect: [wintypes.INT, [wintypes.HDC, wintypes.RECT, wintypes.HBRUSH]],
	GetActiveWindow: [wintypes.HWND, []],
	//GetAltTabInfoA: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.PALTTABINFO, wintypes.LPSTR, wintypes.UINT]],
	//GetAltTabInfoW: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.PALTTABINFO, wintypes.LPWSTR, wintypes.UINT]],
	GetAncestor: [wintypes.HWND, [wintypes.HWND, wintypes.UINT]],
	GetAsyncKeyState: [wintypes.SHORT, [wintypes.INT]],
	//GetAutoRotationState: [wintypes.BOOL, [wintypes.PAR_STATE]],
	GetAwarenessFromDpiAwarenessContext: [wintypes.DPI_AWARENESS, [wintypes.DPI_AWARENESS_CONTEXT]],
	GetCapture: [wintypes.HWND, []],
	GetCaretBlinkTime: [wintypes.UINT, []],
	GetCaretPos: [wintypes.BOOL, [wintypes.LPPOINT]],
	//GetCIMSSM: [wintypes.BOOL, [wintypes.INPUT_MESSAGE_SOURCE]],
	GetClassInfoA: [wintypes.BOOL, [wintypes.HINSTANCE, wintypes.LPCSTR, wintypes.LPWNDCLASSA]],
	GetClassInfoExA: [wintypes.BOOL, [wintypes.HINSTANCE, wintypes.LPCSTR, wintypes.LPWNDCLASSEXA]],
	GetClassInfoExW: [wintypes.BOOL, [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.LPWNDCLASSEXW]],
	//GetClassInfoW: [wintypes.BOOL, [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.LPWNDCLASSW]],
	//GetClassLongA: [wintypes.DWORD, [wintypes.HWND, wintypes.INT]],
	GetClassLongPtrA: [wintypes.ULONG_PTR, [wintypes.HWND, wintypes.INT]],
	GetClassLongPtrW: [wintypes.ULONG_PTR, [wintypes.HWND, wintypes.INT]],
	GetClassLongW: [wintypes.DWORD, [wintypes.HWND, wintypes.INT]],
	//GetClassName: [wintypes.INT, [wintypes.HWND, wintypes.LPTSTR, wintypes.INT]],
	GetClassNameA: [wintypes.INT, [wintypes.HWND, wintypes.LPSTR, wintypes.INT]],
	GetClassNameW: [wintypes.INT, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT]],
	GetClassWord: [wintypes.WORD, [wintypes.HWND, wintypes.INT]],
	GetClientRect: [wintypes.BOOL, [wintypes.HWND, wintypes.LPRECT]],
	//dGetClipboardData: [wintypes.HANDLE, [wintypes.UINT]],
	//dGetClipboardFormatNameA: [wintypes.INT, [wintypes.UINT, wintypes.LPSTR, wintypes.INT]],
	//dGetClipboardFormatNameW: [wintypes.INT, [wintypes.UINT, wintypes.LPWSTR, wintypes.INT]],
	//dGetClipboardOwner: [wintypes.HWND, []],
	//dGetClipboardSequenceNumber: [wintypes.DWORD, []],
	//dGetClipboardViewer: [wintypes.HWND, []],
	GetClipCursor: [wintypes.BOOL, [wintypes.LPRECT]],
	//GetComboBoxInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.PCOMBOBOXINFO]],
	//GetCurrentInputMessageSource: [wintypes.BOOL, [wintypes.INPUT_MESSAGE_SOURCE]],
	GetCursor: [wintypes.HCURSOR, []],
	//GetCursorInfo: [wintypes.BOOL, [wintypes.PCURSORINFO]],
	GetCursorPos: [wintypes.BOOL, [wintypes.LPPOINT]],
	GetDC: [wintypes.HDC, [wintypes.HWND]],
	GetDCEx: [wintypes.HDC, [wintypes.HWND, wintypes.HRGN, wintypes.DWORD]],
	GetDesktopWindow: [wintypes.HWND, []],
	GetDialogBaseUnits: [wintypes.LONG, []],
	//GetDialogControlDpiChangeBehavior: [wintypes.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS, [wintypes.HWND]],
	//GetDialogDpiChangeBehavior: [wintypes.DIALOG_DPI_CHANGE_BEHAVIORS, [wintypes.HWND]],
	//GetDisplayAutoRotationPreferences: [wintypes.BOOL, [wintypes.ORIENTATION_PREFERENCE]],
	//GetDisplayAutoRotationPreferencesByProcessId: [wintypes.BOOL, [wintypes.DWORD, wintypes.ORIENTATION_PREFERENCE, wintypes.PBOOL]],
	GetDisplayConfigBufferSizes: [wintypes.LONG, [wintypes.UINT32, wintypes.UINT32, wintypes.UINT32]],
	GetDlgCtrlID: [wintypes.INT, [wintypes.HWND]],
	GetDlgItem: [wintypes.HWND, [wintypes.HWND, wintypes.INT]],
	GetDlgItemInt: [wintypes.UINT, [wintypes.HWND, wintypes.INT, wintypes.BOOL, wintypes.BOOL]],
	GetDlgItemTextA: [wintypes.UINT, [wintypes.HWND, wintypes.INT, wintypes.LPSTR, wintypes.INT]],
	GetDlgItemTextW: [wintypes.UINT, [wintypes.HWND, wintypes.INT, wintypes.LPWSTR, wintypes.INT]],
	GetDoubleClickTime: [wintypes.UINT, []],
	GetDpiForSystem: [wintypes.UINT, []],
	GetDpiForWindow: [wintypes.UINT, [wintypes.HWND]],
	GetDpiFromDpiAwarenessContext: [wintypes.UINT, [wintypes.DPI_AWARENESS_CONTEXT]],
	GetFocus: [wintypes.HWND, []],
	GetForegroundWindow: [wintypes.HWND, []],
	//GetGestureConfig: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD, wintypes.DWORD, wintypes.PUINT, wintypes.PGESTURECONFIG, wintypes.UINT]],
	GetGestureExtraArgs: [wintypes.BOOL, [wintypes.HGESTUREINFO, wintypes.UINT, wintypes.PBYTE]],
	//GetGestureInfo: [wintypes.BOOL, [wintypes.HGESTUREINFO, wintypes.PGESTUREINFO]],
	GetGuiResources: [wintypes.DWORD, [wintypes.HANDLE, wintypes.DWORD]],
	//dGetGUIThreadInfo: [wintypes.BOOL, [wintypes.DWORD, wintypes.PGUITHREADINFO]],
	GetIconInfo: [wintypes.BOOL, [wintypes.HICON, wintypes.PICONINFO]],
	//GetIconInfoExA: [wintypes.BOOL, [wintypes.HICON, wintypes.PICONINFOEXA]],
	//GetIconInfoExW: [wintypes.BOOL, [wintypes.HICON, wintypes.PICONINFOEXW]],
	GetInputState: [wintypes.BOOL, []],
	GetKBCodePage: [wintypes.UINT, []],
	GetKeyboardLayout: [wintypes.HKL, [wintypes.DWORD]],
	GetKeyboardLayoutList: [wintypes.INT, [wintypes.INT, wintypes.HKL]],
	GetKeyboardLayoutNameA: [wintypes.BOOL, [wintypes.LPSTR]],
	GetKeyboardLayoutNameW: [wintypes.BOOL, [wintypes.LPWSTR]],
	GetKeyboardState: [wintypes.BOOL, [wintypes.PBYTE]],
	GetKeyboardType: [wintypes.INT, [wintypes.INT]],
	GetKeyNameTextA: [wintypes.INT, [wintypes.LONG, wintypes.LPSTR, wintypes.INT]],
	GetKeyNameTextW: [wintypes.INT, [wintypes.LONG, wintypes.LPWSTR, wintypes.INT]],
	GetKeyState: [wintypes.SHORT, [wintypes.INT]],
	GetLastActivePopup: [wintypes.HWND, [wintypes.HWND]],
	//GetLastInputInfo: [wintypes.BOOL, [wintypes.PLASTINPUTINFO]],
	GetLayeredWindowAttributes: [wintypes.BOOL, [wintypes.HWND, wintypes.COLORREF, wintypes.BYTE, wintypes.DWORD]],
	GetListBoxInfo: [wintypes.DWORD, [wintypes.HWND]],
	GetMenu: [wintypes.HMENU, [wintypes.HWND]],
	//GetMenuBarInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.LONG, wintypes.LONG, wintypes.PMENUBARINFO]],
	GetMenuCheckMarkDimensions: [wintypes.LONG, []],
	GetMenuContextHelpId: [wintypes.DWORD, [wintypes.HMENU]],
	GetMenuDefaultItem: [wintypes.UINT, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	//GetMenuInfo: [wintypes.BOOL, [wintypes.HMENU, wintypes.LPMENUINFO]],
	GetMenuItemCount: [wintypes.INT, [wintypes.HMENU]],
	GetMenuItemID: [wintypes.UINT, [wintypes.HMENU, wintypes.INT]],
	//GetMenuItemInfoA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPMENUITEMINFOA]],
	//GetMenuItemInfoW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPMENUITEMINFOW]],
	GetMenuItemRect: [wintypes.BOOL, [wintypes.HWND, wintypes.HMENU, wintypes.UINT, wintypes.LPRECT]],
	GetMenuState: [wintypes.UINT, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	GetMenuStringA: [wintypes.INT, [wintypes.HMENU, wintypes.UINT, wintypes.LPSTR, wintypes.INT, wintypes.UINT]],
	GetMenuStringW: [wintypes.INT, [wintypes.HMENU, wintypes.UINT, wintypes.LPWSTR, wintypes.INT, wintypes.UINT]],
	//	GetMessage: [wintypes.BOOL, [wintypes.LPMSG, wintypes.HWND, wintypes.UINT, wintypes.UINT]],
	GetMessageA: [wintypes.BOOL, [wintypes.LPMSG, wintypes.HWND, wintypes.UINT, wintypes.UINT]],
	GetMessageExtraInfo: [wintypes.LPARAM, []],
	GetMessagePos: [wintypes.DWORD, []],
	GetMessageTime: [wintypes.LONG, []],
	GetMessageW: [wintypes.BOOL, [wintypes.LPMSG, wintypes.HWND, wintypes.UINT, wintypes.UINT]],
	//GetMonitorInfoA: [wintypes.BOOL, [wintypes.HMONITOR, wintypes.LPMONITORINFO]],
	//GetMonitorInfoW: [wintypes.BOOL, [wintypes.HMONITOR, wintypes.LPMONITORINFO]],
	//GetMouseMovePointsEx: [wintypes.INT, [wintypes.UINT, wintypes.LPMOUSEMOVEPOINT, wintypes.LPMOUSEMOVEPOINT, wintypes.INT, wintypes.DWORD]],
	GetNextDlgGroupItem: [wintypes.HWND, [wintypes.HWND, wintypes.HWND, wintypes.BOOL]],
	GetNextDlgTabItem: [wintypes.HWND, [wintypes.HWND, wintypes.HWND, wintypes.BOOL]],
	//GetNextWindow: [wintypes.VOID, []],
	//dGetOpenClipboardWindow: [wintypes.HWND, []],
	GetParent: [wintypes.HWND, [wintypes.HWND]],
	GetPhysicalCursorPos: [wintypes.BOOL, [wintypes.LPPOINT]],
	GetPointerCursorId: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32]],
	//GetPointerDevice: [wintypes.BOOL, [wintypes.HANDLE, wintypes.POINTER_DEVICE_INFO]],
	//GetPointerDeviceCursors: [wintypes.BOOL, [wintypes.HANDLE, wintypes.UINT32, wintypes.POINTER_DEVICE_CURSOR_INFO]],
	//GetPointerDeviceProperties: [wintypes.BOOL, [wintypes.HANDLE, wintypes.UINT32, wintypes.POINTER_DEVICE_PROPERTY]],
	GetPointerDeviceRects: [wintypes.BOOL, [wintypes.HANDLE, wintypes.RECT, wintypes.RECT]],
	//GetPointerDevices: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_DEVICE_INFO]],
	/*GetPointerFrameInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_INFO]],
			GetPointerFrameInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_INFO]],
			GetPointerFramePenInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_PEN_INFO]],
			GetPointerFramePenInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_PEN_INFO]],
			GetPointerFrameTouchInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_TOUCH_INFO]],
			GetPointerFrameTouchInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_TOUCH_INFO]],
			GetPointerInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_INFO]],
			GetPointerInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_INFO]],
			GetPointerInputTransform: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.INPUT_TRANSFORM]],
			GetPointerPenInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_PEN_INFO]],
			GetPointerPenInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_PEN_INFO]],
			GetPointerTouchInfo: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_TOUCH_INFO]],
			GetPointerTouchInfoHistory: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_TOUCH_INFO]],*/
	GetPointerType: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_INPUT_TYPE]],
	//dGetPriorityClipboardFormat: [wintypes.INT, [wintypes.UINT, wintypes.INT]],
	GetProcessDefaultLayout: [wintypes.BOOL, [wintypes.DWORD]],
	GetProcessWindowStation: [wintypes.HWINSTA, []],
	GetPropA: [wintypes.HANDLE, [wintypes.HWND, wintypes.LPCSTR]],
	GetPropW: [wintypes.HANDLE, [wintypes.HWND, wintypes.LPCWSTR]],
	GetQueueStatus: [wintypes.DWORD, [wintypes.UINT]],
	GetRawInputBuffer: [wintypes.UINT, [wintypes.PRAWINPUT, wintypes.PUINT, wintypes.UINT]],
	GetRawInputData: [wintypes.UINT, [wintypes.HRAWINPUT, wintypes.UINT, wintypes.LPVOID, wintypes.PUINT, wintypes.UINT]],
	GetRawInputDeviceInfoA: [wintypes.UINT, [wintypes.HANDLE, wintypes.UINT, wintypes.LPVOID, wintypes.PUINT]],
	GetRawInputDeviceInfoW: [wintypes.UINT, [wintypes.HANDLE, wintypes.UINT, wintypes.LPVOID, wintypes.PUINT]],
	GetRawInputDeviceList: [wintypes.UINT, [wintypes.PRAWINPUTDEVICELIST, wintypes.PUINT, wintypes.UINT]],
	//GetRawPointerDeviceData: [wintypes.BOOL, [wintypes.UINT32, wintypes.UINT32, wintypes.UINT32, wintypes.POINTER_DEVICE_PROPERTY, wintypes.LONG]],
	GetRegisteredRawInputDevices: [wintypes.UINT, [wintypes.PRAWINPUTDEVICE, wintypes.PUINT, wintypes.UINT]],
	//GetScrollBarInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.LONG, wintypes.PSCROLLBARINFO]],
	//GetScrollInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.LPSCROLLINFO]],
	GetScrollPos: [wintypes.INT, [wintypes.HWND, wintypes.INT]],
	GetScrollRange: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.LPINT, wintypes.LPINT]],
	GetShellWindow: [wintypes.HWND, []],
	GetSubMenu: [wintypes.HMENU, [wintypes.HMENU, wintypes.INT]],
	GetSysColor: [wintypes.DWORD, [wintypes.INT]],
	GetSysColorBrush: [wintypes.HBRUSH, [wintypes.INT]],
	GetSystemDpiForProcess: [wintypes.UINT, [wintypes.HANDLE]],
	GetSystemMenu: [wintypes.HMENU, [wintypes.HWND, wintypes.BOOL]],
	GetSystemMetrics: [wintypes.INT, [wintypes.INT]],
	GetSystemMetricsForDpi: [wintypes.INT, [wintypes.INT, wintypes.UINT]],
	GetTabbedTextExtentA: [wintypes.DWORD, [wintypes.HDC, wintypes.LPCSTR, wintypes.INT, wintypes.INT, wintypes.INT]],
	GetTabbedTextExtentW: [wintypes.DWORD, [wintypes.HDC, wintypes.LPCWSTR, wintypes.INT, wintypes.INT, wintypes.INT]],
	GetThreadDesktop: [wintypes.HDESK, [wintypes.DWORD]],
	GetThreadDpiAwarenessContext: [wintypes.DPI_AWARENESS_CONTEXT, []],
	//GetThreadDpiHostingBehavior: [wintypes.DPI_HOSTING_BEHAVIOR, []],
	//GetTitleBarInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.PTITLEBARINFO]],
	GetTopWindow: [wintypes.HWND, [wintypes.HWND]],
	GetTouchInputInfo: [wintypes.BOOL, [wintypes.HTOUCHINPUT, wintypes.UINT, wintypes.PTOUCHINPUT, wintypes.INT]],
	GetUnpredictedMessagePos: [wintypes.DWORD, []],
	//dGetUpdatedClipboardFormats: [wintypes.BOOL, [wintypes.PUINT, wintypes.UINT, wintypes.PUINT]],
	GetUpdateRect: [wintypes.BOOL, [wintypes.HWND, wintypes.LPRECT, wintypes.BOOL]],
	GetUpdateRgn: [wintypes.INT, [wintypes.HWND, wintypes.HRGN, wintypes.BOOL]],
	GetUserObjectInformationA: [wintypes.BOOL, [wintypes.HANDLE, wintypes.INT, wintypes.PVOID, wintypes.DWORD, wintypes.LPDWORD]],
	GetUserObjectInformationW: [wintypes.BOOL, [wintypes.HANDLE, wintypes.INT, wintypes.PVOID, wintypes.DWORD, wintypes.LPDWORD]],
	//GetUserObjectSecurity: [wintypes.BOOL, [wintypes.HANDLE, wintypes.PSECURITY_INFORMATION, wintypes.PSECURITY_DESCRIPTOR, wintypes.DWORD, wintypes.LPDWORD]],
	GetWindow: [wintypes.HWND, [wintypes.HWND, wintypes.UINT]],
	GetWindowContextHelpId: [wintypes.DWORD, [wintypes.HWND]],
	GetWindowDC: [wintypes.HDC, [wintypes.HWND]],
	GetWindowDisplayAffinity: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD]],
	GetWindowDpiAwarenessContext: [wintypes.DPI_AWARENESS_CONTEXT, [wintypes.HWND]],
	//GetWindowDpiHostingBehavior: [wintypes.DPI_HOSTING_BEHAVIOR, [wintypes.HWND]],
	//GetWindowFeedbackSetting: [wintypes.BOOL, [wintypes.HWND, wintypes.FEEDBACK_TYPE, wintypes.DWORD, wintypes.UINT32, wintypes.VOID]],
	//GetWindowInfo: [wintypes.BOOL, [wintypes.HWND, wintypes.PWINDOWINFO]],
	GetWindowLongA: [wintypes.LONG, [wintypes.HWND, wintypes.INT]],
	GetWindowLongPtrA: [wintypes.LONG_PTR, [wintypes.HWND, wintypes.INT]],
	GetWindowLongPtrW: [wintypes.LONG_PTR, [wintypes.HWND, wintypes.INT]],
	GetWindowLongW: [wintypes.LONG, [wintypes.HWND, wintypes.INT]],
	GetWindowModuleFileNameA: [wintypes.UINT, [wintypes.HWND, wintypes.LPSTR, wintypes.UINT]],
	GetWindowModuleFileNameW: [wintypes.UINT, [wintypes.HWND, wintypes.LPWSTR, wintypes.UINT]],
	//GetWindowPlacement: [wintypes.BOOL, [wintypes.HWND, wintypes.WINDOWPLACEMENT]],
	GetWindowRect: [wintypes.BOOL, [wintypes.HWND, wintypes.LPRECT]],
	GetWindowRgn: [wintypes.INT, [wintypes.HWND, wintypes.HRGN]],
	GetWindowRgnBox: [wintypes.INT, [wintypes.HWND, wintypes.LPRECT]],
	GetWindowTextA: [wintypes.INT, [wintypes.HWND, wintypes.LPSTR, wintypes.INT]],
	GetWindowTextLengthA: [wintypes.INT, [wintypes.HWND]],
	GetWindowTextLengthW: [wintypes.INT, [wintypes.HWND]],
	GetWindowTextW: [wintypes.INT, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT]],
	GetWindowThreadProcessId: [wintypes.DWORD, [wintypes.HWND, wintypes.LPDWORD]],
	//GrayStringA: [wintypes.BOOL, [wintypes.HDC, wintypes.HBRUSH, wintypes.GRAYSTRINGPROC, wintypes.LPARAM, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT]],
	//GrayStringW: [wintypes.BOOL, [wintypes.HDC, wintypes.HBRUSH, wintypes.GRAYSTRINGPROC, wintypes.LPARAM, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT]],
	HideCaret: [wintypes.BOOL, [wintypes.HWND]],
	HiliteMenuItem: [wintypes.BOOL, [wintypes.HWND, wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	InflateRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.INT, wintypes.INT]],
	InitializeTouchInjection: [wintypes.BOOL, [wintypes.UINT32, wintypes.DWORD]],
	//InjectSyntheticPointerInput: [wintypes.BOOL, [wintypes.HSYNTHETICPOINTERDEVICE, wintypes.POINTER_TYPE_INFO, wintypes.UINT32]],
	//InjectTouchInput: [wintypes.BOOL, [wintypes.UINT32, wintypes.POINTER_TOUCH_INFO]],
	InSendMessageEx: [wintypes.DWORD, [wintypes.LPVOID]],
	InsertMenuA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCSTR]],
	//InsertMenuItemA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPCMENUITEMINFOA]],
	//InsertMenuItemW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPCMENUITEMINFOW]],
	InsertMenuW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCWSTR]],
	InternalGetWindowText: [wintypes.INT, [wintypes.HWND, wintypes.LPWSTR, wintypes.INT]],
	IntersectRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.RECT, wintypes.RECT]],
	InvalidateRect: [wintypes.BOOL, [wintypes.HWND, wintypes.RECT, wintypes.BOOL]],
	InvalidateRgn: [wintypes.BOOL, [wintypes.HWND, wintypes.HRGN, wintypes.BOOL]],
	InvertRect: [wintypes.BOOL, [wintypes.HDC, wintypes.RECT]],
	IsCharAlphaA: [wintypes.BOOL, [wintypes.CHAR]],
	IsCharAlphaNumericA: [wintypes.BOOL, [wintypes.CHAR]],
	IsCharAlphaNumericW: [wintypes.BOOL, [wintypes.WCHAR]],
	IsCharAlphaW: [wintypes.BOOL, [wintypes.WCHAR]],
	IsCharLowerA: [wintypes.BOOL, [wintypes.CHAR]],
	IsCharLowerW: [wintypes.BOOL, [wintypes.WCHAR]],
	IsCharUpperA: [wintypes.BOOL, [wintypes.CHAR]],
	IsCharUpperW: [wintypes.BOOL, [wintypes.WCHAR]],
	IsChild: [wintypes.BOOL, [wintypes.HWND, wintypes.HWND]],
	//dIsClipboardFormatAvailable: [wintypes.BOOL, [wintypes.UINT]],
	IsDialogMessageA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPMSG]],
	IsDialogMessageW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPMSG]],
	IsDlgButtonChecked: [wintypes.UINT, [wintypes.HWND, wintypes.INT]],
	IsGUIThread: [wintypes.BOOL, [wintypes.BOOL]],
	IsHungAppWindow: [wintypes.BOOL, [wintypes.HWND]],
	IsIconic: [wintypes.BOOL, [wintypes.HWND]],
	IsImmersiveProcess: [wintypes.BOOL, [wintypes.HANDLE]],
	IsMenu: [wintypes.BOOL, [wintypes.HMENU]],
	IsMouseInPointerEnabled: [wintypes.BOOL, []],
	IsProcessDPIAware: [wintypes.BOOL, []],
	IsRectEmpty: [wintypes.BOOL, [wintypes.RECT]],
	IsTouchWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.PULONG]],
	IsValidDpiAwarenessContext: [wintypes.BOOL, [wintypes.DPI_AWARENESS_CONTEXT]],
	IsWindow: [wintypes.BOOL, [wintypes.HWND]],
	IsWindowEnabled: [wintypes.BOOL, [wintypes.HWND]],
	IsWindowUnicode: [wintypes.BOOL, [wintypes.HWND]],
	IsWindowVisible: [wintypes.BOOL, [wintypes.HWND]],
	IsWinEventHookInstalled: [wintypes.BOOL, [wintypes.DWORD]],
	IsWow64Message: [wintypes.BOOL, []],
	IsZoomed: [wintypes.BOOL, [wintypes.HWND]],
	keybd_event: [wintypes.VOID, [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, wintypes.ULONG_PTR]],
	KillTimer: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT_PTR]],
	LoadAcceleratorsA: [wintypes.HACCEL, [wintypes.HINSTANCE, wintypes.LPCSTR]],
	LoadAcceleratorsW: [wintypes.HACCEL, [wintypes.HINSTANCE, wintypes.LPCWSTR]],
	LoadBitmapA: [wintypes.HBITMAP, [wintypes.HINSTANCE, wintypes.LPCSTR]],
	LoadBitmapW: [wintypes.HBITMAP, [wintypes.HINSTANCE, wintypes.LPCWSTR]],
	LoadCursorA: [wintypes.HCURSOR, [wintypes.HINSTANCE, wintypes.LPCSTR]],
	LoadCursorFromFileA: [wintypes.HCURSOR, [wintypes.LPCSTR]],
	LoadCursorFromFileW: [wintypes.HCURSOR, [wintypes.LPCWSTR]],
	LoadCursorW: [wintypes.HCURSOR, [wintypes.HINSTANCE, wintypes.LPCWSTR]],
	LoadIconA: [wintypes.HICON, [wintypes.HINSTANCE, wintypes.LPCSTR]],
	LoadIconW: [wintypes.HICON, [wintypes.HINSTANCE, wintypes.LPCWSTR]],
	LoadImageA: [wintypes.HANDLE, [wintypes.HINSTANCE, wintypes.LPCSTR, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	LoadImageW: [wintypes.HANDLE, [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	LoadKeyboardLayoutA: [wintypes.HKL, [wintypes.LPCSTR, wintypes.UINT]],
	LoadKeyboardLayoutW: [wintypes.HKL, [wintypes.LPCWSTR, wintypes.UINT]],
	LoadMenuA: [wintypes.HMENU, [wintypes.HINSTANCE, wintypes.LPCSTR]],
	//LoadMenuIndirectA: [wintypes.HMENU, [wintypes.MENUTEMPLATEA]],
	//LoadMenuIndirectW: [wintypes.HMENU, [wintypes.MENUTEMPLATEW]],
	LoadMenuW: [wintypes.HMENU, [wintypes.HINSTANCE, wintypes.LPCWSTR]],
	LoadStringA: [wintypes.INT, [wintypes.HINSTANCE, wintypes.UINT, wintypes.LPSTR, wintypes.INT]],
	LoadStringW: [wintypes.INT, [wintypes.HINSTANCE, wintypes.UINT, wintypes.LPWSTR, wintypes.INT]],
	LockSetForegroundWindow: [wintypes.BOOL, [wintypes.UINT]],
	LockWindowUpdate: [wintypes.BOOL, [wintypes.HWND]],
	LockWorkStation: [wintypes.BOOL, []],
	LogicalToPhysicalPoint: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	LogicalToPhysicalPointForPerMonitorDPI: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	LookupIconIdFromDirectory: [wintypes.INT, [wintypes.PBYTE, wintypes.BOOL]],
	LookupIconIdFromDirectoryEx: [wintypes.INT, [wintypes.PBYTE, wintypes.BOOL, wintypes.INT, wintypes.INT, wintypes.UINT]],
	MapDialogRect: [wintypes.BOOL, [wintypes.HWND, wintypes.LPRECT]],
	MapVirtualKeyA: [wintypes.UINT, [wintypes.UINT, wintypes.UINT]],
	MapVirtualKeyExA: [wintypes.UINT, [wintypes.UINT, wintypes.UINT, wintypes.HKL]],
	MapVirtualKeyExW: [wintypes.UINT, [wintypes.UINT, wintypes.UINT, wintypes.HKL]],
	MapVirtualKeyW: [wintypes.UINT, [wintypes.UINT, wintypes.UINT]],
	MapWindowPoints: [wintypes.INT, [wintypes.HWND, wintypes.HWND, wintypes.LPPOINT, wintypes.UINT]],
	MenuItemFromPoint: [wintypes.INT, [wintypes.HWND, wintypes.HMENU, wintypes.POINT]],
	MessageBeep: [wintypes.BOOL, [wintypes.UINT]],
	//mMessageBox: [wintypes.INT, [wintypes.HWND, wintypes.LPCTSTR, wintypes.LPCTSTR, wintypes.UINT]],
	MessageBoxA: [wintypes.INT, [wintypes.HWND, wintypes.LPCSTR, wintypes.LPCSTR, wintypes.UINT]],
	MessageBoxExA: [wintypes.INT, [wintypes.HWND, wintypes.LPCSTR, wintypes.LPCSTR, wintypes.UINT, wintypes.WORD]],
	MessageBoxExW: [wintypes.INT, [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT, wintypes.WORD]],
	//MessageBoxIndirectA: [wintypes.INT, [wintypes.MSGBOXPARAMSA]],
	//MessageBoxIndirectW: [wintypes.INT, [wintypes.MSGBOXPARAMSW]],
	MessageBoxW: [wintypes.INT, [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT]],
	ModifyMenuA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCSTR]],
	ModifyMenuW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.UINT_PTR, wintypes.LPCWSTR]],
	MonitorFromPoint: [wintypes.HMONITOR, [wintypes.POINT, wintypes.DWORD]],
	MonitorFromRect: [wintypes.HMONITOR, [wintypes.LPCRECT, wintypes.DWORD]],
	MonitorFromWindow: [wintypes.HMONITOR, [wintypes.HWND, wintypes.DWORD]],
	mouse_event: [wintypes.VOID, [wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.ULONG_PTR]],
	MoveWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.BOOL]],
	MsgWaitForMultipleObjects: [wintypes.DWORD, [wintypes.DWORD, wintypes.HANDLE, wintypes.BOOL, wintypes.DWORD, wintypes.DWORD]],
	MsgWaitForMultipleObjectsEx: [wintypes.DWORD, [wintypes.DWORD, wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD]],
	NotifyWinEvent: [wintypes.VOID, [wintypes.DWORD, wintypes.HWND, wintypes.LONG, wintypes.LONG]],
	OemKeyScan: [wintypes.DWORD, [wintypes.WORD]],
	OemToCharA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPSTR]],
	OemToCharBuffA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPSTR, wintypes.DWORD]],
	OemToCharBuffW: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPWSTR, wintypes.DWORD]],
	OemToCharW: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.LPWSTR]],
	OffsetRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.INT, wintypes.INT]],
	//dOpenClipboard: [wintypes.BOOL, [wintypes.HWND]],
	OpenDesktopA: [wintypes.HDESK, [wintypes.LPCSTR, wintypes.DWORD, wintypes.BOOL, wintypes.ACCESS_MASK]],
	OpenDesktopW: [wintypes.HDESK, [wintypes.LPCWSTR, wintypes.DWORD, wintypes.BOOL, wintypes.ACCESS_MASK]],
	OpenIcon: [wintypes.BOOL, [wintypes.HWND]],
	OpenInputDesktop: [wintypes.HDESK, [wintypes.DWORD, wintypes.BOOL, wintypes.ACCESS_MASK]],
	OpenWindowStationA: [wintypes.HWINSTA, [wintypes.LPCSTR, wintypes.BOOL, wintypes.ACCESS_MASK]],
	OpenWindowStationW: [wintypes.HWINSTA, [wintypes.LPCWSTR, wintypes.BOOL, wintypes.ACCESS_MASK]],
	//PackTouchHitTestingProximityEvaluation: [wintypes.LRESULT, [wintypes.TOUCH_HIT_TESTING_INPUT, wintypes.TOUCH_HIT_TESTING_PROXIMITY_EVALUATION]],
	PaintDesktop: [wintypes.BOOL, [wintypes.HDC]],
	PeekMessageA: [wintypes.BOOL, [wintypes.LPMSG, wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]],
	PeekMessageW: [wintypes.BOOL, [wintypes.LPMSG, wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]],
	PhysicalToLogicalPoint: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	PhysicalToLogicalPointForPerMonitorDPI: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	PostMessageA: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	PostMessageW: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	PostQuitMessage: [wintypes.VOID, [wintypes.INT]],
	PostThreadMessageA: [wintypes.BOOL, [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	PostThreadMessageW: [wintypes.BOOL, [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	PrintWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.HDC, wintypes.UINT]],
	PrivateExtractIconsA: [wintypes.UINT, [wintypes.LPCSTR, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HICON, wintypes.UINT, wintypes.UINT, wintypes.UINT]],
	PrivateExtractIconsW: [wintypes.UINT, [wintypes.LPCWSTR, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HICON, wintypes.UINT, wintypes.UINT, wintypes.UINT]],
	PtInRect: [wintypes.BOOL, [wintypes.RECT, wintypes.POINT]],/*
			QueryDisplayConfig: [wintypes.LONG, [wintypes.UINT32, wintypes.UINT32, wintypes.DISPLAYCONFIG_PATH_INFO, wintypes.UINT32, wintypes.DISPLAYCONFIG_MODE_INFO, wintypes.DISPLAYCONFIG_TOPOLOGY_ID]],
			RealChildWindowFromPoint: [wintypes.HWND, [wintypes.HWND, wintypes.POINT]],
			RealGetWindowClassW: [wintypes.UINT, [wintypes.HWND, wintypes.LPWSTR, wintypes.UINT]],*/
	RedrawWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.RECT, wintypes.HRGN, wintypes.UINT]],
	RegisterClassExA: [wintypes.ATOM, [wintypes.PWNDCLASSEXA]],
	RegisterClassExW: [wintypes.ATOM, [wintypes.PWNDCLASSEXW]],
	//	RegisterClassW: [wintypes.ATOM, [wintypes.WNDCLASSW]],
	//dRegisterClipboardFormatA: [wintypes.UINT, [wintypes.LPCSTR]],
	//dRegisterClipboardFormatW: [wintypes.UINT, [wintypes.LPCWSTR]],
	/*	RegisterDeviceNotificationA: [wintypes.HDEVNOTIFY, [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD]],
			RegisterDeviceNotificationW: [wintypes.HDEVNOTIFY, [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD]],*/
	RegisterHotKey: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.UINT, wintypes.UINT]],
	RegisterPointerDeviceNotifications: [wintypes.BOOL, [wintypes.HWND, wintypes.BOOL]],/*
			RegisterPointerInputTarget: [wintypes.BOOL, [wintypes.HWND, wintypes.POINTER_INPUT_TYPE]],
			RegisterPointerInputTargetEx: [wintypes.BOOL, [wintypes.HWND, wintypes.POINTER_INPUT_TYPE, wintypes.BOOL]],
			RegisterPowerSettingNotification: [wintypes.HPOWERNOTIFY, [wintypes.HANDLE, wintypes.LPCGUID, wintypes.DWORD]],*/
	RegisterRawInputDevices: [wintypes.BOOL, [wintypes.PCRAWINPUTDEVICE, wintypes.UINT, wintypes.UINT]],
	RegisterShellHookWindow: [wintypes.BOOL, [wintypes.HWND]],
	RegisterSuspendResumeNotification: [wintypes.HPOWERNOTIFY, [wintypes.HANDLE, wintypes.DWORD]],
	RegisterTouchHitTestingWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.ULONG]],
	RegisterTouchWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.ULONG]],
	RegisterWindowMessageA: [wintypes.UINT, [wintypes.LPCSTR]],
	RegisterWindowMessageW: [wintypes.UINT, [wintypes.LPCWSTR]],
	ReleaseCapture: [wintypes.BOOL, []],
	ReleaseDC: [wintypes.INT, [wintypes.HWND, wintypes.HDC]],
	//dRemoveClipboardFormatListener: [wintypes.BOOL, [wintypes.HWND]],
	RemoveMenu: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	RemovePropA: [wintypes.HANDLE, [wintypes.HWND, wintypes.LPCSTR]],
	RemovePropW: [wintypes.HANDLE, [wintypes.HWND, wintypes.LPCWSTR]],
	ReplyMessage: [wintypes.BOOL, [wintypes.LRESULT]],
	ScreenToClient: [wintypes.BOOL, [wintypes.HWND, wintypes.LPPOINT]],
	ScrollDC: [wintypes.BOOL, [wintypes.HDC, wintypes.INT, wintypes.INT, wintypes.RECT, wintypes.RECT, wintypes.HRGN, wintypes.LPRECT]],
	ScrollWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.RECT, wintypes.RECT]],
	ScrollWindowEx: [wintypes.INT, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.RECT, wintypes.RECT, wintypes.HRGN, wintypes.LPRECT, wintypes.UINT]],
	SendDlgItemMessageA: [wintypes.LRESULT, [wintypes.HWND, wintypes.INT, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	SendDlgItemMessageW: [wintypes.LRESULT, [wintypes.HWND, wintypes.INT, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	//dSendInput: [wintypes.UINT, [wintypes.UINT, wintypes.LPINPUT, wintypes.INT]],
	//mSendMessage: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	SendMessageA: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	//dSendMessageCallbackA: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.SENDASYNCPROC, wintypes.ULONG_PTR]],
	//dSendMessageCallbackW: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.SENDASYNCPROC, wintypes.ULONG_PTR]],
	//SendMessageTimeoutA: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.UINT, wintypes.UINT, wintypes.PDWORD_PTR]],
	//SendMessageTimeoutW: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM, wintypes.UINT, wintypes.UINT, wintypes.PDWORD_PTR]],
	SendMessageW: [wintypes.LRESULT, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	SendNotifyMessageA: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	SendNotifyMessageW: [wintypes.BOOL, [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]],
	SetActiveWindow: [wintypes.HWND, [wintypes.HWND]],
	SetCapture: [wintypes.HWND, [wintypes.HWND]],
	SetCaretBlinkTime: [wintypes.BOOL, [wintypes.UINT]],
	SetCaretPos: [wintypes.BOOL, [wintypes.INT, wintypes.INT]],
	SetClassLongA: [wintypes.DWORD, [wintypes.HWND, wintypes.INT, wintypes.LONG]],
	SetClassLongPtrA: [wintypes.ULONG_PTR, [wintypes.HWND, wintypes.INT, wintypes.LONG_PTR]],
	SetClassLongPtrW: [wintypes.ULONG_PTR, [wintypes.HWND, wintypes.INT, wintypes.LONG_PTR]],
	SetClassLongW: [wintypes.DWORD, [wintypes.HWND, wintypes.INT, wintypes.LONG]],
	SetClassWord: [wintypes.WORD, [wintypes.HWND, wintypes.INT, wintypes.WORD]],
	//dSetClipboardData: [wintypes.HANDLE, [wintypes.UINT, wintypes.HANDLE]],
	//dSetClipboardViewer: [wintypes.HWND, [wintypes.HWND]],
	//SetCoalescableTimer: [wintypes.UINT_PTR, [wintypes.HWND, wintypes.UINT_PTR, wintypes.UINT, wintypes.TIMERPROC, wintypes.ULONG]],
	SetCursor: [wintypes.HCURSOR, [wintypes.HCURSOR]],
	SetCursorPos: [wintypes.BOOL, [wintypes.INT, wintypes.INT]],
	//SetDialogControlDpiChangeBehavior: [wintypes.BOOL, [wintypes.HWND, wintypes.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS, wintypes.DIALOG_CONTROL_DPI_CHANGE_BEHAVIORS]],
	//SetDialogDpiChangeBehavior: [wintypes.BOOL, [wintypes.HWND, wintypes.DIALOG_DPI_CHANGE_BEHAVIORS, wintypes.DIALOG_DPI_CHANGE_BEHAVIORS]],
	//SetDisplayAutoRotationPreferences: [wintypes.BOOL, [wintypes.ORIENTATION_PREFERENCE]],
	//SetDisplayConfig: [wintypes.LONG, [wintypes.UINT32, wintypes.DISPLAYCONFIG_PATH_INFO, wintypes.UINT32, wintypes.DISPLAYCONFIG_MODE_INFO, wintypes.UINT32]],
	SetDlgItemInt: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.UINT, wintypes.BOOL]],
	SetDlgItemTextA: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.LPCSTR]],
	SetDlgItemTextW: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.LPCWSTR]],
	SetDoubleClickTime: [wintypes.BOOL, [wintypes.UINT]],
	SetFocus: [wintypes.HWND, [wintypes.HWND]],
	SetForegroundWindow: [wintypes.BOOL, [wintypes.HWND]],
	//SetGestureConfig: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD, wintypes.UINT, wintypes.PGESTURECONFIG, wintypes.UINT]],
	SetKeyboardState: [wintypes.BOOL, [wintypes.LPBYTE]],
	SetLastErrorEx: [wintypes.VOID, [wintypes.DWORD, wintypes.DWORD]],
	SetLayeredWindowAttributes: [wintypes.BOOL, [wintypes.HWND, wintypes.COLORREF, wintypes.BYTE, wintypes.DWORD]],
	SetMenu: [wintypes.BOOL, [wintypes.HWND, wintypes.HMENU]],
	SetMenuContextHelpId: [wintypes.BOOL, [wintypes.HMENU, wintypes.DWORD]],
	SetMenuDefaultItem: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT]],
	//SetMenuInfo: [wintypes.BOOL, [wintypes.HMENU, wintypes.LPCMENUINFO]],
	SetMenuItemBitmaps: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.UINT, wintypes.HBITMAP, wintypes.HBITMAP]],
	//SetMenuItemInfoA: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPCMENUITEMINFOA]],
	//SetMenuItemInfoW: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.BOOL, wintypes.LPCMENUITEMINFOW]],
	SetMessageExtraInfo: [wintypes.LPARAM, [wintypes.LPARAM]],
	SetParent: [wintypes.HWND, [wintypes.HWND, wintypes.HWND]],
	SetPhysicalCursorPos: [wintypes.BOOL, [wintypes.INT, wintypes.INT]],
	SetProcessDefaultLayout: [wintypes.BOOL, [wintypes.DWORD]],
	SetProcessDPIAware: [wintypes.BOOL, []],
	SetProcessDpiAwarenessContext: [wintypes.BOOL, [wintypes.DPI_AWARENESS_CONTEXT]],
	SetProcessRestrictionExemption: [wintypes.BOOL, [wintypes.BOOL]],
	SetProcessWindowStation: [wintypes.BOOL, [wintypes.HWINSTA]],
	SetPropA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCSTR, wintypes.HANDLE]],
	SetPropW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCWSTR, wintypes.HANDLE]],
	SetRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT]],
	SetRectEmpty: [wintypes.BOOL, [wintypes.LPRECT]],
	//SetScrollInfo: [wintypes.INT, [wintypes.HWND, wintypes.INT, wintypes.LPCSCROLLINFO, wintypes.BOOL]],
	SetScrollPos: [wintypes.INT, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.BOOL]],
	SetScrollRange: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.BOOL]],
	SetSysColors: [wintypes.BOOL, [wintypes.INT, wintypes.INT, wintypes.COLORREF]],
	SetSystemCursor: [wintypes.BOOL, [wintypes.HCURSOR, wintypes.DWORD]],
	SetThreadDesktop: [wintypes.BOOL, [wintypes.HDESK]],
	SetThreadDpiAwarenessContext: [wintypes.DPI_AWARENESS_CONTEXT, [wintypes.DPI_AWARENESS_CONTEXT]],
	//SetThreadDpiHostingBehavior: [wintypes.DPI_HOSTING_BEHAVIOR, [wintypes.DPI_HOSTING_BEHAVIOR]],
	//SetTimer: [wintypes.UINT_PTR, [wintypes.HWND, wintypes.UINT_PTR, wintypes.UINT, wintypes.TIMERPROC]],
	SetUserObjectInformationA: [wintypes.BOOL, [wintypes.HANDLE, wintypes.INT, wintypes.PVOID, wintypes.DWORD]],
	SetUserObjectInformationW: [wintypes.BOOL, [wintypes.HANDLE, wintypes.INT, wintypes.PVOID, wintypes.DWORD]],
	//SetUserObjectSecurity: [wintypes.BOOL, [wintypes.HANDLE, wintypes.PSECURITY_INFORMATION, wintypes.PSECURITY_DESCRIPTOR]],
	SetWindowContextHelpId: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD]],
	SetWindowDisplayAffinity: [wintypes.BOOL, [wintypes.HWND, wintypes.DWORD]],
	//SetWindowFeedbackSetting: [wintypes.BOOL, [wintypes.HWND, wintypes.FEEDBACK_TYPE, wintypes.DWORD, wintypes.UINT32, wintypes.VOID]],
	SetWindowLongA: [wintypes.LONG, [wintypes.HWND, wintypes.INT, wintypes.LONG]],
	SetWindowLongPtrA: [wintypes.LONG_PTR, [wintypes.HWND, wintypes.INT, wintypes.LONG_PTR]],
	SetWindowLongPtrW: [wintypes.LONG_PTR, [wintypes.HWND, wintypes.INT, wintypes.LONG_PTR]],
	SetWindowLongW: [wintypes.LONG, [wintypes.HWND, wintypes.INT, wintypes.LONG]],
	//SetWindowPlacement: [wintypes.BOOL, [wintypes.HWND, wintypes.WINDOWPLACEMENT]],
	SetWindowPos: [wintypes.BOOL, [wintypes.HWND, wintypes.HWND, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.UINT]],
	SetWindowRgn: [wintypes.INT, [wintypes.HWND, wintypes.HRGN, wintypes.BOOL]],
	SetWindowsHookExA: [wintypes.HHOOK, [wintypes.INT, wintypes.HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]],
	SetWindowsHookExW: [wintypes.HHOOK, [wintypes.INT, wintypes.HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]],
	SetWindowTextA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCSTR]],
	SetWindowTextW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCWSTR]],
	//SetWinEventHook: [wintypes.HWINEVENTHOOK, [wintypes.DWORD, wintypes.DWORD, wintypes.HMODULE, wintypes.WINEVENTPROC, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD]],*/
	ShowCaret: [wintypes.BOOL, [wintypes.HWND]],
	ShowCursor: [wintypes.INT, [wintypes.BOOL]],
	ShowOwnedPopups: [wintypes.BOOL, [wintypes.HWND, wintypes.BOOL]],
	ShowScrollBar: [wintypes.BOOL, [wintypes.HWND, wintypes.INT, wintypes.BOOL]],
	ShowWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.INT]],
	ShowWindowAsync: [wintypes.BOOL, [wintypes.HWND, wintypes.INT]],
	ShutdownBlockReasonCreate: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCWSTR]],
	ShutdownBlockReasonDestroy: [wintypes.BOOL, [wintypes.HWND]],
	ShutdownBlockReasonQuery: [wintypes.BOOL, [wintypes.HWND, wintypes.LPWSTR, wintypes.DWORD]],
	SkipPointerFrameMessages: [wintypes.BOOL, [wintypes.UINT]],
	SoundSentry: [wintypes.BOOL, []],
	SubtractRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.RECT, wintypes.RECT]],
	SwapMouseButton: [wintypes.BOOL, [wintypes.BOOL]],
	SwitchDesktop: [wintypes.BOOL, [wintypes.HDESK]],
	SwitchToThisWindow: [wintypes.VOID, [wintypes.HWND, wintypes.BOOL]],
	SystemParametersInfoA: [wintypes.BOOL, [wintypes.UINT, wintypes.UINT, wintypes.PVOID, wintypes.UINT]],
	SystemParametersInfoForDpi: [wintypes.BOOL, [wintypes.UINT, wintypes.UINT, wintypes.PVOID, wintypes.UINT, wintypes.UINT]],
	SystemParametersInfoW: [wintypes.BOOL, [wintypes.UINT, wintypes.UINT, wintypes.PVOID, wintypes.UINT]],
	TabbedTextOutA: [wintypes.LONG, [wintypes.HDC, wintypes.INT, wintypes.INT, wintypes.LPCSTR, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT]],
	TabbedTextOutW: [wintypes.LONG, [wintypes.HDC, wintypes.INT, wintypes.INT, wintypes.LPCWSTR, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT]],
	TileWindows: [wintypes.WORD, [wintypes.HWND, wintypes.UINT, wintypes.RECT, wintypes.UINT, wintypes.HWND]],
	ToAscii: [wintypes.INT, [wintypes.UINT, wintypes.UINT, wintypes.BYTE, wintypes.LPWORD, wintypes.UINT]],
	ToAsciiEx: [wintypes.INT, [wintypes.UINT, wintypes.UINT, wintypes.BYTE, wintypes.LPWORD, wintypes.UINT, wintypes.HKL]],
	//	TOUCH_COORD_TO_PIXEL: [wintypes.VOID, []],
	ToUnicode: [wintypes.INT, [wintypes.UINT, wintypes.UINT, wintypes.BYTE, wintypes.LPWSTR, wintypes.INT, wintypes.UINT]],
	ToUnicodeEx: [wintypes.INT, [wintypes.UINT, wintypes.UINT, wintypes.BYTE, wintypes.LPWSTR, wintypes.INT, wintypes.UINT, wintypes.HKL]],/*
			TrackMouseEvent: [wintypes.BOOL, [wintypes.LPTRACKMOUSEEVENT]],
			TrackPopupMenu: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.RECT]],
			TrackPopupMenuEx: [wintypes.BOOL, [wintypes.HMENU, wintypes.UINT, wintypes.INT, wintypes.INT, wintypes.HWND, wintypes.LPTPMPARAMS]],*/
	TranslateAcceleratorA: [wintypes.INT, [wintypes.HWND, wintypes.HACCEL, wintypes.LPMSG]],
	TranslateAcceleratorW: [wintypes.INT, [wintypes.HWND, wintypes.HACCEL, wintypes.LPMSG]],
	TranslateMDISysAccel: [wintypes.BOOL, [wintypes.HWND, wintypes.LPMSG]],
	TranslateMessage: [wintypes.BOOL, [wintypes.PMSG]],
	UnhookWindowsHookEx: [wintypes.BOOL, [wintypes.HHOOK]],
	UnhookWinEvent: [wintypes.BOOL, [wintypes.HWINEVENTHOOK]],
	UnionRect: [wintypes.BOOL, [wintypes.LPRECT, wintypes.RECT, wintypes.RECT]],
	UnloadKeyboardLayout: [wintypes.BOOL, [wintypes.HKL]],
	UnregisterClassA: [wintypes.BOOL, [wintypes.LPCSTR, wintypes.HINSTANCE]],
	UnregisterClassW: [wintypes.BOOL, [wintypes.LPCWSTR, wintypes.HINSTANCE]],
	UnregisterDeviceNotification: [wintypes.BOOL, [wintypes.HDEVNOTIFY]],
	UnregisterHotKey: [wintypes.BOOL, [wintypes.HWND, wintypes.INT]],
	UnregisterPointerInputTarget: [wintypes.BOOL, [wintypes.HWND, wintypes.POINTER_INPUT_TYPE]],
	UnregisterPointerInputTargetEx: [wintypes.BOOL, [wintypes.HWND, wintypes.POINTER_INPUT_TYPE]],
	UnregisterPowerSettingNotification: [wintypes.BOOL, [wintypes.HPOWERNOTIFY]],
	UnregisterSuspendResumeNotification: [wintypes.BOOL, [wintypes.HPOWERNOTIFY]],
	UnregisterTouchWindow: [wintypes.BOOL, [wintypes.HWND]],
	//UpdateLayeredWindow: [wintypes.BOOL, [wintypes.HWND, wintypes.HDC, wintypes.POINT, wintypes.SIZE, wintypes.HDC, wintypes.POINT, wintypes.COLORREF, wintypes.BLENDFUNCTION, wintypes.DWORD]],
	UpdateWindow: [wintypes.BOOL, [wintypes.HWND]],
	UserHandleGrantAccess: [wintypes.BOOL, [wintypes.HANDLE, wintypes.HANDLE, wintypes.BOOL]],
	ValidateRect: [wintypes.BOOL, [wintypes.HWND, wintypes.RECT]],
	ValidateRgn: [wintypes.BOOL, [wintypes.HWND, wintypes.HRGN]],
	VkKeyScanA: [wintypes.SHORT, [wintypes.CHAR]],
	VkKeyScanExA: [wintypes.SHORT, [wintypes.CHAR, wintypes.HKL]],
	VkKeyScanExW: [wintypes.SHORT, [wintypes.WCHAR, wintypes.HKL]],
	VkKeyScanW: [wintypes.SHORT, [wintypes.WCHAR]],
	WaitForInputIdle: [wintypes.DWORD, [wintypes.HANDLE, wintypes.DWORD]],
	WaitMessage: [wintypes.BOOL, []],
	WindowFromDC: [wintypes.HWND, [wintypes.HDC]],
	WindowFromPhysicalPoint: [wintypes.HWND, [wintypes.POINT]],
	WindowFromPoint: [wintypes.HWND, [wintypes.POINT]],
	WinHelpA: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCSTR, wintypes.UINT, wintypes.ULONG_PTR]],
	WinHelpW: [wintypes.BOOL, [wintypes.HWND, wintypes.LPCWSTR, wintypes.UINT, wintypes.ULONG_PTR]]
}
//Don't use ffi.Library, use DynamicLibrary instead!
function loadFunctions(pathofdll,functions){
	var objtosave={}
	var dllmem=ffi.DynamicLibrary(pathofdll, ffi.DynamicLibrary.FLAGS.RTLD_LAZY);
	Object.entries(functions).forEach(([fname,[rtype,args]])=>{
		try{
			objtosave[fname]=ffi.ForeignFunction(dllmem.get(fname),rtype,args);
		}
		catch(x){
			console.log(fname+" couldn't be loaded :(",x.message)
		}

	});
	return objtosave;
}
var current=loadFunctions("User32.dll",winterface.User32);
var ole32=loadFunctions("ole32.dll",winterface.ole32);
//console.log('current',current)

//var current = ffi.Library("User32.dll", winterface.User32);
var gdi32 = loadFunctions("gdi32.dll", winterface.gdi32);
var kernel32 = loadFunctions("kernel32.dll", winterface.Kernel32);

var constants={}
//console.log([wintypes.HWND, [wintypes.HINSTANCE, wintypes.LPCDLGTEMPLATEW, wintypes.HWND, wintypes.DLGPROC, wintypes.LPARAM]])
const MB_ICONEXCLAMATION=0x00000030;
const MB_ICONHAND = 0x00000010;
const MB_ICONASTERISK=  0x00000040;
constants.msgbox={
	MB_OK : 0x00000000,
	MB_OKCANCEL : 0x00000001,
	MB_ABORTRETRYIGNORE : 0x00000002,
	MB_YESNOCANCEL : 0x00000003,
	MB_YESNO : 0x00000004,
	MB_RETRYCANCEL : 0x00000005,
	// #if(WINVER >= 0x0500)
	MB_CANCELTRYCONTINUE : 0x00000006,
	// #endif /* WINVER >= 0x0500 */
	MB_ICONHAND,
	MB_ICONQUESTION : 0x00000020,
	MB_ICONEXCLAMATION,
	MB_ICONASTERISK,
	// #if(WINVER >= 0x0400)
	MB_USERICON : 0x00000080,
	MB_ICONWARNING : MB_ICONEXCLAMATION,
	MB_ICONERROR : MB_ICONHAND,
	// #endif /* WINVER >= 0x0400 */
	MB_ICONINFORMATION : MB_ICONASTERISK,
	MB_ICONSTOP : MB_ICONHAND,
	MB_DEFBUTTON1 : 0x00000000,
	MB_DEFBUTTON2 : 0x00000100,
	MB_DEFBUTTON3 : 0x00000200,
	// #if(WINVER >= 0x0400)
	MB_DEFBUTTON4 : 0x00000300,
	// #endif /* WINVER >= 0x0400 */
	MB_APPLMODAL : 0x00000000,
	MB_SYSTEMMODAL : 0x00001000,
	MB_TASKMODAL : 0x00002000,
	// #if(WINVER >= 0x0400)
	MB_HELP : 0x00004000, // Help Butto,
	// #endif /* WINVER >= 0x0400 */
	MB_NOFOCUS : 0x00008000,
	MB_SETFOREGROUND : 0x00010000,
	MB_DEFAULT_DESKTOP_ONLY : 0x00020000,
	// #if(WINVER >= 0x0400)
	MB_TOPMOST : 0x00040000,
	MB_RIGHT : 0x00080000,
	MB_RTLREADING : 0x00100000,
	// #endif /* WINVER >= 0x0400 */
	// #ifdef _WIN32_WINNT
	// #if(_WIN32_WINNT >= 0x0400)
	//  MB_SERVICE_NOTIFICATION : 0x00200000,
	// #else
	//  MB_SERVICE_NOTIFICATION : 0x00040000,
	// #endif
	MB_SERVICE_NOTIFICATION_NT3X : 0x00040000,
	// #endif
	MB_TYPEMASK : 0x0000000F,
	MB_ICONMASK : 0x000000F0,
	MB_DEFMASK : 0x00000F00,
	MB_MODEMASK : 0x00003000,
	MB_MISCMASK : 0x0000C000
};


var clipboardFormats={
	CF_BITMAP:2,
	CF_DIB:8,
	CF_DIBV5:17,
	CF_DIF:5,
	CF_DSPBITMAP:0x82,
	CF_DSPENHMETAFILE:0x8e,
	CF_DSPMETAFILEPICT:0x0083,
	CF_DSPTEXT:0x0081,
	CF_ENHMETAFILE:14,
	CF_GDIOBJFIRST:0x0300,
	CF_GDIOBJLAST:0x03FF,
	CF_HDROP:15,
	CF_LOCALE:16,
	CF_METAFILEPICT:3,
	CF_OEMTEXT:7,
	CF_OWNERDISPLAY:0x0080,
	CF_PALETTE:9,
	CF_PENDATA:10,
	CF_PRIVATEFIRST:0x0200,
	CF_PRIVATELAST:0x02FF,
	CF_RIFF:11,
	CF_SYLK:4,
	CF_TEXT:1,
	CF_TIFF:6,
	CF_UNICODETEXT:13,
	CF_WAVE:12
}
constants.clipboardFormats={...clipboardFormats,...Object.fromEntries(Object.entries(clipboardFormats).map(([k,v])=>[v,k]))};
constants.msg=(o=>Object.entries(o).reduce((r, [k, v]) => (r[v]=+k, r), o))({
	0x0000:"WM_NULL",
	0x0001:"WM_CREATE",
	0x0002:"WM_DESTROY",
	0x0003:"WM_MOVE",
	0x0005:"WM_SIZE",
	0x0006:"WM_ACTIVATE",
	0x0007:"WM_SETFOCUS",
	0x0008:"WM_KILLFOCUS",
	0x000A:"WM_ENABLE",
	0x000B:"WM_SETREDRAW",
	0x000C:"WM_SETTEXT",
	0x000D:"WM_GETTEXT",
	0x000E:"WM_GETTEXTLENGTH",
	0x000F:"WM_PAINT",
	0x0010:"WM_CLOSE",
	0x0011:"WM_QUERYENDSESSION",
	0x0012:"WM_QUIT",
	0x0013:"WM_QUERYOPEN",
	0x0014:"WM_ERASEBKGND",
	0x0015:"WM_SYSCOLORCHANGE",
	0x0016:"WM_ENDSESSION",
	0x0018:"WM_SHOWWINDOW",
	0x001A:"WM_WININICHANGE",
	0x001B:"WM_DEVMODECHANGE",
	0x001C:"WM_ACTIVATEAPP",
	0x001D:"WM_FONTCHANGE",
	0x001E:"WM_TIMECHANGE",
	0x001F:"WM_CANCELMODE",
	0x0020:"WM_SETCURSOR",
	0x0021:"WM_MOUSEACTIVATE",
	0x0022:"WM_CHILDACTIVATE",
	0x0023:"WM_QUEUESYNC",
	0x0024:"WM_GETMINMAXINFO",
	0x0026:"WM_PAINTICON",
	0x0027:"WM_ICONERASEBKGND",
	0x0028:"WM_NEXTDLGCTL",
	0x002A:"WM_SPOOLERSTATUS",
	0x002B:"WM_DRAWITEM",
	0x002C:"WM_MEASUREITEM",
	0x002D:"WM_DELETEITEM",
	0x002E:"WM_VKEYTOITEM",
	0x002F:"WM_CHARTOITEM",
	0x0030:"WM_SETFONT",
	0x0031:"WM_GETFONT",
	0x0032:"WM_SETHOTKEY",
	0x0033:"WM_GETHOTKEY",
	0x0037:"WM_QUERYDRAGICON",
	0x0039:"WM_COMPAREITEM",
	0x003D:"WM_GETOBJECT",
	0x0041:"WM_COMPACTING",
	0x0044:"WM_COMMNOTIFY",
	0x0046:"WM_WINDOWPOSCHANGING",
	0x0047:"WM_WINDOWPOSCHANGED",
	0x0048:"WM_POWER",
	0x004A:"WM_COPYDATA",
	0x004B:"WM_CANCELJOURNAL",
	0x004E:"WM_NOTIFY",
	0x0050:"WM_INPUTLANGCHANGEREQUEST",
	0x0051:"WM_INPUTLANGCHANGE",
	0x0052:"WM_TCARD",
	0x0053:"WM_HELP",
	0x0054:"WM_USERCHANGED",
	0x0055:"WM_NOTIFYFORMAT",
	0x007B:"WM_CONTEXTMENU",
	0x007C:"WM_STYLECHANGING",
	0x007D:"WM_STYLECHANGED",
	0x007E:"WM_DISPLAYCHANGE",
	0x007F:"WM_GETICON",
	0x0080:"WM_SETICON",
	0x0081:"WM_NCCREATE",
	0x0082:"WM_NCDESTROY",
	0x0083:"WM_NCCALCSIZE",
	0x0084:"WM_NCHITTEST",
	0x0085:"WM_NCPAINT",
	0x0086:"WM_NCACTIVATE",
	0x0087:"WM_GETDLGCODE",
	0x0088:"WM_SYNCPAINT",
	0x00A0:"WM_NCMOUSEMOVE",
	0x00A1:"WM_NCLBUTTONDOWN",
	0x00A2:"WM_NCLBUTTONUP",
	0x00A3:"WM_NCLBUTTONDBLCLK",
	0x00A4:"WM_NCRBUTTONDOWN",
	0x00A5:"WM_NCRBUTTONUP",
	0x00A6:"WM_NCRBUTTONDBLCLK",
	0x00A7:"WM_NCMBUTTONDOWN",
	0x00A8:"WM_NCMBUTTONUP",
	0x00A9:"WM_NCMBUTTONDBLCLK",
	0x00AB:"WM_NCXBUTTONDOWN",
	0x00AC:"WM_NCXBUTTONUP",
	0x00AD:"WM_NCXBUTTONDBLCLK",
	0x00FF:"WM_INPUT",
	0x0100:"WM_KEYDOWN",
	0x0101:"WM_KEYUP",
	0x0102:"WM_CHAR",
	0x0103:"WM_DEADCHAR",
	0x0104:"WM_SYSKEYDOWN",
	0x0105:"WM_SYSKEYUP",
	0x0106:"WM_SYSCHAR",
	0x0107:"WM_SYSDEADCHAR",
	0x0109:"WM_UNICHAR",
	0x010D:"WM_IME_STARTCOMPOSITION",
	0x010E:"WM_IME_ENDCOMPOSITION",
	0x010F:"WM_IME_COMPOSITION",
	0x0110:"WM_INITDIALOG",
	0x0111:"WM_COMMAND",
	0x0112:"WM_SYSCOMMAND",
	0x0113:"WM_TIMER",
	0x0114:"WM_HSCROLL",
	0x0115:"WM_VSCROLL",
	0x0116:"WM_INITMENU",
	0x0117:"WM_INITMENUPOPUP",
	0x011F:"WM_MENUSELECT",
	0x0120:"WM_MENUCHAR",
	0x0121:"WM_ENTERIDLE",
	0x0122:"WM_MENURBUTTONUP",
	0x0123:"WM_MENUDRAG",
	0x0124:"WM_MENUGETOBJECT",
	0x0125:"WM_UNINITMENUPOPUP",
	0x0126:"WM_MENUCOMMAND",
	0x0127:"WM_CHANGEUISTATE",
	0x0128:"WM_UPDATEUISTATE",
	0x0129:"WM_QUERYUISTATE",
	0x0132:"WM_CTLCOLORMSGBOX",
	0x0133:"WM_CTLCOLOREDIT",
	0x0134:"WM_CTLCOLORLISTBOX",
	0x0135:"WM_CTLCOLORBTN",
	0x0136:"WM_CTLCOLORDLG",
	0x0137:"WM_CTLCOLORSCROLLBAR",
	0x0138:"WM_CTLCOLORSTATIC",
	0x0200:"WM_MOUSEFIRST",
	0x0201:"WM_LBUTTONDOWN",
	0x0202:"WM_LBUTTONUP",
	0x0203:"WM_LBUTTONDBLCLK",
	0x0204:"WM_RBUTTONDOWN",
	0x0205:"WM_RBUTTONUP",
	0x0206:"WM_RBUTTONDBLCLK",
	0x0207:"WM_MBUTTONDOWN",
	0x0208:"WM_MBUTTONUP",
	0x0209:"WM_MBUTTONDBLCLK",
	0x020A:"WM_MOUSELAST(NT4,98)",
	0x020B:"WM_XBUTTONDOWN",
	0x020C:"WM_XBUTTONUP",
	0x020D:"WM_MOUSELAST(2K,XP,2k3)",
	0x0210:"WM_PARENTNOTIFY",
	0x0211:"WM_ENTERMENULOOP",
	0x0212:"WM_EXITMENULOOP",
	0x0213:"WM_NEXTMENU",
	0x0214:"WM_SIZING",
	0x0215:"WM_CAPTURECHANGED",
	0x0216:"WM_MOVING",
	0x0218:"WM_POWERBROADCAST",
	0x0219:"WM_DEVICECHANGE",
	0x0220:"WM_MDICREATE",
	0x0221:"WM_MDIDESTROY",
	0x0222:"WM_MDIACTIVATE",
	0x0223:"WM_MDIRESTORE",
	0x0224:"WM_MDINEXT",
	0x0225:"WM_MDIMAXIMIZE",
	0x0226:"WM_MDITILE",
	0x0227:"WM_MDICASCADE",
	0x0228:"WM_MDIICONARRANGE",
	0x0229:"WM_MDIGETACTIVE",
	0x0230:"WM_MDISETMENU",
	0x0231:"WM_ENTERSIZEMOVE",
	0x0232:"WM_EXITSIZEMOVE",
	0x0233:"WM_DROPFILES",
	0x0234:"WM_MDIREFRESHMENU",
	0x0281:"WM_IME_SETCONTEXT",
	0x0282:"WM_IME_NOTIFY",
	0x0283:"WM_IME_CONTROL",
	0x0284:"WM_IME_COMPOSITIONFULL",
	0x0285:"WM_IME_SELECT",
	0x0286:"WM_IME_CHAR",
	0x0288:"WM_IME_REQUEST",
	0x0290:"WM_IME_KEYDOWN",
	0x0291:"WM_IME_KEYUP",
	0x02A0:"WM_NCMOUSEHOVER",
	0x02A1:"WM_MOUSEHOVER",
	0x02A2:"WM_NCMOUSELEAVE",
	0x02A3:"WM_MOUSELEAVE",
	0x02B1:"WM_WTSSESSION_CHANGE",
	0x02C0:"WM_TABLET_FIRST",
	0x02DF:"WM_TABLET_LAST",
	0x0300:"WM_CUT",
	0x0301:"WM_COPY",
	0x0302:"WM_PASTE",
	0x0303:"WM_CLEAR",
	0x0304:"WM_UNDO",
	0x0305:"WM_RENDERFORMAT",
	0x0306:"WM_RENDERALLFORMATS",
	0x0307:"WM_DESTROYCLIPBOARD",
	0x0308:"WM_DRAWCLIPBOARD",
	0x0309:"WM_PAINTCLIPBOARD",
	0x030A:"WM_VSCROLLCLIPBOARD",
	0x030B:"WM_SIZECLIPBOARD",
	0x030C:"WM_ASKCBFORMATNAME",
	0x030D:"WM_CHANGECBCHAIN",
	0x030E:"WM_HSCROLLCLIPBOARD",
	0x030F:"WM_QUERYNEWPALETTE",
	0x0310:"WM_PALETTEISCHANGING",
	0x0311:"WM_PALETTECHANGED",
	0x0312:"WM_HOTKEY",
	0x0317:"WM_PRINT",
	0x0318:"WM_PRINTCLIENT",
	0x0319:"WM_APPCOMMAND",
	0x031A:"WM_THEMECHANGED",
	0x031D:"WM_CLIPBOARDUPDATE",
	0x0358:"WM_HANDHELDFIRST",
	0x035F:"WM_HANDHELDLAST",
	0x0360:"WM_AFXFIRST",
	0x037F:"WM_AFXLAST",
	0x0380:"WM_PENWINFIRST",
	0x038F:"WM_PENWINLAST",
	0x0400:"WM_USER",
	0x8000:"WM_APP",
});
var key={
	VK_LBUTTON       : 0x01,
	VK_RBUTTON       : 0x02,
	VK_CANCEL    : 0x03,
	VK_MBUTTON       : 0x04,
	//
	VK_XBUTTON1      : 0x05,
	VK_XBUTTON2      : 0x06,
	//
	VK_BACK      : 0x08,
	VK_TAB       : 0x09,
	//
	VK_CLEAR     : 0x0C,
	VK_RETURN    : 0x0D,
	//
	VK_SHIFT     : 0x10,
	VK_CONTROL       : 0x11,
	VK_MENU      : 0x12,
	VK_PAUSE     : 0x13,
	VK_CAPITAL       : 0x14,
	//
	VK_KANA      : 0x15,
	VK_JUNJA     : 0x17,
	VK_FINAL     : 0x18,
	VK_HANJA     : 0x19,
	VK_KANJI     : 0x19,
	//
	VK_ESCAPE    : 0x1B,
	//
	VK_CONVERT       : 0x1C,
	VK_NONCONVERT    : 0x1D,
	VK_ACCEPT    : 0x1E,
	VK_MODECHANGE    : 0x1F,
	//
	VK_SPACE     : 0x20,
	VK_PRIOR     : 0x21,
	VK_NEXT      : 0x22,
	VK_END       : 0x23,
	VK_HOME      : 0x24,
	VK_LEFT      : 0x25,
	VK_UP        : 0x26,
	VK_RIGHT     : 0x27,
	VK_DOWN      : 0x28,
	VK_SELECT    : 0x29,
	VK_PRINT     : 0x2A,
	VK_EXECUTE       : 0x2B,
	VK_SNAPSHOT      : 0x2C,
	VK_INSERT    : 0x2D,
	VK_DELETE    : 0x2E,
	VK_HELP      : 0x2F,
	//
	VK_LWIN      : 0x5B,
	VK_RWIN      : 0x5C,
	VK_APPS      : 0x5D,
	//
	VK_SLEEP     : 0x5F,
	//
	VK_NUMPAD0       : 0x60,
	VK_NUMPAD1       : 0x61,
	VK_NUMPAD2       : 0x62,
	VK_NUMPAD3       : 0x63,
	VK_NUMPAD4       : 0x64,
	VK_NUMPAD5       : 0x65,
	VK_NUMPAD6       : 0x66,
	VK_NUMPAD7       : 0x67,
	VK_NUMPAD8       : 0x68,
	VK_NUMPAD9       : 0x69,
	VK_MULTIPLY      : 0x6A,
	VK_ADD       : 0x6B,
	VK_SEPARATOR     : 0x6C,
	VK_SUBTRACT      : 0x6D,
	VK_DECIMAL       : 0x6E,
	VK_DIVIDE    : 0x6F,
	VK_F1        : 0x70,
	VK_F2        : 0x71,
	VK_F3        : 0x72,
	VK_F4        : 0x73,
	VK_F5        : 0x74,
	VK_F6        : 0x75,
	VK_F7        : 0x76,
	VK_F8        : 0x77,
	VK_F9        : 0x78,
	VK_F10       : 0x79,
	VK_F11       : 0x7A,
	VK_F12       : 0x7B,
	VK_F13       : 0x7C,
	VK_F14       : 0x7D,
	VK_F15       : 0x7E,
	VK_F16       : 0x7F,
	VK_F17       : 0x80,
	VK_F18       : 0x81,
	VK_F19       : 0x82,
	VK_F20       : 0x83,
	VK_F21       : 0x84,
	VK_F22       : 0x85,
	VK_F23       : 0x86,
	VK_F24       : 0x87,
	//
	VK_NUMLOCK       : 0x90,
	VK_SCROLL    : 0x91,
	//
	VK_OEM_NEC_EQUAL : 0x92,   // ':' key on numpad
	//
	VK_OEM_FJ_MASSHOU: 0x93,   // 'Unregister word' key
	VK_OEM_FJ_TOUROKU: 0x94,   // 'Register word' key
	VK_OEM_FJ_LOYA   : 0x95,   // 'Left OYAYUBI' key
	VK_OEM_FJ_ROYA   : 0x96,   // 'Right OYAYUBI' key
	//
	VK_LSHIFT    : 0xA0,
	VK_RSHIFT    : 0xA1,
	VK_LCONTROL      : 0xA2,
	VK_RCONTROL      : 0xA3,
	VK_LMENU     : 0xA4,
	VK_RMENU     : 0xA5,
	//
	VK_BROWSER_BACK       : 0xA6,
	VK_BROWSER_FORWARD    : 0xA7,
	VK_BROWSER_REFRESH    : 0xA8,
	VK_BROWSER_STOP       : 0xA9,
	VK_BROWSER_SEARCH     : 0xAA,
	VK_BROWSER_FAVORITES  : 0xAB,
	VK_BROWSER_HOME       : 0xAC,
	//
	VK_VOLUME_MUTE    : 0xAD,
	VK_VOLUME_DOWN    : 0xAE,
	VK_VOLUME_UP      : 0xAF,
	VK_MEDIA_NEXT_TRACK   : 0xB0,
	VK_MEDIA_PREV_TRACK   : 0xB1,
	VK_MEDIA_STOP     : 0xB2,
	VK_MEDIA_PLAY_PAUSE   : 0xB3,
	VK_LAUNCH_MAIL    : 0xB4,
	VK_LAUNCH_MEDIA_SELECT: 0xB5,
	VK_LAUNCH_APP1    : 0xB6,
	VK_LAUNCH_APP2    : 0xB7,
	//
	VK_OEM_1     : 0xBA,   // ';:' for US
	VK_OEM_PLUS      : 0xBB,   // '+' any country
	VK_OEM_COMMA     : 0xBC,   // ',' any country
	VK_OEM_MINUS     : 0xBD,   // '-' any country
	VK_OEM_PERIOD    : 0xBE,   // '.' any country
	VK_OEM_2     : 0xBF,   // '/?' for US
	VK_OEM_3     : 0xC0,   // '`~' for US
	//
	VK_OEM_4     : 0xDB,  //  '[{' for US
	VK_OEM_5     : 0xDC,  //  '\|' for US
	VK_OEM_6     : 0xDD,  //  ']}' for US
	VK_OEM_7     : 0xDE,  //  ''"' for US
	VK_OEM_8     : 0xDF,
	//
	VK_OEM_AX    : 0xE1,  //  'AX' key on Japanese AX kbd
	VK_OEM_102       : 0xE2,  //  "<>" or "\|" on RT 102-key kbd.
	VK_ICO_HELP      : 0xE3,  //  Help key on ICO
	VK_ICO_00    : 0xE4,  //  00 key on ICO
	//
	VK_PROCESSKEY    : 0xE5,
	//
	VK_ICO_CLEAR     : 0xE6,
	//
	VK_PACKET    : 0xE7,
	//
	VK_OEM_RESET     : 0xE9,
	VK_OEM_JUMP      : 0xEA,
	VK_OEM_PA1       : 0xEB,
	VK_OEM_PA2       : 0xEC,
	VK_OEM_PA3       : 0xED,
	VK_OEM_WSCTRL    : 0xEE,
	VK_OEM_CUSEL     : 0xEF,
	VK_OEM_ATTN      : 0xF0,
	VK_OEM_FINISH    : 0xF1,
	VK_OEM_COPY      : 0xF2,
	VK_OEM_AUTO      : 0xF3,
	VK_OEM_ENLW      : 0xF4,
	VK_OEM_BACKTAB   : 0xF5,
	//
	VK_ATTN      : 0xF6,
	VK_CRSEL     : 0xF7,
	VK_EXSEL     : 0xF8,
	VK_EREOF     : 0xF9,
	VK_PLAY      : 0xFA,
	VK_ZOOM      : 0xFB,
	VK_NONAME    : 0xFC,
	VK_PA1       : 0xFD,
	VK_OEM_CLEAR     : 0xFE
}

constants.keys={...key,...Object.fromEntries(Object.entries(key).map(([k,v])=>[v,k]))};
constants.styles=({WS_BORDER : 0x00800000,
	WS_CAPTION : 0x00C00000,
	WS_CHILD : 0x40000000,
	WS_CLIPCHILDREN : 0x02000000,
	WS_CLIPSIBLINGS : 0x04000000,
	WS_DISABLED : 0x08000000,
	WS_DLGFRAME : 0x00400000,
	WS_GROUP : 0x00020000,
	WS_HSCROLL : 0x00100000,
	WS_ICONIC : 0x20000000,
	WS_MAXIMIZE : 0x01000000,
	WS_MAXIMIZEBOX : 0x00010000,
	WS_MINIMIZE : 0x20000000,
	WS_MINIMIZEBOX : 0x00020000,
	WS_OVERLAPPED : 0x00000000,
	WS_POPUP : 0x80000000, // The windows is a pop-up window
	WS_SIZEBOX : 0x00040000,
	WS_SYSMENU : 0x00080000, // The window has a window menu on its title bar.
	WS_TABSTOP : 0x00010000,
	WS_THICKFRAME : 0x00040000,
	WS_TILED : 0x00000000,
	WS_VISIBLE : 0x10000000,
	WS_VSCROLL : 0x00200000,
	WS_EX_ACCEPTFILES : 0x00000010,
	WS_EX_APPWINDOW : 0x00040000,
	WS_EX_CLIENTEDGE : 0x00000200,
	WS_EX_COMPOSITED : 0x02000000,
	WS_EX_CONTEXTHELP : 0x00000400,
	WS_EX_CONTROLPARENT : 0x00010000,
	WS_EX_DLGMODALFRAME : 0x00000001,
	WS_EX_LAYERED : 0x00080000,
	WS_EX_LAYOUTRTL : 0x00400000,
	WS_EX_LEFT : 0x00000000,
	WS_EX_LEFTSCROLLBAR : 0x00004000,
	WS_EX_LTRREADING : 0x00000000,
	WS_EX_MDICHILD : 0x00000040,
	WS_EX_NOACTIVATE : 0x08000000,
	WS_EX_NOINHERITLAYOUT : 0x00100000,
	WS_EX_NOPARENTNOTIFY : 0x00000004,
	WS_EX_NOREDIRECTIONBITMAP : 0x00200000,
	WS_EX_RIGHT : 0x00001000,
	WS_EX_RIGHTSCROLLBAR : 0x00000000,
	WS_EX_RTLREADING : 0x00002000,
	WS_EX_STATICEDGE : 0x00020000,
	WS_EX_TOOLWINDOW : 0x00000080,
	WS_EX_TOPMOST : 0x00000008,
	WS_EX_TRANSPARENT : 0x00000020,
	WS_EX_WINDOWEDGE : 0x00000100,
	PM_NOREMOVE : 0x0000,
	PM_REMOVE : 0x0001,
	PM_NOYIELD : 0x0002,
	CW_USEDEFAULT : 1 << 31
});
constants.RawInputDeviceInformationCommand={
	RIDI_DEVICENAME : 0x20000007,
	RIDI_DEVICEINFO : 0x2000000b,
	RIDI_PREPARSEDDATA : 0x20000005
}

constants.styles.WS_OVERLAPPEDWINDOW = constants.styles.WS_OVERLAPPED | constants.styles.WS_CAPTION | constants.styles.WS_SYSMENU
	| constants.styles.WS_THICKFRAME | constants.styles.WS_MINIMIZEBOX | constants.styles.WS_MAXIMIZEBOX;
constants.styles.WS_POPUPWINDOW = constants.styles.WS_POPUP | constants.styles.WS_BORDER | constants.styles.WS_SYSMENU;
constants.styles.WS_TILEDWINDOW = constants.styles.WS_OVERLAPPED | constants.styles.WS_CAPTION | constants.styles.WS_SYSMENU
	| constants.styles.WS_THICKFRAME | constants.styles.WS_MINIMIZEBOX | constants.styles.WS_MAXIMIZEBOX;
//console.log((new wintypes.PAINTSTRUCT())["ref.buffer"].length,"this length");
//#define MAKELANGID(p, s) ((((WORD) (s)) << 10) | (WORD) (p)) 
//var lang={};
//macro functions
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
var macros={MAKELANGID,LOWORD,HIWORD};
constants.macros=macros;

const FORMAT_MESSAGE_ALLOCATE_BUFFER=0x100;
const FORMAT_MESSAGE_ARGUMENT_ARRAY=0x2000;
const FORMAT_MESSAGE_FROM_HMODULE=0x800;
const FORMAT_MESSAGE_FROM_STRING=0x400;
const FORMAT_MESSAGE_FROM_SYSTEM=0x1000;
const FORMAT_MESSAGE_IGNORE_INSERTS=0x200;
const FORMAT_MESSAGE_MAX_WIDTH_MASK=0xFF;
//https://github.com/giwig/qtCheatMotor/blob/562560ae12b70a3bad7c9310d43fe9308287c7fa/inc/errors.py

const LANG_NEUTRAL = 0x00
const SUBLANG_NEUTRAL = 0x00
const SUBLANG_DEFAULT = 0x01
const LANG_ENGLISH = 0x09
const SUBLANG_ENGLISH_US = 0x01
function Win32Exception(){
	var error=kernel32.GetLastError();
	var errorText=Buffer.allocUnsafe(8);
	errorText.type = ref.types.CString;
	//console.log("errorText",errorText)
	kernel32.FormatMessageA(// use system message tables to retrieve error text
		FORMAT_MESSAGE_FROM_SYSTEM
		// allocate buffer on local heap for error text
		|FORMAT_MESSAGE_ALLOCATE_BUFFER
		// Important! will fail otherwise, since we're not 
		// (and CANNOT) pass insertion parameters
		|FORMAT_MESSAGE_IGNORE_INSERTS,  
		ref.NULL,    // unused with FORMAT_MESSAGE_FROM_SYSTEM
		error,
		MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
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
function nonZero(i){return i!==0}
function isZero(i){return i===0}
var goodies={}
goodies.Win32Exception=Win32Exception;
goodies.errorHandling=errorHandling;
goodies.MSG=new wintypes.MSG();
var defaultFcts={message:function(message){
	//	messages.map(_=>{//Performance cost is too great, isn't it amazing?
	//if(wintypes.msg[message.message]){

	if(constants.msg[message.message])win32messageHandler.emit(constants.msg[message.message],message.lParam,message.wParam);
	current.TranslateMessage(message.ref());
	current.DispatchMessageA(message.ref());
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
	while(current.PeekMessageA(goodies.MSG.ref(),0,0,0,constants.styles.PM_REMOVE)){
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
	return obj.defaultPrevent?1:current.CallNextHookEx(keyHandler_LL.$codeHandle??0, nCode, wParam, lParam);
};

win32messageHandler.oneTimeListen("WH_KEYBOARD_LL",_=>{
	const  WH_KEYBOARD_LL=13;
	//var stopgarbageColection=[];//we save the value from SetWindowsHookExA ""
	//goodies._WH_KEYBOARD_LL_storage=stopgarbageColection
	//var callback=keyHandler_LL;
	var handle=keyHandler_LL.$codeHandle=current.SetWindowsHookExA(WH_KEYBOARD_LL, keyHandler_LL, 0, 0);
	//stopgarbageColection.push(callback);
	return handle;},(HHandle)=>{
		current.UnhookWindowsHookEx(HHandle);
	        //goodies._WH_KEYBOARD_LL_storage=[];
		return true;});


goodies.CreateWindowExA=errorHandling(current.CreateWindowExA,/*isZero*/nonZero,"CreateWindowExA")
goodies.RegisterClassA=errorHandling(current.RegisterClassA,/*isZero*/nonZero,"RegisterClassA")
goodies.getRawInputDeviceInfo=function(hDevice,uiCommand,pData=ref.NULL){
	//if(pData==ref.NULL)
	var strsize=ref.alloc(wintypes.UINT);
	current.GetRawInputDeviceInfoA(hDevice, uiCommand, pData, strsize);
	pData=Buffer.allocUnsafe(strsize.readUint32LE());
	var gridi=errorHandling(current.GetRawInputDeviceInfoA,isZero,"GetRawInputDeviceInfoA");
	gridi(hDevice, uiCommand, pData, strsize);
	return pData;

}
goodies.getRawInputDeviceList=function getRawInputDeviceList(){
	var gridl=errorHandling(current.GetRawInputDeviceList,_=>_==(-1>>>0));
	var nofdevices=Buffer.allocUnsafe(4); 
	current.GetRawInputDeviceList(ref.NULL,nofdevices,wintypes.RAWINPUTDEVICELIST.size);
	var devices=new (ArrayType(wintypes.RAWINPUTDEVICELIST))(nofdevices.readUint32LE())
	//var devices=Buffer.allocUnsafe(wintypes.RAWINPUTDEVICELIST.size*testtt.readUint32LE());
	gridl(devices.buffer,nofdevices,wintypes.RAWINPUTDEVICELIST.size);
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
constants.ShowWindow={
	SW_HIDE:0,
	SW_SHOWNORMAL:1,
	SW_NORMAL:1,
	SW_SHOWMINIMIZED:2,
	SW_SHOWMAXIMIZED:3,
	SW_MAXIMIZE:3,
	SW_SHOWNOACTIVATE:4,
	SW_SHOW:5,
	SW_MINIMIZE:6,
	SW_SHOWMINNOACTIVE:7,
	SW_SHOWNA:8,
	SW_RESTORE:9,
	SW_SHOWDEFAULT:10,
	SW_FORCEMINIMIZE:11
}

const MOD_ALT = 0x0001;
const MOD_NOREPEAT = 0x4000;
const MOD_CONTROL = 0x2;
const MOD_SHIFT = 0x4;
const MOD_WIN = 0x8;
constants.modifiers={
	MOD_ALT,MOD_NOREPEAT,MOD_CONTROL,MOD_SHIFT
}
function stringToFlagsParser(de,pos,neg){
		return str=>str.split('').reduce((a,b)=>(a|(pos[b]))&~neg[b],de)
	} 
var hotkeyflagparser=stringToFlagsParser(MOD_NOREPEAT,{"^":MOD_CONTROL,"#":8,"!":MOD_ALT,"+":MOD_SHIFT},{"?":MOD_NOREPEAT});

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
	win32messageHandler.on("WM_HOTKEY",onhotkey);
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
			wVk=Object.entries(key).find(([k,v])=>new RegExp(str3,'i').test(k))[1];
		}
		if (current.RegisterHotKey(0, i, hotkeyflagparser(str2), wVk)) {
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
		current.UnregisterHotKey(id);
	});

goodies.createWindow=function createWindow(params){
	var window=new events();
	require('./eventUtils.js').addEventUtilsToEventDispatcher(window);

	var WindowProc=//ffi.Callback(...wintypes.fn.WNDPROC,
		(hwnd, uMsg, wParam, lParam) => {
			//console.log('WndProc callback',winapi.msg[uMsg],uMsg.toString(16),"wParam:",wParam,"lParam:",ref.address(lParam));
			let result = 0;
			var obj={hwnd,wParam,lParam};
			window.emit("message",{uMsg,...obj});
			console.log(constants.msg[uMsg]||uMsg)
			window.emit(constants.msg[uMsg]||uMsg,obj);
			if(obj.preventDefaulted){
				result=obj.result;
			}else
				result = current.DefWindowProcA(hwnd, uMsg, wParam, lParam);
			//console.info('Sending LRESULT: ' + result) 
			return result
		};
	//);
	window.WindowProc=WindowProc;
	var wClass=new wintypes.WNDCLASSA();
	//wClass.cbSize=wClass.ref().byteLength;
	var sclass=params.className;//Buffer.from("Okay let's change this\0",'ucs2');
	wClass.lpfnWndProc=WindowProc;
	wClass.lpszClassName=sclass;
	if(winapi.goodies.RegisterClassA(wClass.ref())){
		//var dStyle= constants.styles.WS_CAPTION|constants.styles.WS_SYSMENU;

		var hwnd=winapi.goodies.CreateWindowExA(
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
			current.ShowWindow(hwnd,params.swflag);
			win32messageHandler.addDependency('message');//open message loop
			window.on("WM_DESTROY",_=>win32messageHandler.removeDependency('message'));//close message loop

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
	window.on("WM_HOTKEY",onhotkey);
	window.oneTimeListen("WM_HOTKEY:^b",([str])=>{
		var [str2,str3]=str.match(/:([\^#?+!]+)([A-z]+)$/);
		var i,wVk;
		if(window.hotkeyArray.holes.length>0){window.hotkeyArray[i=window.hotkeyArray.holes.pop()]=str;
		}
		else i=window.hotkeyArray.push(str)-1;
		if(str3.length==1){
			let u=str3.toUpperCase().charCodeAt();
			wVk=u;//if not in 0x30<u<0x59 what else can we do anyway, throw an error?
		}else{
			wVk=Object.entries(key).find(([k,v])=>new RegExp(str3,'i').test(k))[1];
		}
		if (current.RegisterHotKey(hwnd, i, hotkeyflagparser(str2), wVk)) {
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
		current.UnregisterHotKey(id);
	});
	return window;
}
goodies.typePointerBuffer=typePointerBuffer;
goodies.getFocusedHandle=function GetFocusedHandle(){
	//from https://stackoverflow.com/questions/12102000/send-win-api-paste-cmd-from-background-c-sharp-app
	var info = new wintypes.GUITHREADINFO();
	info.cbSize = wintypes.GUITHREADINFO.size;
	if (!current.GetGUIThreadInfo(0, info.ref()))
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
	var r=current.SendMessageCallbackA(hWnd,uMsg,wParam,lParam,messagecallback,s);
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
	var hmem=kernel32.GlobalAlloc(GMEM_MOVEABLE,stringbuffer.length);
	var lptstr = kernel32.GlobalLock(hmem);
	stringbuffer.copy(ref.reinterpret(lptstr, stringbuffer.length));
	kernel32.GlobalUnlock(hmem);
	if (!current.OpenClipboard(0)){
		kernel32.GlobalLock(hmem);
		kernel32.GlobalFree(hmem);
		kernel32.GlobalUnlock(hmem);
		return 1
	}
	current.EmptyClipboard();
	current.SetClipboardData(clipboardType, hmem);
	current.CloseClipboard();
	return 0;//C type error
}


goodies.getClipboard=function getClipboard(clipBoardFormat) {
	if (!current.IsClipboardFormatAvailable(clipBoardFormat) || !current.OpenClipboard(0))
		return ref.NULL;
	var hglb = current.GetClipboardData(clipBoardFormat) //,wintypes.HGLOBAL);	   
	var lptstr = kernel32.GlobalLock(hglb);
	var size = kernel32.GlobalSize(hglb);
	console.log("buffer size:", size)
	var k=Buffer.from(Buffer.from(ref.reinterpret(lptstr, size)));
	kernel32.GlobalUnlock(hglb)
	current.CloseClipboard();
	return k;
}
const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 2;
const KEYEVENT_EXTENDEDKEY=1;
const KEYEVENTF_SCANCODE=8;
const KEYEVENTF_UNICODE=4;
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_ABSOLUTE = 0x8000;
constants.input={INPUT_MOUSE,INPUT_KEYBOARD,Event:{KEYEVENTF_KEYUP,MOUSEEVENTF_MOVE,
	MOUSEEVENTF_LEFTDOWN,
	MOUSEEVENTF_LEFTUP,
	MOUSEEVENTF_RIGHTDOWN,
	MOUSEEVENTF_RIGHTUP,
	MOUSEEVENTF_MIDDLEDOWN,
	MOUSEEVENTF_MIDDLEUP,
	MOUSEEVENTF_ABSOLUTE,
	KEYEVENTF_SCANCODE,
	KEYEVENTF_UNICODE,
	KEYEVENT_EXTENDEDKEY
}};

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
		dwFlags|=KEYEVENTF_UNICODE;
		}
	} else if(t=keys2generate.match(/U\+([A-Fa-f0-9]+)/)){
		wVk=0;
		wScan=parseInt(t[1],16)
		dwFlags|=KEYEVENTF_UNICODE;
	} else 
		wVk=Object.entries(key).find(([k,v])=>new RegExp(keys2generate,'i').test(k))[1];
	if(!wVk&&!wScan)
		throw new Error("no valid key given");
	if (up) {
		dwFlags|=KEYEVENTF_KEYUP;	
	}
	if(extended){
		dwFlags|=KEYEVENT_EXTENDEDKEY;
	}
	//console.log(keys2generate,wVk,dwFlags,wScan)
	return new wintypes.INPUT({type:INPUT_KEYBOARD,DUMMYUNIONNAME:{ki:{wVk,dwFlags,wScan}}});
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
	return winapi.goodies.errorHandling(current.SendInput,_=>_!==arr.length,"sendInput")(arr.length,Buffer.concat(arr),wintypes.INPUT.size);
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
goodies.cftype=cftype;
goodies.sendInputAhkSync=ahktext=>goodies.sendInput(ahkformat(ahktext).flat().map(_=>_.ref()));
var winapi={ffi,goodies,constants,gdi32,kernel32,ref,Union,Struct:StructType,Array:ArrayType,ole32};


winapi.interfaces=winterface;
winapi.types=wintypes
winapi.user32=current
module.exports=({winapi,user32:current,gdi32,kernel32,constants,wintypes,...require("./eventUtils.js")});
