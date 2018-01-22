'use strict';
const fs = require('fs'),
	path = require('path'),
	net = require('net'),
	opentype = require('opentype.js'),
	font = opentype.loadSync(path.join(__dirname, 'captcha.ttf'));
require('./jsex.js');
eval(fs.readFileSync(path.join(__dirname, 'config.js'), {
	encoding: 'utf8'
}))(function (config) {
	let f = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
		props = ['x', 'y', 'x1', 'y1'],
		stats = {
			clients: 0,
			requests: 0
		},
		tps = {
			all: f.length - 1,
			normal: 35,
			number: 9
		},
		startServer = function (err) {
			if (err) {
				console.log('server is stoped by error, restarting...');
			}
			net.createConnection(config.server.captcha, function () {
				this.end();
				console.log('server is already running');
			}).on('error', function () {
				if (typeof config.server.captcha === 'string') {
					fs.unlink(config.server.captcha, function () {
						server.listen(config.server.captcha);
					});
				} else {
					server.listen(config.server.captcha);
				}
			});
		},
		server = net.createServer(function (socket) {
			let msg = '';
			socket.on('data', function (data) {
				data = data.split('\n');
				for (let i = 0; i < data.length; i++) {
					msg += data[i];
					if (i < data.length - 1) {
						msg = msg.parseJsex();
						if (msg && dataType(msg.value) === 'object') {
							let len = msg.value.len || 4,
								t = tps[msg.value.type] || tps.normal,
								s = '';
							for (let i = 0; i < len; i++) {
								s += f[Math.round(Math.random() * t)];
							}
							t = font.getPath(s);
							t.commands.forEach(function (cmd) {
								props.forEach(function (v) {
									if (cmd.hasOwnProperty(v)) {
										cmd[v] += Math.random() * 4 - 2;
									}
								});
							});
							msg = {
								path: t.toPathData(),
								text: s
							};
						} else {
							msg = Error('bad request');
						}
						socket.write(toJsex(msg) + '\n');
						stats.requests++;
						msg = '';
					}
				}
			}).on('close', function () {
				stats.clients--;
			}).setEncoding('utf8');
			stats.clients++;
		}).on('listening', function () {
			console.log('server started.');
		}).on('error', function (err) {
			console.error(err.stack);
		}).on('end', startServer);
	process.on('message', function (msg) {
		if (msg.type === 'stats') {
			process.send({
				id: msg.id,
				data: `${stats.clients} clients, ${stats.requests} requests.`
			});
		}
	}).title = 'fusion captcha server';
	startServer();
});