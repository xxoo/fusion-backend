'use strict';
const res = [];
let exports;
Promise.all([
	import('./3.js'),
	import('./4.js')
]).then(([m3, m4]) => {
	exports = `2.js with ${m3} and ${m4}`;
	while (res.length) {
		res[0](exports);
		res.shift();
	}
});

export function then(resolve, reject) {
	if (!exports) {
		res.push(resolve);
	} else {
		resolve(exports);
	}
}