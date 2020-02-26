'use strict';
const http = require('http'),
	config = require('./config.js');
let i = 0;
http.createServer(function (req, res) {
	i++;
	if (req.headers.host) {
		res.writeHead(307, {
			location: 'https://' + req.headers.host.replace(/(:\d+)?$/, config.server.web === 443 ? '' : ':' + config.server.web) + req.url
		});
	} else {
		res.writeHead(400);
	}
	res.end();
}).on('listening', function () {
	console.log('will redirect http to https.');
}).listen(config.server.http);
process.on('message', function (msg) {
	if (msg.type === 'stats') {
		process.send({
			id: msg.id,
			data: `${i} requests.`
		});
	}
}).title = 'fusion http server';