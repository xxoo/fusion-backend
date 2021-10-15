'use strict';

//we just want globalThis
if (typeof globalThis === 'undefined') {
	global.globalThis = global;
}

require('jsex');

globalThis.isEqual = (a, b) => toJsex(a, { sorting: true, implicitConversion: true }) === toJsex(b, { sorting: true, implicitConversion: true });

//reference types are the names of their constructor, such as String, Uint8Array, AsyncFunction
//primitive types are lowercased, such as string, bigint, null
globalThis.dataType = data => {
	if (data == null) {
		return String(data);
	} else {
		let t = typeof data;
		if (['function', 'object'].indexOf(t) >= 0) {
			t = Object.prototype.toString.call(data);
			t = t.substring(8, t.length - 1);
		}
		return t;
	}
};

globalThis.isEmpty = o => {
	for (const n in o) {
		return false;
	}
	return true;
};

globalThis.ensurePath = (o, ...args) => {
	for (const i of args) {
		if (!(i in o)) {
			o[i] = { __proto__: null };
		}
		o = o[i];
	}
	return o;
};