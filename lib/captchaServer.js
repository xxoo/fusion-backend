'use strict';
require('./globals.js');
const fs = require('fs'),
	path = require('path'),
	net = require('net'),
	font = require('opentype.js').loadSync(path.join(__dirname, 'captcha.ttf')),
	config = require('./config.js'),
	f = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
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
			for (let i = 0; i < data.length; ++i) {
				msg += data[i];
				if (i < data.length - 1) {
					try {
						msg = Function('return ' + msg)();
					} catch (e) {
						console.error(e);
					}
					if (dataType(msg) === 'Object') {
						const len = msg.len || 4;
						let s = '',
							t = tps[msg.type] || tps.normal;
						for (let i = 0; i < len; ++i) {
							s += f[Math.round(Math.random() * t)];
						}
						t = font.getPath(s);
						t.commands.forEach(function (cmd) {
							props.forEach(function (v) {
								if (v in cmd) {
									cmd[v] += Math.random() * 4 - 2;
								}
							});
						});
						msg = {
							path: t.toPathData(),
							text: s
						};
					} else {
						msg = Error('bad_request');
					}
					socket.write(toJsex(msg) + '\n');
					++stats.requests;
					msg = '';
				}
			}
		}).once('close', function () {
			--stats.clients;
		}).setEncoding('utf8');
		++stats.clients;
	}).on('listening', function () {
		console.log('server started.');
	}).on('error', function (err) {
		this.destroy();
		console.error(err.stack);
	}).once('close', startServer);
process.on('message', function (msg) {
	if (msg.type === 'stats') {
		process.send({
			id: msg.id,
			data: `${stats.clients} clients, ${stats.requests} requests.`
		});
	}
}).title = 'fusion captcha server';
startServer();