'use strict';
if (process.argv[2]) {
	let p = process.argv[2].split(':');
	process.stdin.pipe(require('tls').connect({
		host: p[0],
		port: p[1],
		rejectUnauthorized: false
	})).on('error', function (e) {
console.log(e);
		this.destroy();
	}).pipe(process.stdout);
} else {
	console.log('please enter a server to connect');
}