'use strict';
require('./globals.js');
const fs = require('fs'),
	path = require('path'),
	tls = require('tls'),
	readline = require('readline'),
	child_process = require('child_process'),
	cfg = require.resolve('./config.js'),
	logs = [],
	sockets = [],
	api = { __proto__: null },
	server = { __proto__: null },
	apicbs = { __proto__: null },
	servercbs = { __proto__: null },
	opt = {
		silent: true,
		windowsHide: true
	},
	commands = {
		__proto__: null,
		stats: (type, id, param) => new Promise((resolve, reject) => {
			let o, c;
			if (type === 'api') {
				o = api;
				c = apicbs;
			} else {
				type = 'server';
				o = server;
				c = servercbs;
			}
			if (id in o) {
				o[id].send({
					id: cbid,
					type: 'stats',
					data: param
				});
				c[id][cbid++] = resolve;
			} else {
				resolve(`${id} ${type} is not running.\n`);
			}
		}),
		reloadConfig: () => new Promise((resolve, reject) => {
			delete require.cache[cfg];
			const c = require(cfg),
				a = [],
				b = [],
				s = [];
			for (const n in c.server) {
				if (!isEqual(c.server[n], config.server[n])) {
					if (n in server) {
						server[n].kill();
					} else {
						a.push(n);
					}
					delete config.server[n];
					s.push(n);
				}
			}
			if (server.web && !config.server.web && s.indexOf('web') < 0) {
				if (!isEqual(config.site, c.site)) {
					server.web.send({
						type: 'updateConfig',
						data: toJsex(c.site)
					});
				}
			}
			for (const n in c.site) {
				if (n in api) {
					if (!(n in config.site) || !isEqual(c.site[n].api, config.site[n].api)) {
						api[n].kill();
					} else if (c.site[n].api.deps) {
						const r = { __proto__: null },
							d = getSameItems(c.site[n].api.deps, s);
						if (d.length) {
							for (const i of d) {
								r[i] = c.server[i];
							}
							api[n].send({
								type: 'updateConfig',
								data: toJsex(r)
							});
						}
					}
				} else {
					b.push(n);
				}
				delete config.site[n];
			}
			for (const n in config.server) {
				if (server[n]) {
					server[n].kill();
				}
			}
			for (const n in config.site) {
				if (api[n]) {
					api[n].kill();
				}
			}
			config = c;
			for (const i of a) {
				startServer(i);
			}
			for (const i of b) {
				startApi(i);
			}
			resolve('new config loaded.\n');
		}),
		showlog: name => new Promise((resolve, reject) => {
			if (name) {
				try {
					resolve(fs.createReadStream(path.join('logs', name + '.log')));
				} catch (e) {
					reject(e);
				}
			} else {
				fs.readdir('logs', function (err, result) {
					if (err) {
						reject(err);
					} else {
						let r = 'available logs are:\n';
						result.forEach(function (item) {
							const m = item.match(/^(\d+)\.log$/);
							if (m) {
								r += m[1] + '\n';
							}
						});
						resolve(r);
					}
				});
			}
		}),
		list: async () => {
			let s = 'running server:';
			for (const n in server) {
				s += ' ' + n;
			}
			s += '\nrunning api:';
			for (const n in api) {
				s += ' ' + n;
			}
			return s + '\n';
		},
		restart: async (type, ...names) => {
			let r;
			if (['all', 'server', 'api', 'manager'].indexOf(type) < 0) {
				r = 'unknown type';
			} else if (type === 'manager') {
				r = 'restarting self, please reconnect later';
				process.exit();
			} else {
				let s;
				r = '';
				if (type === 'all') {
					s = names[0] === 'server' ? server : api;
					names = Object.getOwnPropertyNames(s);
				} else {
					s = type === 'server' ? server : api;
				}
				names.forEach(function (item) {
					if (item in s) {
						if (r) {
							r += '\n';
						}
						r += item + ' is killed.';
						s[item].kill();
					} else {
						r += item + ' is not running.';
					}
				});
			}
			return r + '\n';
		},
		cleanUpCache: () => {
			const del = (p, dir) => new Promise((resolve, reject) => {
				const rm = dir ? fs.rmdir : fs.unlink;
				rm(p, function (err) {
					if (err) {
						resolve(0);
					} else {
						dir ? d++ : f++;
						resolve(1);
					}
				});
			}),
				chkfile = file => new Promise((resolve, reject) => {
					const f = path.join('cache', file);
					fs.stat(f, function (err, stat) {
						if (err) {
							resolve(0);
						} else {
							if (stat.isDirectory()) {
								chkdir(file).then(resolve);
							} else {
								fs.stat(path.join('static', file.replace(/.gz$/, '')), function (err, stat) {
									if (err || stat.isDirectory()) {
										del(f).then(resolve);
									} else {
										resolve(0);
									}
								});
							}
						}
					});
				}),
				chkdir = dir => new Promise((resolve, reject) => {
					const p = path.join('cache', dir);
					fs.readdir(p, function (err, files) {
						if (err) {
							resolve(0);
						} else {
							if (files.length) {
								const ps = [];
								files.forEach(function (file) {
									ps.push(chkfile(path.join(dir, file)));
								});
								Promise.all(ps).then(function (vals) {
									let s = 0;
									vals.forEach(function (v) {
										s += v;
									});
									if (s === files.length) {
										del(p, true).then(resolve);
									} else {
										resolve(0);
									}
								});
							} else {
								del(p, true).then(resolve);
							}
						}
					});
				});
			let d = 0,
				f = 0;
			return chkdir('').then(() => 'totally removed ' + d + ' dirs and ' + f + ' files.\n');
		},
		versions: async () => toJsex(process.versions) + '\n',
		help: async () => 'available commands: ' + Object.getOwnPropertyNames(commands).join(' ') + ' exit\n'
	},
	getSite = d => {
		if (d) {
			return (d in config.site) ? d : getSite(d.replace(/[^\.]*\.?/, ''));
		} else {
			return 'defaultHost';
		}
	},
	isLocal = srv => ['string', 'number'].indexOf(typeof srv) >= 0 || srv.host === '0.0.0.0' || srv.host === '127.0.0.1',
	writeSocket = data => {
		let i = 0;
		while (i < sockets.length) {
			if (sockets[i].destroyed) {
				sockets.splice(i, 1);
			} else {
				sockets[i].write(data);
				++i;
			}
		}
	},
	writeLog = (target, data, newline) => {
		if (data) {
			if (!lastlog) {
				data = '[' + new Date().toLocaleString() + '] ' + data;
			}
			lastlog += data;
			target.write(data);
		}
		if (newline) {
			logs.push(lastlog);
			lastlog = '';
			target.write('\n');
			if (logs.length > config.manager.logcache) {
				logs.shift();
			}
		}
	},
	watch = (proc, name) => {
		const log = (input, output) => {
			let last = '';
			input.on('data', function (data) {
				const a = data.split('\n'),
					j = a.length - 1;
				for (let i = 0; i <= j; ++i) {
					last += a[i];
					if (i < j) {
						writeLog(output, '[' + name + ']');
						if (last) {
							writeLog(output, ' ' + last);
						}
						writeLog(output, '', true);
						last = '';
					}
				}
			}).on('end', function () {
				if (last) {
					writeLog(output, '[' + name + '] ' + last, true);
				}
			}).setEncoding('utf8');
		};
		log(proc.stdout, process.stdout);
		log(proc.stderr, process.stderr);
	},
	startServer = n => {
		if ((n in config.server) && isLocal(config.server[n])) {
			server[n] = child_process.fork(path.join(__dirname, n + 'Server.js'), opt).on('exit', function (code, signal) {
				for (const m in servercbs[n]) {
					servercbs[n][m](n + ' server is stoped.\n');
				}
				startServer(n);
			}).on('message', function (msg) {
				if (servercbs[n] && (msg.id in servercbs[n])) {
					servercbs[n][msg.id](msg.data);
					delete servercbs[n][msg.id];
				}
			});
			servercbs[n] = { __proto__: null };
			watch(server[n], n);
		} else if (n in server) {
			delete server[n];
			delete servercbs[n];
			writeLog(process.stdout, n + ' server is stoped.', true);
		};
	},
	startApi = n => {
		if ((n in config.site) && config.site[n].api && isLocal(config.site[n].api.serv)) {
			api[n] = child_process.fork(path.join(__dirname, 'apihost.js'), [n], opt).on('exit', function (code, signal) {
				for (const m in apicbs[n]) {
					apicbs[n][m]('web server is stoped.\n');
				}
				startApi(n);
			}).on('message', function (msg) {
				if (apicbs[n] && (msg.id in apicbs[n])) {
					apicbs[n][msg.id](msg.data);
					delete apicbs[n][msg.id];
				}
			});
			apicbs[n] = { __proto__: null };
			watch(api[n], n);
		} else if (n in api) {
			delete api[n];
			delete apicbs[n];
			writeLog(process.stdout, n + ' api is stoped.', true);
		}
	},
	getSameItems = (arr1, arr2) => {
		const r = [];
		for (const i of arr1) {
			if (arr2.indexOf(i) >= 0) {
				r.push[i];
			}
		}
		return r;
	},
	startManager = err => {
		if (err) {
			writeLog(process.stdout, 'manager is stoped by error, restarting...', true);
		}
		manager.listen(config.manager.port);
	},
	errlog = process.stderr.write,
	outlog = process.stdout.write;
