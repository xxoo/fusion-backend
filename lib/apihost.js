'use strict';
require('./globals.js');
const fs = require('fs'),
	net = require('net'),
	config = require('./config.js'),
	internals = ['securePath', 'serverRender', 'uploadStart', 'uploadEnd', 'pushResult', 'socketClosed'],
	start = { __proto__: null },
	stats = { __proto__: null },
	makeOps = (op, loop, n, idx, j) => {
		const makeOp = (r, i) => {
			if (op[i] === '!!key' + j) {
				r[i] = n;
			} else if (op[i] === '!!index' + j) {
				r[i] = idx;
			} else if (typeof op[i] === 'string' && RegExp('^!!value' + j + '(?:\\.|$)').test(op[i])) {
				const k = op[i].split('.');
				k[0] = n;
				r[i] = getDeepValue(loop, k);
			} else if (['Object', 'Array'].indexOf(dataType(op[i])) >= 0) {
				r[i] = makeOps(op[i], loop, n, idx, j);
			} else {
				r[i] = op[i];
			}
		};

		let r;
		if (Array.isArray(op)) {
			r = [];
			for (let i = 0; i < op.length; ++i) {
				makeOp(r, i);
			}
		} else {
			r = { __proto__: null };
			for (const i in op) {
				makeOp(r, i);
			}
		}
		return r;
	},
	getDeepValue = (v, a) => {
		let i = 0;
		while (v && i < a.length) {
			v = v[Array.isArray(v) && a[i][0] === '-' ? v.length + +a[i] : a[i]];
			++i;
		}
		return v;
	},
	procParams = (op, vars) => {
		const procParam = n => {
			const t = dataType(op[n]);
			if (t === 'string') {
				if (op[n].length > 1 && op[n][0] === '!' && op[n][1] !== '!') {
					op[n] = getDeepValue(vars, op[n].substr(1).split('.'));
				}
			} else if (['Object', 'Array'].indexOf(t) >= 0) {
				procParams(op[n], vars);
			}
		};

		if (Array.isArray(op)) {
			for (let n = 0; n < op.length; ++n) {
				procParam(n);
			}
		} else {
			for (const n in op) {
				procParam(n);
			}
		}
	},
	procLoop = (op, loop, j) => {
		const vreg = RegExp('^!!value' + j + '(?:\\.|$)'),
			k = '!key' + j,
			jj = j + 1;
		let ops, key;
		if (Array.isArray(loop[j]) && loop[j].length > 0) {
			if (typeof op[k] === 'string' && vreg.test(op[k])) {
				key = op[k].split('.');
				key.shift();
				ops = { __proto__: null };
			} else {
				ops = [];
			}
			delete op[k];
			for (let i = 0; i < loop[j].length; ++i) {
				let m;
				if (key) {
					m = getDeepValue(loop[j][i], key);
				} else {
					m = i;
				}
				const subop = makeOps(op, loop[j], i, i, j);
				ops[m] = jj < loop.length ? procLoop(subop, loop, jj) : subop;
			}
			return ops;
		} else if (dataType(loop[j]) === 'Object' && !isEmpty(loop[j])) {
			if (op[k] === '!!index' + j) {
				ops = [];
			} else {
				if (typeof op[k] === 'string' && vreg.test(op[k])) {
					key = op[k].split('.');
					key.shift();
				}
				ops = { __proto__: null };
			}
			delete op[k];
			let i = 0;
			for (const n in loop[j]) {
				let m;
				if (Array.isArray(ops)) {
					m = i;
				} else if (key) {
					m = getDeepValue(loop[j][n], key);
				} else {
					m = n;
				}
				const subop = makeOps(op, loop[j], n, i, j);
				ops[m] = jj < loop.length ? procLoop(subop, loop, jj) : subop;
				++i;
			}
			return ops;
		} else {
			return Error('empty_loop');
		}
	},
	makeCall = (auth, ops) => {
		const procOp = op => {
			const vars = op['!vars'];
			delete op['!vars'];
			if (dataType(vars) === 'Object') {
				return procOps(vars).then(result => {
					procParams(op, result);
					return procOp(op);
				});
			} else {
				const loop = op['!loop'];
				delete op['!loop'];
				if (Array.isArray(loop) && loop.length > 0) {
					return procOps(procLoop(op, loop, 0));
				} else if ('!api' in op) {
					const apiname = op['!api'],
						api = apis[apiname];
					if (typeof api === 'function') {
						if (internals.indexOf(apiname) < 0 || auth.internal) {
							delete op['!api'];
							delete auth.internal;
							++stats[apiname].active;
							return api(op, auth).catch(err => {
								if (dataType(err) === 'Error') {
									err.message = err.stack;
								} else {
									err = Error(err);
								}
								return err;
							}).then(result => {
								--stats[apiname].active;
								++stats[apiname].done;
								return result;
							});
						} else {
							return Error('forbidden');
						}
					} else {
						return Error('unsupported_api');
					}
				} else {
					return op;
				}
			}
		},
			procOps = async ops => {
				const t = dataType(ops);
				if (['Object', 'Array'].indexOf(t) >= 0) {
					if (t === 'Array' || !('!api' in ops)) {
						let results;
						if (t === 'Array') {
							results = [];
							for (const n of ops) {
								results.push(await procOps(n));
							}
						} else {
							results = { __proto__: null };
							for (const n in ops) {
								results[n] = await procOps(ops[n]);
							}
						}
						return results;
					} else {
						return procOp(ops);
					}
				} else {
					return ops;
				}
			};
		return procOps(ops);
	};
