'use strict';
const fs = require('fs'),
	path = require('path'),
	config = eval(fs.readFileSync(path.join(__dirname, 'config.js'), {
		encoding: 'utf8'
	})),
	setConfig = {},
	site = process.argv[2],
	net = require('net'),
	apis = require('./apis/' + site),
	vreg = /^!value(?:\.|$)/,
	procOp = function (auth, op, callback) {
		const api = apis[op['!api']],
			vars = op['!vars'];
		if (dataType(vars) === 'object') {
			delete op['!vars'];
			procOps(auth, vars, function (result) {
				varsDone(auth, result, op, callback);
			});
		} else if (typeof api === 'function') {
			delete op['!api'];
			api(op, auth).then(callback, function (err) {
				if (dataType(err) === 'error') {
					err.message = err.stack;
				}
				callback(err);
			});
		} else {
			callback(op);
		}
	},
	procOps = function (auth, ops, callback) {
		let l, i,
			results = dataType(ops),
			j = 0,
			proc = function (i) {
				procOp(auth, ops[i], function (result) {
					results[i] = result;
					j++;
					if (j === l) {
						callback(results);
					}
				});
			};
		if (results === 'array') {
			results = [];
			l = ops.length;
			if (l > 0) {
				for (i = 0; i < l; i++) {
					proc(i);
				}
			} else {
				callback(results);
			}
		} else if (results === 'object') {
			results = {};
			l = Object.keys(ops).length;
			if (l > 0) {
				for (i in ops) {
					proc(i);
				}
			} else {
				callback(results);
			}
		} else {
			callback(ops);
		}
	},
	varsDone = function (auth, vars, op, callback) {
		let loop, ops, key, m, n, i;
		procParams(op, vars);
		loop = op['!loop'];
		i = dataType(loop);
		delete op['!loop'];
		if (i === 'array') {
			if (typeof op['!key'] === 'string' && vreg.test(op['!key'])) {
				key = op['!key'].split('.');
				key.shift();
				ops = {};
			} else {
				ops = [];
			}
			delete op['!key'];
			for (i = 0; i < loop.length; i++) {
				if (key) {
					m = getDeepValue(loop[i], key);
				} else {
					m = i;
				}
				makeOps(ops, m, op, loop, i, i);
			}
			procOps(auth, ops, callback);
		} else if (i === 'object') {
			if (op['!key'] === '!index') {
				ops = [];
			} else {
				if (typeof op['!key'] === 'string' && vreg.test(op['!key'])) {
					key = op['!key'].split('.');
					key.shift();
				}
				ops = {};
			}
			delete op['!key'];
			i = 0;
			for (n in loop) {
				if (dataType(ops) === 'array') {
					m = i;
				} else if (key) {
					m = getDeepValue(loop[n], key);
				} else {
					m = n;
				}
				if (makeOps(ops, m, op, loop, n, i)) {
					i++;
				}
			}
			procOps(auth, ops, callback);
		} else {
			procOp(auth, op, callback);
		}
	},
	makeOps = function (ops, m, op, loop, n, idx) {
		let i;
		if (!ops.hasOwnProperty(m)) {
			if (dataType(op) === 'array') {
				ops[m] = [];
				for (i = 0; i < op.length; i++) {
					makeOp(ops, m, op, loop, n, idx, i);
				}
			} else {
				ops[m] = {};
				for (i in op) {
					makeOp(ops, m, op, loop, n, idx, i);
				}
			}
			return true;
		}
	},
	makeOp = function (ops, m, op, loop, n, idx, i) {
		let k = dataType(op[i]);
		if (op[i] === '!key') {
			ops[m][i] = n;
		} else if (op[i] === '!index') {
			ops[m][i] = idx;
		} else if (typeof op[i] === 'string' && vreg.test(op[i])) {
			k = op[i].split('.');
			k[0] = n;
			ops[m][i] = getDeepValue(loop, k);
		} else if (k === 'array' || k === 'object') {
			makeOps(ops[m], i, op[i], loop, n, idx);
		} else {
			ops[m][i] = op[i];
		}
	},
	getDeepValue = function (v, a) {
		let i = 0;
		while (v && i < a.length) {
			v = v[a[i]];
			i++;
		}
		return v;
	},
	procParams = function (op, vars) {
		let n;
		if (dataType(op) === 'array') {
			for (n = 0; n < op.length; n++) {
				procParam(op, vars, n);
			}
		} else {
			for (n in op) {
				procParam(op, vars, n);
			}
		}
	},
	procParam = function (op, vars, n) {
		const t = dataType(op[n]);
		if (t === 'string') {
			if (op[n][0] === '!' && op[n] !== '!index' && op !== '!key' && !vreg.test(op[n])) {
				op[n] = getDeepValue(vars, op[n].substr(1).split('.'));
			}
		} else if (t === 'array' || t === 'object') {
			procParams(op[n], vars);
		}
	},
	makeCall = function (auth, op, callback) {
		let t = dataType(op);
		if (t === 'array' || t === 'object') {
			if (t === 'array' || !op.hasOwnProperty('!api')) {
				procOps(auth, op, callback);
			} else {
				procOp(auth, op, callback);
			}
		} else {
			callback(op);
		}
	};
