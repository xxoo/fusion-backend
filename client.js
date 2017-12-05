const tls = require('tls');
if (process.argv[2]) {
	let p = process.argv[2].split(':');
	process.stdin.pipe(tls.connect({
		host: p[0],
		port: p[1],
		rejectUnauthorized: false
	})).pipe(process.stdout);
} else {
	console.log('please enter a server to connect');
}