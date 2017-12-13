'use strict';
const fs = require('fs'),
	path = require('path'),
	config = eval(fs.readFileSync(path.join(__dirname, 'config.js'), {
		encoding: 'utf8'
	})),
	net = require('net'),
	opentype = require('opentype.js'),
	font = opentype.loadSync(path.join(__dirname, 'captcha.ttf')),
	f = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
	props = ['x', 'y', 'x1', 'y1'],
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
					msg = '';
				}
			}
		}).setEncoding('utf8');
	}).on('listening', function () {
		console.log('server started.');
	}).on('error', function (err) {
		console.error(err.stack);
	}).on('end', startServer);
process.title = 'fusion captcha server';
require('./jsex.js');
startServer();