process.title = 'fusion apihost - ' + site;
require('./jsex.js');
if (process.stdin.isTTY) {
	let auth,
		rl = require('readline').createInterface({
			input: process.stdin,
			output: process.stdout,
			removeHistoryDuplicates: true
		}),
		callback = function (result) {
			console.log('cid: ' + auth.cid + '\nop result: ' + toJsex(result));
			auth = undefined;
			prompt();
		},
		prompt = function () {
			if (auth) {
				console.log('please enter op data:');
				rl.once('line', function (answer) {
					let op = answer.parseJsex();
					if (op) {
						makeCall(auth, op.value, callback);
					} else {
						console.log('bad op data.');
						prompt();
					}
				}).prompt();
			} else {
				console.log('please enter auth data or cid:');
				rl.once('line', function (answer) {
					auth = answer.parseJsex();
					if (auth && dataType(auth.value) === 'object') {
						auth = auth.value;
						console.log('auth data received.');
					} else {
						auth = {
							host: site,
							ip: '::1',
							agent: 'console',
							cid: answer
						};
						console.log('auth data constructed from cid.');
					}
					prompt();
				}).prompt();
			}
		};
	console.log(`apihost started in testing mode for ${site}`);
	prompt();
} else {
	let startServer = function (err) {
			if (err) {
				console.log('server is stoped by error, restrting...');
			}
			if (typeof config.site[site].api.serv === 'string') {
				net.createConnection(config.site[site].api.serv, function () {
					this.end();
					console.log('server is already running. this instance will quit.');
					process.exit();
				}).on('error', function () {
					if (typeof config.site[site].api.serv === 'string') {
						fs.unlink(config.site[site].api.serv, function () {
							server.listen(config.site[site].api.serv);
						});
					} else {
						server.listen(config.site[site].api.serv);
					}
				});
			} else {
				server.listen(config.site[site].api.serv);
			}
		},
		server = net.createServer(function (socket) {
			let last = [''],
				callapi = function (i, auth, op) {
					makeCall(auth, op, function (result) {
						if (!socket.destroyed) {
							socket.write(i + '\n' + toJsex(auth.cid) + '\n' + toJsex(result) + '\n');
						}
					});
				};
			socket.on('data', function (data) {
				data = data.split('\n');
				for (let i = 0; i < data.length; i++) {
					let j = last.length - 1;
					last[j] += data[i];
					if (i < data.length - 1) {
						last[j] = last[j].parseJsex();
						if (last[j]) {
							let t = dataType(last[j].value);
							if ((j === 2 && t === 'object' || t === 'array') || (j === 1 && t === 'object') || (!j && t === 'number')) {
								last[j] = last[j].value;
								if (j === 2) {
									callapi(last[0], last[1], last[2]);
									last = [''];
								} else {
									last[j + 1] = '';
								}
							} else {
								last[j] = '';
							}
						} else {
							last[j] = '';
						}
					}
				}
			}).setEncoding('utf8');
		}).on('listening', function () {
			console.log('server is started');
		}).on('error', function (err) {
			console.error(err.stack);
		}).on('close', startServer);
	process.on('message', function (msg) {
		for (let n in msg) {
			if (setConfig[n]) {
				setConfig[n](msg[n]);
			}
		}
	});
	startServer();
}
global.clients = {};
if (config.site[site].api.deps) {
	for (let i = 0; i < config.site[site].api.deps.length; i++) {
		let n = config.site[site].api.deps[i];
		if (config.server.hasOwnProperty(n)) {
			clients[n] = require('./' + n + 'Client.js');
			setConfig[n] = clients[n].setConfig;
			delete clients[n].setConfig;
			setConfig[n](config.server[n]);
		}
	}
}