globalThis.site = process.argv[2];
globalThis.port = config.server.web;
globalThis.clients = { __proto__: null };
globalThis.pushMessage = (auth, data) => {
	if (web) {
		web.write(++pmid + '\n' + toJsex(auth) + '\n' + toJsex(data) + '\n');
		return pmid;
	}
};
let web,
	pmid = 0;
const apis = require('./apis/' + site);
for (const n in apis) {
	stats[n] = {
		active: 0,
		done: 0
	};
}
if (config.site[site].api.deps) {
	for (const n of config.site[site].api.deps) {
		if (n in config.server) {
			clients[n] = require('./' + n + 'Client.js');
			start[n] = clients[n].start;
			delete clients[n].start;
			start[n](config.server[n]);
		}
	}
}
if (process.stdin.isTTY) {
	const rl = require('readline').createInterface({
		input: process.stdin,
		output: process.stdout,
		removeHistoryDuplicates: true
	}),
		prompt = () => {
			if (auth) {
				console.log('please enter op data:');
				rl.once('line', function (answer) {
					const op = answer.parseJsex();
					if (op) {
						makeCall(auth, op.value).then(result => {
							console.log('cid: ' + auth.cid + '\nop result: ' + toJsex(result));
							auth = undefined;
							prompt();
						});
					} else {
						console.log('bad op data.');
						prompt();
					}
				}).prompt();
			} else {
				console.log('please enter auth data or cid:');
				rl.once('line', function (answer) {
					auth = answer.parseJsex();
					if (auth && dataType(auth.value) === 'Object') {
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
	let auth;
	console.log(`apihost started in testing mode for ${site}`);
	prompt();
} else {
	const startServer = err => {
		if (err) {
			console.log('apihost is stoped by error, restrting...');
		}
		if (typeof config.site[site].api.serv === 'string') {
			net.createConnection(config.site[site].api.serv, function () {
				this.end();
				console.log('apihost is already running. this instance will quit.');
				process.exit();
			}).on('error', function () {
				if (typeof config.site[site].api.serv === 'string') {
					fs.unlink(config.site[site].api.serv, () => server.listen(config.site[site].api.serv));
				} else {
					server.listen(config.site[site].api.serv);
				}
			});
		} else {
			server.listen(config.site[site].api.serv);
		}
	},
		statLog = m => {
			return `[${m}] ${stats[m].active} active, ${stats[m].done} done.\n`;
		},
		server = net.createServer(function (socket) {
			if (web) {
				socket.destroy();
			} else {
				let last = [''];
				web = socket;
				socket.on('error', function () {
					console.log('webserver connection lost');
					//this.destroy();
				}).once('close', function () {
					web = undefined;
				}).on('data', function (data) {
					data = data.split('\n');
					for (let i = 0; i < data.length; ++i) {
						const j = last.length - 1;
						last[j] += data[i];
						if (i < data.length - 1) {
							try {
								last[j] = Function('return ' + last[j])();
							} catch (e) {
								console.error(e);
								last[j] = '';
								break;
							}
							const t = dataType(last[j]);
							if ((j === 2 && ['Object', 'Array'].indexOf(t) >= 0) || (j === 1 && t === 'Object') || (!j && ['number', 'null'].indexOf(t) >= 0)) {
								if (j === 2) {
									const pms = makeCall(last[1], last[2]);
									if (last[0] !== null) {
										const k = last[0],
											auth = last[1];
										pms.then(result => {
											if (!socket.destroyed) {
												socket.write(k + '\n' + toJsex(auth.cid) + '\n' + toJsex(result) + '\n');
											}
										});
									}
									last = [''];
								} else {
									last[j + 1] = '';
								}
							} else {
								last[j] = '';
							}
						}
					}
				}).setEncoding('utf8');
			}
		}).on('listening', function () {
			console.log('apihost is started');
		}).on('error', function (err) {
			console.error(err.stack);
		}).once('close', startServer);
	process.on('message', function (msg) {
		if (msg.type === 'updateConfig') {
			let m;
			try {
				m = Function('return ' + msg.data)();
			} catch (e) {
				console.error(e);
			}
			if (dataType(m) === 'Object') {
				for (const n in m) {
					if (n in start) {
						start[n](m[n]);
					}
				}
			}
		} else if (msg.type === 'stats') {
			let s;
			if (msg.data in stats) {
				s = statLog(msg.data);
			} else {
				s = '';
				for (const m in stats) {
					s += statLog(m);
				}
			}
			process.send({
				id: msg.id,
				data: s
			});
		}
	}).title = 'fusion apihost - ' + site;
	startServer();
}