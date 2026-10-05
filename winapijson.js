function callListeners(target,key,value){
	if (key in target._callbacks) {
        target._callbacks[key].forEach(callback => callback(value));
        delete target._callbacks[key];
      }
}
function lazySet(object, property, someExpensiveComputation) {
  Object.defineProperty(object, property, {
    get() {
      const actualData = someExpensiveComputation();
	  //callListeners(this,property,actualData);
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



var groupby = require("lodash/groupBy")
var _get = require("lodash/get")
var _set = require("lodash/set")
var ffi = require('ffi-napi');
var ref = require('ref-napi');
var Struct = require('ref-struct-di')(ref)
var Union = require('ref-union-di')(ref);
var ArrayB = require('ref-array-di')(ref);
var assert = require('node:assert');
var path = require('node:path');
var fs = require('node:fs');
var util = require('node:util');


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
	//if(b)b.packed=true; else b={packed:true};
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
var ntvhlprfun=({size,indirection,alignment,ffi_type})=>({size,indirection,alignment,ffi_type});
var nativehelper = new Proxy({
    Byte: {
    typeobj: (ntvhlprfun)(ref.types.uint8),
    writebuf: "writeUint8",
    readbuf: "readUint8",
  },SByte: {
    typeobj: (ntvhlprfun)(ref.types.int8),
    writebuf: "writeInt8",
    readbuf: "readInt8",
  },Single: {
    typeobj: (ntvhlprfun)(ref.types.float),
    writebuf: "writeFloatLE",
    readbuf: "readFloatLE",
  },Boolean: {
    typeobj: (ntvhlprfun)(ref.types.uint8),
    writebuf: "writeUint8",
    readbuf: "readUint8",
  }
}, {
  get: (target, prop) => {
    if (prop in target) {
      return target[prop];
    } else {
      const propLowerCase = prop.toLowerCase();
      const typeobjExists = propLowerCase in ref.types;

      if (typeobjExists) {
        const typeobj = (ntvhlprfun)(ref.types[propLowerCase]);

        const writebuf = `write${prop}LE`;
        const readbuf = `read${prop}LE`;

        if (Buffer.prototype[writebuf] && Buffer.prototype[readbuf]) {
          target[prop] = { typeobj, writebuf, readbuf };
          return target[prop];
        }
      }
    }
  },
});

function longeSTring(a, b) {
  return a.length > b.length ? a : b;
}
const reflection = require('./reflection');
const catalog = reflection.catalog;
const {lazyRegistry} = require('./lib/lazy-registry');
const typeCache = new Map();
const functionCache = new Map();
const custom = {types: new Map(), functions: new Map(), constants: new Map()};

function entryFor(category, name, api) {
  return custom[category].get((api || '') + ':' + name) || catalog.find(category, name, {api});
}
function readEntry(entry) { return entry.definition || catalog.read(entry); }
function apiFor(entry) { return typeof entry.api === 'string' ? entry.api : catalog.describe(entry).api; }
function hasEntry(category, name, options) {
  return custom[category].has(':' + name) || catalog.has(category, name, options);
}
function* symbolNames(category) {
  for (const item of catalog.list(category)) {
    if (category !== 'types' || item.kind !== 'ComClassID') yield item.name;
  }
  for (const entry of custom[category].values()) {
    if (category !== 'types' || entry.definition.Kind !== 'ComClassID') yield entry.definition.Name;
  }
}
function constantsFor(type) {
  return lazyRegistry({
    has: name => {
      const entry = custom.constants.get(':' + name);
      return entry ? readConstantType(entry) === type : catalog.has('constants', name, {type});
    },
    names: function* () {
      for (const item of catalog.list('constants', {type})) yield item.name;
      for (const entry of custom.constants.values()) {
        if (readConstantType(entry) === type) yield entry.definition.Name;
      }
    },
    resolve: name => readEntry(custom.constants.get(':' + name) || catalog.find('constants', name, {type})).Value
  });
}
function readConstantType(entry) { return entry.definition?.Type?.Name || entry[6]; }
function intrinsicType(name) {
  if (name === 'IntPtr') return ref.types[`int${ref.sizeof.pointer * 8}`];
  if (name === 'UIntPtr') return ref.types[`uint${ref.sizeof.pointer * 8}`];
  if (name === 'Byte') return ref.types.uint8;
  if (name === 'SByte') return ref.types.int8;
  if (name === 'Single') return ref.types.float;
  if (name === 'Boolean') return ref.types.uint8;
  return ref.types[name.toLowerCase()];
}
function resolveType(name, api) {
  const key = (api || '') + ':' + name;
  if (typeCache.has(key)) return typeCache.get(key);
  if (!api && Object.hasOwn(typeOverrides, name)) return typeOverrides[name];
  const entry = entryFor('types', name, api);
  let value;
  if (!entry) {
    const native = intrinsicType(name);
    if (!native) throw new Error(`Win32 type ${api ? api + '.' : ''}${name} was not found`);
    value = Object.create(native);
  } else {
    const definition = readEntry(entry);
    const namespace = apiFor(entry);
    const qualified = namespace + ':' + name;
    if (typeCache.has(qualified)) return typeCache.get(qualified);
    try {
      switch (definition.Kind) {
        case 'Struct': case 'Union': {
          value = definition.Kind === 'Struct' ? StructType() : new Union();
          typeCache.set(qualified, value); // Forward declaration for self pointers.
          fillAggregate(value, definition, namespace);
          break;
        }
        case 'NativeTypedef': {
          const base = convertApiTypeToJSType(definition.Def, undefined, namespace);
          value = typeof base === 'function' ? base : Object.create(base);
          break;
        }
        case 'Enum': value = objApiEnumToJSEnum(definition); break;
        case 'FunctionPointer': value = fun2Type(definition, namespace); break;
        case 'Com': value = convertWinapiInterface2ffi(definition, namespace); break;
        default: throw new Error(`Unsupported type kind ${definition.Kind} for ${name}`);
      }
      typeCache.set(qualified, value);
    } catch (error) { typeCache.delete(qualified); throw error; }
  }
  if (!Object.hasOwn(value, 'constants')) {
    Object.defineProperty(value, 'constants', {value: constantsFor(name), configurable: true});
  }
  typeCache.set(key, value);
  return value;
}
const typeOverrides = Object.create(null);
var wintypes = lazyRegistry({
  has: name => (hasEntry('types', name) &&
    custom.types.get(':' + name)?.definition.Kind !== 'ComClassID' &&
    !catalog.has('types', name, {kind:'ComClassID'})) || !!intrinsicType(name),
  names: () => symbolNames('types'),
  resolve: name => resolveType(name)
}, typeOverrides);
Object.defineProperty(typeOverrides, 'attr', {value: async name => {
  const value = wintypes[name];
  if (value === undefined) throw new Error(`Win32 type ${name} was not found`);
  return value;
}, configurable: true});

function methodProxy(obj1, property1, path) {
  Object.defineProperty(obj1, property1, {
    get() {
      //console.log("just so I can get this right, this is ",this,path)
      return _get(this, path);
    },
    set(value) {
      _set(this, path, value);
    },
    configurable: true,
    enumerable: true
  });
}
var CFTypeConstructor = function(rtype, args) {
  return {
    size: ref.sizeof.pointer,
    alignment: ref.alignof.pointer,
    rtype,
    name: `(${args.map(a=>a.name).join(',')}) -> ${rtype.name}`,
    ffi_type: ffi.FFI_TYPES.pointer,
    args,
    indirection: 1,
    get: function get(buf, offset) {
      const _buf = ref.readPointer(buf, offset)
      if (ref.isNull(_buf)) {
        return null;
      }
      return ffi.ForeignFunction(_buf, rtype, args);
    },
    set: function set(buf, offset, val) {
      let _buf
      if (Buffer.isBuffer(val)) {
        _buf = val;
      } else if ("_buf" in val) {
        _buf = val._buf;
      } else {
        // assume fn
		assert(typeof val=="function","val is not a function.")
        _buf = ffi.Callback(rtype, args, val);
        val._buf = _buf; //make lifetime valid as long as val is valid.
      }
      return ref.writePointer(buf, offset, _buf);
    }
  }
}


function objApiToJSApi(obj, api, nestedTypes) {
  switch (obj.Kind) {
    case 'Struct': return objApiStructToJSStruct(obj, api, nestedTypes);
    case 'Union': return objApiUnionToJSUnion(obj, api, nestedTypes);
    case 'Enum': return objApiEnumToJSEnum(obj);
    case 'Array': return objApiArrayToJSArray(obj, api, nestedTypes);
    default: throw new Error('Unsupported nested type kind: ' + obj.Kind);
  }
}
function getNestedTypes(objApi, api, parent) {
  const nested = Object.create(parent || null);
  for (const definition of objApi.NestedTypes || []) {
    if (definition.Architectures?.length && !definition.Architectures.includes(catalog.architecture)) continue;
    lazySet(nested, definition.Name, () => objApiToJSApi(definition, api, nested));
  }
  return nested;
}
function getFields(someType) {
  return Object.keys(someType.fields).flatMap(name => someType.anonfields?.includes(name)
    ? getFields(someType.fields[name].type) : name);
}
function fillAggregate(value, definition, api, parent) {
  const nested = getNestedTypes(definition, api, parent);
  value.Name = definition.Name;
  for (const field of definition.Fields) {
    value.defineProperty(field.Name, convertApiTypeToJSType(field.Type, nested, api));
  }
  value.anonfields = definition.Fields.filter(field => /Anonymous.*?_e__/.test(field.Type.Name || ''))
    .map(field => {
      for (const name of getFields(value.fields[field.Name].type)) methodProxy(value.prototype, name, `${field.Name}.${name}`);
      return field.Name;
    });
  return value;
}
function objApiStructToJSStruct(objApi, api, nestedTypes) {
  return fillAggregate(StructType(), objApi, api, nestedTypes);
}
function objApiUnionToJSUnion(objApi, api, nestedTypes) {
  return fillAggregate(new Union(), objApi, api, nestedTypes);
}
function convertApiTypeToJSType(type, nestedTypes, api) {
  switch (type.Kind) {
    case 'Native': return resolveType(type.Name);
    case 'ApiRef': {
      if (nestedTypes && type.Name in nestedTypes) return nestedTypes[type.Name];
      if (type.Parents?.length) {
        const parent = catalog.get('types', type.Parents[0], {api: type.Api || api});
        if (!parent) throw new Error(`Parent type ${type.Parents[0]} was not found`);
        let scope = getNestedTypes(parent, type.Api || api);
        // Metadata Parents identifies the enclosing aggregate(s).
        for (const name of type.Parents.slice(1)) {
          const child = parent.NestedTypes?.find(item => item.Name === name);
          if (!child) throw new Error(`Nested parent ${name} was not found`);
          scope = getNestedTypes(child, type.Api || api, scope);
        }
        if (!(type.Name in scope)) throw new Error(`Nested type ${type.Name} was not found`);
        return scope[type.Name];
      }
      return resolveType(type.Name, type.Api || api);
    }
    case 'Array': return ArrayType(convertApiTypeToJSType(type.Child, nestedTypes, api), type.Shape.Size);
    case 'PointerTo': case 'LPArray': return ref.refType(convertApiTypeToJSType(type.Child, nestedTypes, api));
    default: throw new Error('Unsupported API type: ' + type.Kind);
  }
}
function objApiEnumToJSEnum(definition) {
  const native = intrinsicType(definition.IntegerBase);
  if (!native) throw new Error('Unsupported enum base: ' + definition.IntegerBase);
  return Object.assign(Object.create(native), {name: definition.Name,
    values: Object.fromEntries(definition.Values.map(item => [item.Name, item.Value]))});
}
function objApiArrayToJSArray(definition, api, nestedTypes) {
  return convertApiTypeToJSType(definition, nestedTypes, api);
}

function fun2Type(E, api) {
  var r = CFTypeConstructor(convertApiTypeToJSType(E.ReturnType, undefined, api), E.Params.map(a => convertApiTypeToJSType(a.Type, undefined, api)));
  //assert(E.ReturnAttrs.length == 0); These are C# attributes, 
  if (debug && E.Platform !== null) {
    console.log(`Loading function ${E.Name} with Platform ${E.Platform}`)
  }
  r.SetLastError = E.SetLastError;
  r.Params = E.Params;
  return r;

}
function convertWinapiInterface2ffi(interfaceWinApiJson, api){
    //an interface is just a struct :o
var sumInterface=StructType();
    //Create type wrapper around struct
    function InterfaceStruct(strobject) {
    //is structObj a StructType or an Object
    if (strobject instanceof sumInterface) {
      this._$struct = strobject;
    } else {
      //whether buffer or Object should still work.
      this._$struct = new sumInterface(strobject);
      this._$struct['ref.buffer'].type=InterfaceStruct;
    }
        //This is definining how to call the methods from the JavaScript and not from the FFI api
    /*interfaceWinApiJson.Methods.map(_=>_.Name).forEach((k) =>
      this[k] = function(...args) {
        return this._$struct[k]?.(this.ref(), ...args);
      }
    )*/
    return this;
  }
  InterfaceStruct.prototype.ref = function(...args) {
    return this._$struct.ref(...args)
  }
Object.setPrototypeOf(InterfaceStruct, sumInterface);
    typeCache.set((api || "") + ":" + interfaceWinApiJson.Name, InterfaceStruct);
    InterfaceStruct.get = function(buf, offset) {
        assert(offset==0,"offset is not zero, what do?");
    return new this(buf);
  }
    InterfaceStruct.GUID=new wintypes.GUID(Buffer.from(interfaceWinApiJson.Guid.split('-').join(''), "hex"));
    InterfaceStruct.methods=[];
    if(interfaceWinApiJson.Interface){
        assert(interfaceWinApiJson.Interface.Kind=='ApiRef',"Kind!=ApiRef")
        assert(interfaceWinApiJson.Interface.TargetKind== 'Com',"TargetKind!=Com")
        sumInterface.defineProperty("_anonymous__$parent",resolveType(interfaceWinApiJson.Interface.Name, interfaceWinApiJson.Interface.Api || api));
        resolveType(interfaceWinApiJson.Interface.Name, interfaceWinApiJson.Interface.Api || api).methods.forEach(prop=>methodProxy(InterfaceStruct.prototype, prop, `_anonymous__$parent.${prop}`))
        InterfaceStruct.methods=resolveType(interfaceWinApiJson.Interface.Name, interfaceWinApiJson.Interface.Api || api).methods.slice();
        
    }
var methods=interfaceWinApiJson.Methods.map(_=>[_.Name,method2Type(InterfaceStruct,_, api)]);
    methods.forEach(_=>sumInterface.defineProperty(..._));
    InterfaceStruct.methods=[...InterfaceStruct.methods,...methods.map(([n,_])=>n)];
    return InterfaceStruct;
}
function method2Type(InterfaceStruct,E, api) {
  var r = CFTypeConstructor(convertApiTypeToJSType(E.ReturnType, undefined, api), [ref.refType(InterfaceStruct),...E.Params.map(a => convertApiTypeToJSType(a.Type, undefined, api))]);
  assert(E.ReturnAttrs.length == 0);
  if (debug && E.Platform !== null) {
    console.log(`Loading function ${E.Name} with Platform ${E.Platform}`)
  }
  r.SetLastError = E.SetLastError;
  r.Params = E.Params;
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

function getDll(dllname) {
  var dllstr = appendDLL(dllname);
  if (dll[dllname]) return dll[dllname];
  dll[dllname] = ffi.DynamicLibrary(dllstr, ffi.DynamicLibrary.FLAGS.RTLD_LAZY);
  return dll[dllname];
}
var dll = {};
const debug = process.env.WINFFI_DEBUG === '1';
var readdir = util.promisify(fs.readdir);

function functionPointer(name, api) {
  const entry = entryFor('functions', name, api);
  if (!entry) throw new Error(`Win32 function ${name} was not found`);
  const namespace = apiFor(entry);
  const key = namespace + ':' + name;
  if (functionCache.has(key)) return functionCache.get(key);
  const definition = readEntry(entry);
  const signature = fun2Type(definition, namespace);
  const pointer = getDll(definition.DllImport).get(name);
  const buffer = ref.alloc(signature, pointer);
  let callable;
  // Preserve functions.Name.type and .deref(), while building the CIF once.
  buffer.deref = () => callable || (callable = ffi.ForeignFunction(pointer, signature.rtype, signature.args));
  functionCache.set(key, buffer);
  return buffer;
}
function bind(name, api) { return functionPointer(name, api).deref(); }
var functions = lazyRegistry({has: name => hasEntry('functions', name),
  names: () => symbolNames('functions'), resolve: name => functionPointer(name)});
var clsIDs = lazyRegistry({
  has: name => custom.types.get(':' + name)?.definition.Kind === 'ComClassID' ||
    catalog.has('types', name, {kind:'ComClassID'}),
  names: function* () {
    for (const item of catalog.list('types', {kind:'ComClassID'})) yield item.name;
    for (const entry of custom.types.values()) {
      if (entry.definition.Kind === 'ComClassID') yield entry.definition.Name;
    }
  },
  resolve: name => new wintypes.GUID(Buffer.from(readEntry(entryFor('types', name)).Guid.replaceAll('-', ''), 'hex'))
});

// Explicit bulk loading remains available for callers that request it, without
// adding API files to require.cache or doing this work during normal startup.
async function requireJSONFiles(dirPath) {
  const directory = path.resolve(__dirname, dirPath);
  const result = {};
  for (const filename of await readdir(directory)) {
    if (filename.endsWith('.json')) result[filename] = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
  }
  return result;
}
function procedureConvertApiFromJSON(api, namespace = '') {
  for (const [category, field] of [['types','Types'], ['functions','Functions'], ['constants','Constants']]) {
    for (const definition of api[field] || []) {
      if (definition.Architectures?.length && !definition.Architectures.includes(catalog.architecture)) continue;
      custom[category].set(namespace + ':' + definition.Name, {api: namespace, definition});
    }
  }
}

wintypes.GUID = StructType({
  Data1: wintypes.ULONG,
  Data2: wintypes.USHORT,
  Data3: wintypes.USHORT,
  Data4: ArrayType(wintypes.UCHAR, 8)
});

wintypes.Guid=wintypes.IID = wintypes.GUID;
wintypes.FMTID = wintypes.GUID;
//var apis = requireJSONFiles("win32json/api");


module.exports={Struct:StructType,lazySet,groupby,_get,_set,ffi,ref,StructType,Union,ArrayType,assert,path,nativehelper,longeSTring,wintypes,methodProxy,CFTypeConstructor,objApiToJSApi,getNestedTypes,
getFields,objApiStructToJSStruct,convertApiTypeToJSType,objApiEnumToJSEnum,objApiUnionToJSUnion,objApiArrayToJSArray,fun2Type,
convertWinapiInterface2ffi,method2Type,appendDLL,getDll,dll,functions,clsIDs,debug,readdir,requireJSONFiles,procedureConvertApiFromJSON,
reflection, bind, resolveType, done:Promise.resolve()
};