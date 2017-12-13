'use strict';
if (process.argv[2]) {
	let p = process.argv[2].split(':');
	process.stdin.pipe(require('tls').connect({
		host: p[0],
		port: p[1],
		rejectUnauthorized: false
	})).pipe(process.stdout);
} else {
	console.log('please enter a server to connect');
}
let qsort = fn => ([x, ...xs]) => x == null ? [] :
	[
		...qsort(fn)(xs.filter(a => fn(a, x))),
		x,
		...qsort(fn)(xs.filter(a => !fn(a, x)))
	]

qsort((a, b) => a < b)([10, 0, 9, 7, -999])