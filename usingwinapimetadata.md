# winapimetadata
Microsoft has done something beautiful for us (I know right), they created a program with c sharp that scraps the win32api that they wrote, and another guy made a program that translated this into JSON which is like a well supported language, which is a good thing since I dont feel like learning c sharp.


First we need to take care of a few things.

types
Enums
Structs
Unions
typedefs
Constants
Funcpointers
Functions

here we list what native is in terms of win32api:
UInt32,Int32

let's start with enums.

```js
function coerceNumber(numAsString){
var d=parseInt(numAsString);
return isNaN(d)?null:d;
}
function enumGenerate(obj){
//stores both key-values and value keys
return {valkey:(o=>Object.entries(o).reduce((r, [k, v]) => (r[v]=coerceNumber(k)??k, r), {}))(obj),keyval:obj}

}
function lazySet(object,property,someExpensiveComputation){
 Object.defineProperty(object, property, {
            get() {
                const actualData = someExpensiveComputation();

                Object.defineProperty(this, property, {
                    value: actualData,
                    writable: true,
                    configurable: true
                });

                return actualData;
            },
            configurable: true,
            enumerable: true
        });

}

var groupby=require("lodash/groupBy")
var ffi=require('ffi-napi');
var ref=require('ref-napi');
var StructType=require('ref-struct-di')(ref)
var Union = require('ref-union-di')(ref);
var ArrayType=require('ref-array-di')(ref);
var assert = require('node:assert');
var path=require('node:path');
var util=require('node:util');
var nativehelper={
UInt32:{
typeobj:{size:ref.sizeof.uint32,indirection:1,ffi_type:ffi.FFI_TYPES.uint32},
writebuf:"writeUint32LE",
readbuf:"readUint32LE",
Int32:{},
Byte:{}}
}
function longeSTring(a, b) {
	return a.length > b.length ? a : b;
}
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
var CFTypeConstructor = function(rtype,args){return {
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
wintypes.IntPtr=ref.types[`int${ref.sizeof.pointer*8}`];
wintypes.UIntPtr=ref.types[`uint${ref.sizeof.pointer*8}`];

function objApiToJSApi(obj){
	if(obj.Kind=="Struct"){
		return objApiStructToJSStruct(obj);
	}else if(obj.Kind=="Enum"){
		return objApiEnumToJSEnum(obj);
	}
	else if(obj.Kind=="Union"){
		return objApiUnionToJSUnion(obj);
	}
	else if(obj.Kind=="Array"){
		return  objApiArrayToJSArray(obj);	
	}
}
function getNestedTypes(objApi){
	return Object.fromEntries(Object.entries((objApi.NestedTypes?.length)?groupby(objApi.NestedTypes.map(objApiToJSApi),_=>(/*console.log("this will break",_),*/_.name)):{}).map(([a,b])=>(assert(b.length==1),[a,b[0]])));
	
}
function objApiStructToJSStruct(objApi){
	var nestedTypes=getNestedTypes(objApi);
	console.log(`nestedTypes: ${Object.keys(nestedTypes)}`);
	
	return {name:objApi.Name,obj:StructType(Object.fromEntries(objApi.Fields.map(_=>[_.Name,convertApiTypeToJSType(_.Type,nestedTypes)])))}
	
}
function convertApiTypeToJSType(type,nestedTypes){
	if(type.Kind=="Native"){if(!wintypes[type.Name]){throw new Error(`${type.Name} not found in wintypes`);}else{
		return wintypes[type.Name];
	}}
		else if(type.Kind=="ApiRef"){
			if(type.Parents.length==0&&(!nestedTypes||(nestedTypes&&!nestedTypes[type.Name]))){
				if(!wintypes[type.Name]){throw new Error(`${type.Name} not found in wintypes`);}else{
		return wintypes[type.Name];
	}
			}else
			if(nestedTypes){if (!nestedTypes[type.Name]){throw new Error(`${type.Name} not found in nestedTypes: ${Object.keys(nestedTypes)}`);}else{
		return nestedTypes[type.Name].obj;
			}}else{
				
			}
		}else if(type.Kind=="Array"){
			return ArrayType(convertApiTypeToJSType(type.Child,nestedTypes),type.Shape.Size);
		}else if(type.Kind=="PointerTo"){
			return ref.refType(convertApiTypeToJSType(type.Child,nestedTypes));
		}else if(type.Kind=="LPArray"){
			//For C there is no difference, but for us there is, we can think about how to handle this later.
			return ref.refType(convertApiTypeToJSType(type.Child,nestedTypes));
		}else{
			throw new Error("type "+type.Kind+" not found")
		}
}

function objApiEnumToJSEnum(objApi){
	var nestedTypes=getNestedTypes(objApi);
	return "todoEnum"
}

function objApiUnionToJSUnion(objApi){
   var nestedTypes=getNestedTypes(objApi);
   return {name:objApi.Name,obj:new Union(Object.fromEntries(objApi.Fields.map(_=>[_.Name,convertApiTypeToJSType(_.Type,nestedTypes)])))}
}
function objApiArrayToJSArray(objApi){
	var nestedTypes=getNestedTypes(objApi);
	return "todoArray"
}
function fun2Type(E){
	var r=CFTypeConstructor(convertApiTypeToJSType(E.ReturnType),E.Params.map(a=>convertApiTypeToJSType(a.Type)));
	assert(E.ReturnAttrs.length==0);
	if(E.Platform!==null){
		console.log(`Loading function ${E.Name} with Platform ${E.Platform}`)
	}
	r.SetLastError=E.SetLastError;
	r.Params=E.Params;
	return r;
	
}

function appendDLL(filePath) {
  const fileExtension = path.extname(filePath);
  if (fileExtension === "") {
    return filePath + ".dll";
  } else {
    return filePath;
  }
}
function getDll(dllname){
	var dllstr=appendDLL(dllname);
	if(dll[dllname])return dll[dllname];
	dll[dllname]=ffi.DynamicLibrary(dllstr, ffi.DynamicLibrary.FLAGS.RTLD_LAZY);
	return dll[dllname];
}
var dll={};
var functions={};

var debug=true
var readdir = util.promisify(fs.readdir);

async function requireJSONFiles(dirPath) {
    const fileNames = await readdir(dirPath);
    const jsonFiles = fileNames.filter(fileName => fileName.endsWith('.json'));
    var jsonarr={};
    for (const fileName of jsonFiles) {
        const filePath = path.join(dirPath, fileName);
        const fileData = require("./"+filePath);
		jsonarr[fileName]=fileData;
    }
	return jsonarr;
}
var apis=await requireJSONFiles("api");
function procedureConvertApiFromJSON(apitoconvert){
var typesbykind=groupby(apitoconvert.Types,a=>a.Kind);
typesbykind.Enum.forEach(enumv=>{
lazySet(wintypes,enumv.Name,_=>({name:enumv.Name,...nativehelper[enumv.IntegerBase].typeobj,
values:(enumv.Values.map(a=>{let x={};x[a.Name]=a.Value;return x}).reduce((a,b)=>({...a,...b}))),
get(buf,offset){
const _buf = buf[nativehelper[enumv.IntegerBase].readbuf](offset);
if(debug){
if(enumv.Flags){
return {flags:Object.entries(this.values).filter(a=>_buf&a[1]).map(a=>a[0]),_$debugValue:_buf}
}else{
return {possibleFlags:Object.entries(this.values).filter(a=>a[1]==_buf).map(a=>a[0]),_$debugValue:_buf}
}
}else 
return _buf;
},
set(buf,offset,val){
var setstr=nativehelper[enumv.IntegerBase].writebuf
if(debug&&val._$debugValue)
{
buf[setstr](val._$debugValue,offset);
} else if (Buffer.isBuffer(val)) {
   val.copy(buf,offset,0,this.size);
} else if(typeof val == "number"){
   buf[setstr](val,offset);
}else {
   var a=+this.values[val]
   a=a??val;
   buf[setstr](a,offset);
}
}}));
});
typesbykind.NativeTypedef.forEach(A=>lazySet(wintypes,A.Name,_=>convertApiTypeToJSType(A.Def)));
typesbykind.FunctionPointer.forEach(E=>lazySet(wintypes,E.Name,_=>fun2Type(E)));
	
typesbykind.Struct.forEach(Struct=>lazySet(wintypes,Struct.Name,_=>{
	return objApiToJSApi(Struct);
}));
typesbykind.Union.forEach(Union=>lazySet(wintypes,Union.Name,_=>{
	return objApiToJSApi(Union);
}));
apitoconvert.Constants.forEach(_=>{
    wintypes[_.Type.Name].constants=wintypes[_.Type.Name].constants??{};
    wintypes[_.Type.Name].constants[_.Name]=_.Value;
});
apitoconvert.Functions.forEach(a=>lazySet(functions,a.Name,_=>ref.alloc(fun2Type(a),getDll(a.DllImport).get(a.Name))));
}
wintypes.GUID=StructType({
	Data1:wintypes.ULONG,
	Data2:wintypes.USHORT,
	Data3:wintypes.USHORT,
	Data4:ArrayType(wintypes.UCHAR,8)
});
wintypes.CLSID=wintypes.GUID;
wintypes.IID=wintypes.GUID;
wintypes.FMTID=wintypes.GUID;
apis['System.Com.json'].Types[32].Name
wintypes.GUID(Buffer.from(apis['System.Com.json'].Types[32].Guid.split('-').join(''),"hex"))

//Creates a type
//returns a "class"
function cInterface(objDefinition){
var interface=StructType();
function InterfaceStruct(strobject){
 //is structObj a StructType or an Object
 if(strobject instanceof interface){
 this._$struct=structObj;
 }else{
 //whether buffer or Object should still work.
 this._$struct=new interface(strobject);
 }
 Object.entries(objDefinition).forEach(([k,v])=>
 this[k]=function(...args){
 return this._$struct[k]?.(this.ref(),...args);
 }
)
return this;
 

}
InterfaceStruct.prototype.ref=function(...args){
return this._$struct.ref(...args)
}
Object.setPrototypeOf(InterfaceStruct,interface);
//console.log("checking properties",InterfaceStruct.size,InterfaceStruct.indirection,'size' in InterfaceStruct,'indirection' in InterfaceStruct)
InterfaceStruct.get=function(buf,offset){
const _buf = ref.readPointer(buf, offset)
    if (ref.isNull(_buf)) {
      return null;
    }
    return new this(_buf);
}
InterfaceStruct.set=function(buf,offset,val){
return interface.set(buf,offset,val._$struct)
}
InterfaceStruct.inherit=function(obj){
return cInterface({...objDefinition,...obj})
}

//interface.defineProperties
Object.entries(objDefinition).forEach(([k,v])=>

interface.defineProperty(k,CFTypeConstructor(v[0],[ref.refType(InterfaceStruct),...v[1]]))

)

return InterfaceStruct;
};
cInterface(IUnknownVtbl);

var IUnknownVtbl={
	QueryInterface:[w.wintypes.HRESULT,[w.wintypes.REFIID,w.wintypes.PPVOID]],
	AddRef:[w.wintypes.ULONG,[]],
	Release:[w.wintypes.ULONG,[]],
}
```
