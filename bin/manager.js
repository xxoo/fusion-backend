'use strict';
const fs = require('fs'),
	path = require('path'),
	tls = require('tls'),
	readline = require('readline'),
	child_process = require('child_process'),
	cfg = require.resolve('./config.js');
require('./jsex.js');
try {
	fs.mkdirSync('logs');
} catch (e) {}
let config = require(cfg),
	cbid = 0,
	opt = {
		silent: true,
		windowsHide: true
	},
	errlog = process.stderr.write,
	outlog = process.stdout.write,
	logFile = fs.createWriteStream(path.join('logs', Date.now() + '.log')),
	lastlog = '',
	logs = [],
	sockets = [],
	api = {},
	server = {},
	apicbs = {},
	servercbs = {},
	getSite = function (d) {
		if (d) {
			return config.site.hasOwnProperty(d) ? d : getSite(d.replace(/[^\.]*\.?/, ''));
		} else {
			return 'defaultHost';
		}
	},
	isLocal = function (srv) {
		let t = typeof srv;
		return t === 'string' || t === 'number' || srv.host === '0.0.0.0' || srv.host === '127.0.0.1';
	},
	writeSocket = function (data) {
		let i = 0;
		while (i < sockets.length) {
			if (sockets[i].destroyed) {
				sockets.splice(i, 1);
			} else {
				sockets[i].write(data);
				i++;
			}
		}
	},
	writeLog = function (target, data, newline) {
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
	watch = function (proc, name) {
		let log = function (input, output) {
			let last = '';
			input.on('data', function (data) {
				let a = data.split('\n'),
					j = a.length - 1;
				for (let i = 0; i <= j; i++) {
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
	startServer = function (n) {
		if (config.server.hasOwnProperty(n) && isLocal(config.server[n])) {
			server[n] = child_process.fork(path.join(__dirname, n + 'Server.js'), opt).on('exit', function (code, signal) {
				for (let m in servercbs[n]) {
					servercbs[n][m](n + ' server is stoped.\n');
				}
				startServer(n);
			}).on('message', function (msg) {
				if (servercbs[n] && servercbs[n].hasOwnProperty(msg.id)) {
					servercbs[n][msg.id](msg.data);
					delete servercbs[n][msg.id];
				}
			});
			servercbs[n] = {};
			watch(server[n], n)
		} else if (server.hasOwnProperty(n)) {
			delete server[n];
			delete servercbs[n];
			writeLog(process.stdout, n + ' server is stoped.', true);
		};
	},
	startApi = function (n) {
		if (config.site.hasOwnProperty(n) && config.site[n].api && isLocal(config.site[n].api.serv)) {
			api[n] = child_process.fork(path.join(__dirname, 'apihost.js'), [n], opt).on('exit', function (code, signal) {
				for (let m in apicbs[n]) {
					apicbs[n][m]('web server is stoped.\n');
				}
				startApi(n);
			}).on('message', function (msg) {
				if (apicbs[n] && apicbs[n].hasOwnProperty(msg.id)) {
					apicbs[n][msg.id](msg.data);
					delete apicbs[n][msg.id];
				}
			});
			apicbs[n] = {};
			watch(api[n], n);
		} else if (api.hasOwnProperty(n)) {
			delete api[n];
			delete apicbs[n];
			writeLog(process.stdout, n + ' api is stoped.', true);
		}
	},
	getSameItems = function (arr1, arr2) {
		let r = [];
		for (let i = 0; i < arr1.length; i++) {
			if (arr2.indexOf(arr1[i]) >= 0) {
				r.push[arr1[i]];
			}
		}
		return r;
	},
	startManager = function (err) {
		if (err) {
			writeLog(process.stdout, 'manager is stoped by error, restarting...', true);
		}
		manager.listen(config.manager.port);
	},
	commands = {
		stats: async function (type, id, param) {
			return new Promise(function (resolve, reject) {
				let o, c;
				if (type === 'api') {
					o = api;
					c = apicbs;
				} else {
					type = 'server'
					o = server;
					c = servercbs;
				}
				if (o.hasOwnProperty(id)) {
					o[id].send({
						id: cbid,
						type: 'stats',
						data: param
					});
					c[id][cbid++] = resolve;
				} else {
					resolve(`${id} ${type} is not running.`);
				}
			});
		},
		reloadConfig: async function () {
			return new Promise(function (resolve, reject) {
				delete require.cache[cfg];
				let c = require(cfg),
					a = [],
					b = [],
					s = [];
				for (let n in c.server) {
					if (!isEqual(c.server[n], config.server[n])) {
						if (server.hasOwnProperty(n)) {
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
				for (let n in c.site) {
					if (api.hasOwnProperty(n)) {
						if (!config.site.hasOwnProperty(n) || !isEqual(c.site[n].api, config.site[n].api)) {
							api[n].kill();
						} else if (c.site[n].api.deps) {
							let r = {},
								d = getSameItems(c.site[n].api.deps, s);
							if (d.length) {
								for (let i = 0; i < d.length; i++) {
									r[d[i]] = c.server[d[i]];
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
				for (let n in config.server) {
					if (server[n]) {
						server[n].kill();
					}
				}
				for (let n in config.site) {
					if (api[n]) {
						api[n].kill();
					}
				}
				config = c;
				for (let i = 0; i < a.length; i++) {
					startServer(a[i]);
				}
				for (let i = 0; i < b.length; i++) {
					startApi(b[i]);
				}
				resolve('new config loaded\n');
			});
		},
		showlog: async function (name) {
			return new Promise(function (resolve, reject) {
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
								let m = item.match(/^(\d+)\.log$/);
								if (m) {
									r += m[1] + '\n';
								}
							});
							resolve(r);
						}
					});
				}
			})
		},
		list: async function () {
			let s = 'running server:';
			for (let n in server) {
				s += ' ' + n;
			}
			s += '\nrunning api:';
			for (let n in api) {
				s += ' ' + n;
			}
			return Promise.resolve(s + '\n');
		},
		restart: async function () {
			let types = ['all', 'server', 'api', 'manager'],
				type = arguments[0],
				r;
			if (types.indexOf(type) < 0) {
				r = 'unknown type';
			} else if (type === 'manager') {
				process.exit();
				r = 'restarting self, please reconnect later';
			} else {
				let s, names;
				r = '';
				if (type === 'all') {
					s = arguments[1] === 'server' ? server : api;
					names = Object.keys(s);
				} else {
					s = type === 'server' ? server : api;
					names = Array.prototype.slice.call(arguments, 1);
				}
				names.forEach(function (item) {
					if (s.hasOwnProperty(item)) {
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
			return Promise.resolve(r + '\n');
		},
		cleanUpCache: async function () {
			return new Promise(function (resolve, reject) {
				let d = 0,
					f = 0,
					del = async function (p, dir) {
						return new Promise(function (resolve, reject) {
							let rm = dir ? fs.rmdir : fs.unlink;
							rm(p, function (err) {
								if (err) {
									resolve(0);
								} else {
									dir ? d++ : f++;
									resolve(1);
								}
							});
						});
					},
					chkfile = async function (file) {
						return new Promise(function (resolve, reject) {
							let f = path.join('cache', file);
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
						});
					},
					chkdir = async function (dir) {
						return new Promise(function (resolve, reject) {
							let p = path.join('cache', dir);
							fs.readdir(p, function (err, files) {
								if (err) {
									resolve(0);
								} else {
									if (files.length) {
										let ps = [];
										files.forEach(function (file) {
											let f = path.join(dir, file);
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
					};
				chkdir('').then(function () {
					resolve('totally removed ' + d + ' dirs and ' + f + ' files.\n');
				});
			});
		},
		help: async function () {
			return Promise.resolve('available commands: ' + Object.keys(commands).join(' ') + ' exit\n');
		}
	},
	manager = tls.createServer({
		key: config.site.defaultHost.certs.key,
		cert: config.site.defaultHost.certs.cert,
		SNICallback: function (host, cb) {
			cb(null, tls.createSecureContext(config.site[getSite(host)].certs));
		}
	}, function (socket) {
		let rl = readline.createInterface({
				input: socket,
				output: socket,
				removeHistoryDuplicates: true
			}),
			tmo = setTimeout(function () {
				if (!socket.destroyed) {
					socket.end('time out\n');
				}
			}, 60 * 1000),
			waitForCommand = function () {
				if (!socket.destroyed) {
					rl.once('line', function (answer) {
						if (!socket.destroyed) {
							answer = answer.replace(/^\s+|\s+$/g, '');
							if (answer) {
								let c = answer.split(/\s/);
								if (c[0] === 'exit') {
									socket.end('bye\n');
								} else if (commands.hasOwnProperty(c[0])) {
									let cmd = commands[c[0]];
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
			this.destory();
		}).write('please enter management password:\n');
		rl.once('line', function (answer) {
			if (answer === config.manager.password) {
				clearTimeout(tmo);
				if (!socket.destroyed) {
					for (let i = 0; i < logs.length; i++) {
						socket.write(logs[i] + '\n');
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
	for (let n in server) {
		server[n].kill();
	}
	for (let n in api) {
		api[n].kill();
	}
}).title = 'fusion manager';
for (let n in config.server) {
	startServer(n);
}
for (let n in config.site) {
	startApi(n);
}
startManager();