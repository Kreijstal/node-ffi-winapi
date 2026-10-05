'use strict';

// Keys can be inspected without invoking a resolver. Only requested values live
// in the target; there is no getter/closure for every symbol in the catalog.
function lazyRegistry({has, names, resolve}, target = Object.create(null)) {
  return new Proxy(target, {
    get(object, name) {
      if (Reflect.has(object, name)) return Reflect.get(object, name);
      if (typeof name !== 'string' || !has(name)) return undefined;
      const value = resolve(name);
      Object.defineProperty(object, name, {value, writable: true, configurable: true, enumerable: true});
      return value;
    },
    has(object, name) { return Reflect.has(object, name) || (typeof name === 'string' && has(name)); },
    ownKeys(object) { return [...new Set([...Reflect.ownKeys(object), ...names()])]; },
    getOwnPropertyDescriptor(object, name) {
      return Reflect.getOwnPropertyDescriptor(object, name) ||
        (typeof name === 'string' && has(name) ? {configurable: true, enumerable: true,
          get: () => resolve(name)} : undefined);
    }
  });
}
module.exports = {lazyRegistry};