let logFile,
	config = require(cfg),
	cbid = 0,
	lastlog = '',
	manager = tls.createServer({
		key: config.site.defaultHost.certs.key,
		cert: config.site.defaultHost.certs.cert,
		SNICallback: function (host, cb) {
			cb(null, tls.createSecureContext(config.site[getSite(host)].certs || config.site.defaultHost.certs));
		}
	}, function (socket) {
		const rl = readline.createInterface({
			input: socket,
			output: socket,
			removeHistoryDuplicates: true
		}),
			tmo = setTimeout(function () {
				if (!socket.destroyed) {
					socket.end('time out\n');
				}
			}, 60 * 1000),
			waitForCommand = () => {
				if (!socket.destroyed) {
					rl.once('line', function (answer) {
						if (!socket.destroyed) {
							answer = answer.replace(/^\s+|\s+$/g, '');
							if (answer) {
								const c = answer.split(/\s/);
								if (c[0] === 'exit') {
									socket.end('bye\n');
								} else if (c[0] in commands) {
									const cmd = commands[c[0]];
									c.shift();
									cmd.apply(commands, c).then(function (result) {
										if (!socket.destroyed) {
											if (typeof result === 'string') {
												socket.write(result);
												waitForCommand();
											} else {
												result.on('end', waitForCommand).pipe(socket, {
													end: false
												});
											}
										}
									}, function (err) {
										if (!socket.destroyed) {
											socket.write(err.stack);
											waitForCommand();
										}
									});
								} else {
									socket.write('unknown command ' + c[0] + '\n');
									waitForCommand();
								}
							} else {
								waitForCommand();
							}
						}
					});
				}
			};
		socket.on('error', function () {
			this.destroy();
		}).write('please enter management password:\n');
		rl.once('line', function (answer) {
			if (answer === config.manager.password) {
				clearTimeout(tmo);
				if (!socket.destroyed) {
					for (const i of logs) {
						socket.write(i + '\n');
					}
					if (lastlog) {
						socket.write(lastlog);
					}
					sockets.push(socket);
				}
				waitForCommand();
			} else {
				socket.end('wrong password\n');
			}
		});
	}).on('listening', function () {
		writeLog(process.stdout, 'manager started.', true);
	}).on('error', function (err) {
		console.error(err.stack);
	}).on('close', startManager);
process.stderr.write = function () {
	logFile.write(arguments[0]);
	writeSocket(arguments[0]);
	return errlog.apply(this, arguments);
};
process.stdout.write = function () {
	logFile.write(arguments[0]);
	writeSocket(arguments[0]);
	return outlog.apply(this, arguments);
};
process.on('uncaughtException', function (err) {
	console.error(err.stack);
	process.exit();
}).on('unhandledRejection', function (reason, p) {
	console.error('Unhandled Rejection at:', p, 'reason:', reason);
	process.exit();
}).on('exit', function (code) {
	for (const n in server) {
		server[n].kill();
	}
	for (const n in api) {
		api[n].kill();
	}
}).title = 'fusion manager';
fs.mkdir('logs', {
	recursive: true
}, function () {
	logFile = fs.createWriteStream(path.join('logs', Date.now() + '.log'));
	for (const n in config.server) {
		startServer(n);
	}
	for (const n in config.site) {
		startApi(n);
	}
	startManager();
});