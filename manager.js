'use strict';
const fs = require('fs'),
	path = require('path'),
	cfg = path.join(__dirname, 'config.js'),
	tls = require('tls'),
	readline = require('readline'),
	child_process = require('child_process'),
	opt = {
		silent: true,
		windowsHide: true
	},
	api = {},
	server = {},
	isLocal = function (srv) {
		let t = typeof srv;
		return t === 'string' || t === 'number' || srv.host === '0.0.0.0' || srv.host === '127.0.0.1' || srv.host === 'localhost';
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
						output.write('[' + name + ']');
						if (last) {
							output.write(' ' + last);
						}
						output.write('\n');
						last = '';
					}
				}
			}).on('end', function () {
				if (last) {
					output.write('[' + name + '] ' + last + '\n');
				}
			}).setEncoding('utf8');
		};
		log(proc.stdout, process.stdout);
		log(proc.stderr, process.stderr);
	},
	startServer = function (n) {
		if (config.server.hasOwnProperty(n) && isLocal(config.server[n])) {
			server[n] = child_process.fork(path.join(__dirname, n + 'Server.js'), opt).on('exit', function (code, signal) {
				startServer(n);
			});
			watch(server[n], n)
		} else if (server.hasOwnProperty(n)) {
			delete server[n];
			console.log(n + ' server is stoped.');
		};
	},
	startApi = function (n) {
		if (config.site.hasOwnProperty(n) && config.site[n].api && isLocal(config.site[n].api.serv)) {
			api[n] = child_process.fork(path.join(__dirname, 'apihost.js'), [n], opt).on('exit', function (code, signal) {
				startApi(n);
			});
			watch(api[n], n);
		} else if (api.hasOwnProperty(n)) {
			delete api[n];
			console.log(n + ' api is stoped.');
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
			console.log('manager is stoped by error, restarting...');
		}
		manager.listen(config.manager.port);
	},
	commands = {
		reloadConfig: async function () {
			return new Promise(function (resolve, reject) {
				fs.readFile(cfg, {
					encoding: 'utf8'
				}, function (err, code) {
					let a = [],
						b = [],
						s = [],
						c = eval(code);
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
							server.web.send(c.site);
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
									api[n].send(r);
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
			});
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
			let type, name, r;
			if (arguments.length === 2) {
				type = arguments[0];
				name = arguments[1];
			} else {
				type = 'server';
				name = arguments[0];
			}
			if (type === 'server' || type === 'api') {
				let s = type === 'server' ? server : api;
				if (s.hasOwnProperty(name)) {
					s[name].kill();
					r = 'restarted ' + type + ' ' + name;
				} else {
					r = type + ' ' + name + ' is not running';
				}
			} else {
				r = 'unknown type';
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
							let f = path.join(__dirname, 'cache', file);
							fs.stat(f, function (err, stat) {
								if (err) {
									resolve(0);
								} else {
									if (stat.isDirectory()) {
										chkdir(file).then(resolve);
									} else {
										fs.stat(path.join(__dirname, 'static', file.replace(/.gz$/, '')), function (err, stat) {
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
							let p = path.join(__dirname, 'cache', dir);
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
		key: fs.readFileSync(path.join(__dirname, 'key.pem')),
		cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
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
				socket.write('please enter a command:\n');
				rl.once('line', function (answer) {
					answer = answer.replace(/^\s+|\s+$/g, '');
					if (answer) {
						let c = answer.split(/\s/);
						if (c[0] === 'exit') {
							socket.end('bye\n');
						} else if (commands.hasOwnProperty(c[0])) {
							let cmd = commands[c[0]];
							c.shift();
							cmd.apply(commands, c).then(function (result) {
								socket.write(result);
								waitForCommand();
							}, function (err) {
								socket.write(err.stack);
								waitForCommand();
							});
						} else {
							socket.write('unknown command ' + c[0] + '\n');
							waitForCommand();
						}
					} else {
						waitForCommand();
					}
				}).prompt();
			};
		socket.write('please enter management password:\n');
		rl.once('line', function (answer) {
			if (answer === config.manager.password) {
				clearTimeout(tmo);
				waitForCommand();
			} else {
				socket.end('wrong password\n');
			}
		}).prompt();
	}).on('listening', function () {
		console.log('manager started.');
	}).on('error', function (err) {
		console.error(err.stack);
	}).on('close', startManager);
let config = eval(fs.readFileSync(cfg, {
	encoding: 'utf8'
}));
process.title = 'fusion manager';
require('./jsex.js');
process.on('uncaughtException', function (err) {
	console.error(err.stack);
	process.exit();
}).on('unhandledRejection', function (reason, p) {
	console.error('Unhandled Rejection at:', p, 'reason:', reason);
	process.exit();
}).on('SIGINT', function () {
	console.log('bye');
	process.exit();
}).on('exit', function (code) {
	for (let n in server) {
		server[n].kill();
	}
	for (let n in api) {
		api[n].kill();
	}
});
for (let n in config.server) {
	startServer(n);
}
for (let n in config.site) {
	startApi(n);
}
startManager();