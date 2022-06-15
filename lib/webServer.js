'use strict';
require('./globals.js');
let apiid = 0;
const fs = require('fs'),
	path = require('path'),
	stream = require('stream'),
	zlib = require('zlib'),
	http = require('http'),
	https = require('https'),
	http2 = require('http2'),
	net = require('net'),
	tls = require('tls'),
	ws = require('ws'),
	mime = require('mime'),
	config = require('./config.js'),
	apis = { __proto__: null },
	compressing = { __proto__: null },
	uploading = { __proto__: null },
	stats = { __proto__: null },
	makeStat = n => {
		const p = ['other', 'ws', 'GET', 'POST', 'HEAD', 'OPTIONS'];
		stats[n] = { __proto__: null };
		for (let i = 0; i < p.length; ++i) {
			stats[n][p[i]] = {
				__proto__: null,
				active: 0,
				done: 0
			};
		}
	},
	statLog = m => {
		let s = '[' + m + ']';
		for (const n in stats[m]) {
			s += ` ${n}: ${stats[m][n].active} active, ${stats[m][n].done} done;`;
		}
		return s + '\n';
	},
	chkEnc = r => {
		const s = ['gzip', 'deflate'];
		if (r) {
			r = r.split(', ');
			for (let i = 0; i < s.length; ++i) {
				if (r.indexOf(s[i]) >= 0) {
					return s[i];
				}
			}
		}
	},
	makeEnc = r => {
		if (r) {
			return {
				gzip: zlib.createGzip,
				deflate: zlib.createDeflate
			}[r]({
				level: 9,
				memLevel: 9
			});
		}
	},
	getSite = d => {
		if (d) {
			return (d in config.site) ? d : getSite(d.replace(/[^\.]*\.?/, ''));
		} else {
			return 'defaultHost';
		}
	},
	getHost = req => {
		const r = req.headers[req.httpVersion >= 2 ? ':authority' : 'host'];
		return r ? r.replace(/:\d+$/, '') : '';
	},
	getCid = cookie => {
		let cid;
		if (cookie) {
			cid = cookie.match(/(?:^|; ?)cid=([^;]+)/);
			cid = cid ? decodeURIComponent(cid[1]) : '';
		} else {
			cid = '';
		}
		return cid;
	},
	originHost = origin => origin.replace(/^[^:]+:\/\/|:[\d]+$/g, ''),
	chkOH = (reg, oh, host) => {
		const d = dataType(reg);
		if (d === 'RegExp') {
			return reg.test(oh);
		} else if (d === 'Array') {
			for (const i of reg) {
				if (chkOH(i, oh)) {
					return true;
				}
			}
			return false;
		} else if (d === 'string') {
			return reg === oh;
		} else {
			return oh === host;
		}
	},
	loadApi = site => {
		if (apis[site]) {
			const err = Error('api_server_connection_lost');
			for (const n in apis[site].cbs) {
				apis[site].cbs[n]('', err);
			}
			for (const n in apis[site].sockets) {
				apis[site].sockets[n].close();
			}
			delete apis[site];
			console.log(`connection of ${site} closed. reconnecting...`);
		}
		if (config.site[site].api) {
			let last = [''];
			net.createConnection(config.site[site].api.serv, function () {
				console.log(`connected to ${site}.`);
				apis[site] = {
					__proto__: null,
					client: this,
					cbs: { __proto__: null },
					sockets: { __proto__: null }
				};
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
						if (j === 2) {
							if (typeof last[0] === 'number') {
								const t1 = dataType(last[1]);
								if (last[1] === null || t1 === 'string') {
									if (last[0] in apis[site].cbs) {
										apis[site].cbs[last[0]](last[1], last[2]);
										delete apis[site].cbs[last[0]];
									} else {
										console.log('unknown response:', last[0], last[1], last[2]);
									}
								} else if (t1 === 'Object') {
									if (last[1].type === 'push') {
										let result;
										if (last[1].skid in apis[site].sockets) {
											if (typeof last[2] === 'number') {
												apis[site].sockets[last[1].skid].close(last[2]);
											} else {
												apis[site].sockets[last[1].skid].send('push\n' + last[1].cid + '\n' + toJsex(last[2]));
											}
										} else {
											result = Error('socket_closed');
										}
										this.write(last[0] + '\n"push"\n' + toJsex(result) + '\n');
									} else {
										//console.log('last0', last[0], last[1], last[2]);
										if (last[1].skid in apis[site].sockets) {
											apis[site].sockets[last[1].skid].send('q' + last[0] + '\n' + last[1].cid + '\n' + toJsex(last[2]));
										} else {
											this.write(last[0] + '\n' + last[1].skid + '\nError("socket_closed")\n');
										}
									}
								}
							}
							last = [''];
						} else {
							last[j + 1] = '';
						}
					}
				}
			}).once('close', loadApi.bind(this, site)).on('error', function (err) {
				if (apis[site]) {
					console.error(err.stack);
				}
			}).setEncoding('utf8');
		} else {
			console.log(`api config for ${site} is gone.`);
		}
	},
	callapi = (site, auth, op, cb) => {
		if (apis[site]) {
			apis[site].client.write(apiid + '\n' + toJsex(auth) + '\n' + toJsex(op) + '\n');
			apis[site].cbs[apiid++] = cb;
		} else {
			cb('', Error('not_connected_to_api_server'));
		}
	},
	startServer = err => {
		if (err) {
			console.log('server is stoped by error. restarting...');
		}
		server.listen(config.server.web);
	},
	findproxy = (url, proxy) => {
		if (proxy) {
			for (const n in proxy) {
				if (typeof proxy[n] === 'string') {
					if (url.length >= proxy[n] && url.substring(0, proxy[n].length) === proxy[n]) {
						return parseServer(n);
					}
				} else if (proxy[n].test(url)) {
					return parseServer(n);
				}
			}
		}
	},
	parseServer = str => {
		const r = str.match(/^http(s?):\/\/([^\/:]+)(?::(\d+))?$/);
		if (r) {
			delete r.index;
			delete r.source;
			r.shift();
			r[2] = r[2] ? parseInt(r[2]) : r[0] ? 443 : 80;
			r[0] = r[0] ? https : http;
		}
		return r;
	},
	server = http2.createSecureServer({
		allowHTTP1: true,
		key: config.site.defaultHost.certs.key,
		cert: config.site.defaultHost.certs.cert,
		SNICallback: function (host, cb) {
			cb(null, tls.createSecureContext(config.site[getSite(host)].certs || config.site.defaultHost.certs));
		}
	}, function (req, res) {
		const host = getHost(req),
			site = getSite(host),
			cfg = config.site[site],
			proxy = findproxy(req.url, cfg.forward),
			reqtype = (req.method in stats[site]) ? req.method : 'other';
		++stats[site][reqtype].active;
		res.once('close', function () {
			--stats[site][reqtype].active;
			++stats[site][reqtype].done;
		});
		if (proxy) {
			const req2 = proxy[0].request({
				host: proxy[1],
				port: proxy[2],
				path: req.url,
				method: req.method,
				setHost: false,
				headers: {
					host: host,
					'x-forwarded-for': ('x-forwarded-for' in req.headers) ? req.headers['x-forwarded-for'] + ', ' + req.socket.remoteAddress : req.socket.remoteAddress
				}
			}, function (res2) {
				if (res2.headers['access-control-allow-origin'] === 'http' + (proxy[0] === https ? 's' : '') + '://' + host + (proxy[3] == 443 ? '' : ':' + proxy[3])) {
					res2.headers['access-control-allow-origin'] = res2.headers['access-control-allow-origin'].replace(/(:\d+)?$/, config.server.web == 443 ? '' : config.server.web);
				}
				res.writeHead(res2.statusCode, res2.headers);
				res2.pipe(res);
			}).on('error', function (err) {
				if (!res.headersSent) {
					res.writeHead(502);
				}
				res.end();
			});
			for (const n in req.headers) {
				if (n === 'referer' || n === 'origin') {
					let v = req.headers[n],
						oh = 'https://' + host + (config.server.web == 443 ? '' : ':' + config.server.web);
					if (v === oh || (v.length > oh.length && v.substring(0, oh.length + 1) === oh + '/')) {
						v = 'http' + (proxy[0] === https ? 's' : '') + '://' + host + (proxy[3] == 443 ? '' : ':' + proxy[3]) + v.substring(oh.length);
					}
					req2.setHeader(n, v);
				} else if (['host', 'connection', ':method', ':scheme', ':authority', ':path'].indexOf(n) < 0) {
					req2.setHeader(n, req.headers[n]);
				}
			}
			req.pipe(req2);
		} else {
			const hd = {
				vary: 'origin'
			};
			let url = req.url.match(/^(\/[^?]*)(\?.*)?$/);
			if (!url) {
				res.writeHead(400, hd);
				res.end();
			} else if (req.headers.origin && !chkOH(cfg.origin, originHost(req.headers.origin), host)) {
				res.writeHead(403, hd);
				res.end();
			} else {
				let p = path.posix.normalize(url[1]);
				url = p + (url[2] || '');
				const auth = {
					cid: getCid(req.headers.cookie),
					host: host,
					agent: req.headers['user-agent'],
					ip: req.socket.address().address
				},
					sendCid = cid => {
						if (cid) {
							hd['set-cookie'] = 'cid=' + encodeURIComponent(cid) + (cfg.cookieRefix ? cfg.cookieRefix : '');
						}
					};
				if (req.headers.origin) {
					hd['access-control-allow-origin'] = req.headers.origin;
				}
				if (reqtype === 'GET' || reqtype === 'HEAD') {
					if (cfg.serverRender && cfg.serverRender.test(url)) {
						auth.internal = true;
						callapi(site, auth, {
							'!api': 'serverRender',
							url: url
						}, (cid, result) => {
							auth.cid = cid;
							if (res.writable && !res.writableEnded) {
								sendCid(cid);
								if (dataType(result) === 'Error') {
									hd['content-type'] = 'text/plain;charset=utf-8';
									res.writeHead(500, hd);
									res.end(reqtype === 'GET' ? result.message : '');
								} else {
									for (const n in result.head) {
										hd[n] = result.head[n];
									}
									if (reqtype === 'GET') {
										const v = chkEnc(req.headers['accept-encoding']);
										if (v) {
											result.data = Buffer.from(result.data || '', result.encoding || 'utf8');
											if ((cfg.zLen || config.site.defaultHost.zLen) < result.data.length) {
												hd['content-encoding'] = v;
												res.writeHead(result.status, hd);
												v = makeEnc(v);
												v.pipe(res);
												v.end(result.data);
											} else {
												res.writeHead(result.status, hd);
												res.end(result.data);
											}
										} else {
											res.writeHead(result.status, hd);
											res.end(result.data);
										}
									} else {
										res.writeHead(result.status, hd);
										res.end();
									}
								}
							}
						});
					} else {
						const procStaticFile = () => {
							const c = path.join('cache', site, p.substring(1) + '.gz'),
								sendFile = (p, stat, start, end) => {
									if (res.writable && !res.writableEnded) {
										if (start === undefined || start < 0) {
											start = 0;
										} else if (start >= stat.size) {
											start = stat.size - 1;
										}
										if (end === undefined || end >= stat.size) {
											end = stat.size - 1;
										} else if (end < 0) {
											end = 0;
										}
										if (end < start) {
											end = start;
										}
										hd['content-length'] = end - start + 1;
										if (start > 0 || end < stat.size - 1) {
											hd['content-range'] = 'bytes=' + start + '-' + end + '/' + stat.size;
											res.writeHead(206, hd);
										} else {
											res.writeHead(200, hd);
										}
										if (reqtype === 'GET') {
											fs.createReadStream(p, {
												start: start,
												end: end
											}).pipe(res);
										} else {
											res.end();
										}
									}
								},
								checkRange = (p, stat) => {
									if (req.headers.range) {
										let d = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
										if (d) {
											if (!d[1]) {
												d[1] = 0;
											}
											if (d[2]) {
												sendFile(p, stat, d[1] | 0, d[2] | 0);
											} else {
												sendFile(p, stat, d[1] | 0);
											}
										} else {
											sendFile(p, stat);
										}
									} else {
										sendFile(p, stat);
									}
								},
								compress = (p, t, c) => {
									if (res.writable && !res.writableEnded) {
										res.writeHead(200, hd);
										if (reqtype === 'GET') {
											let enc = makeEnc('gzip');
											fs.createReadStream(p).pipe(enc).pipe(res);
											if (c && !(c in compressing)) {
												compressing[c] = fs.createWriteStream(c).once('close', function () {
													t = new Date(t);
													fs.utimes(c, t, t, err => delete compressing[c]);
												});
												enc.pipe(compressing[c]);
											}
										} else {
											res.end();
										}
									}
								};
							p = path.join('static', site, p.substring(1));
							fs.stat(p, (err, stat) => {
								if (res.writable && !res.writableEnded) {
									if (err) {
										res.writeHead(404, hd);
										res.end();
									} else if (stat.isDirectory()) {
										hd.location = req.url.replace(/(\?.*)?$/, '/$1');
										res.writeHead(302, hd);
										res.end();
									} else {
										const t = Math.floor(Math.max(stat.mtimeMs, stat.ctimeMs) / 1000) * 1000;
										if (req.headers['if-modified-since'] && t === new Date(req.headers['if-modified-since']).getTime()) {
											res.writeHead(304, hd);
											res.end();
										} else {
											hd['last-modified'] = new Date(t).toUTCString();
											hd['cache-control'] = 'must-revalidate';
											hd['content-type'] = mime.getType(p) || 'application/octet-stream';
											if (chkEnc(req.headers['accept-encoding']) === 'gzip') {
												hd['content-encoding'] = 'gzip';
												fs.stat(c, (err, stat2) => {
													if (res.writable && !res.writableEnded) {
														if (err) {
															fs.mkdir(path.dirname(c), {
																recursive: true
															}, err => compress(p, t, err ? null : c));
														} else if (stat2.isDirectory()) {
															fs.rm(c, {
																recursive: true
															}, err => compress(p, t, err ? null : c));
														} else {
															if (stat2.mtimeMs === t) {
																checkRange(c, stat2);
															} else {
																compress(p, t, c);
															}
														}
													}
												});
											} else {
												checkRange(p, stat);
											}
										}
									}
								}
							});
						};
						if (p[p.length - 1] === '/') {
							p += cfg.index || config.site.defaultHost.index;
						}
						if (cfg.securePath && cfg.securePath.test(p)) {
							auth.internal = true;
							callapi(site, auth, {
								'!api': 'securePath',
								path: p
							}, (cid, result) => {
								auth.cid = cid;
								if (res.writable && !res.writableEnded) {
									sendCid(cid);
									if (dataType(result) === 'Error') {
										res.writeHead(401, hd);
										if (reqtype === 'GET') {
											res.end(result.message);
										} else {
											res.end();
										}
									} else {
										procStaticFile();
									}
								}
							});
						} else {
							procStaticFile();
						}
					}
				} else if (reqtype === 'POST') {
					if (apis[site]) {
						const cl = req.headers['content-length'] | 0,
							sendResult = (cid, result) => {
								auth.cid = cid;
								if (res.writable && !res.writableEnded) {
									let txtEnc, status,
										v = chkEnc(req.headers['accept-encoding']);
									if (cid === null) {//cid = null means restfulApi
										if (dataType(result) === 'Object') {
											txtEnc = result.encoding || 'utf8';
											status = result.status || 200;
											for (const n in result.head) {
												hd[n] = result.head[n];
											}
											result = result.data || '';
										} else {
											txtEnc = 'utf8';
											status = 500;
											hd['content-type'] = 'text/plain;chatset=utf-8';
											result = String(result);
										}
									} else {
										txtEnc = 'utf8';
										status = 200;
										hd['content-type'] = 'text/jsex;charset=utf-8';
										sendCid(cid);
										result = toJsex(result);
									}
									if (v) {
										result = Buffer.from(result, txtEnc);
										if ((cfg.zLen || config.site.defaultHost.zLen) < result.length) {
											hd['content-encoding'] = v;
											res.writeHead(status, hd);
											v = makeEnc(v);
											v.pipe(res);
											v.end(result);
										} else {
											res.writeHead(status, hd);
											res.end(result);
										}
									} else {
										res.writeHead(status, hd);
										res.end(result, txtEnc);
									}
								}
							};
						if (p === '/') {
							if (cl <= 0) {
								res.writeHead(411, hd);
								res.end();
							} else if (cl > (cfg.postLen || config.site.defaultHost.postLen)) {
								res.writeHead(413, hd);
								res.end();
							} else {
								const bf = Buffer.alloc(cl);
								let i = 0;
								req.on('data', function (data) {
									if (i + data.length > cl) {
										this.off('data').off('end');
										res.writeHead(400, hd);
										res.end();
									} else {
										data.copy(bf, i, 0, data.length);
									}
									i += data.length;
								}).once('end', function () {
									let v;
									if (i === cl) {
										v = bf.toString('utf8', 0, i).parseJsex();
									}
									if (v) {
										callapi(site, auth, v.value, sendResult);
									} else if (res.writable && !res.writableEnded) {
										res.writeHead(400, hd);
										res.end();
									}
								});
							}
						} else if (cfg.restfulApi && p in cfg.restfulApi) {
							if (cl < 0) {
								res.writeHead(411, hd);
								res.end();
							} else if (cl > (cfg.postLen || config.site.defaultHost.postLen)) {
								res.writeHead(413, hd);
								res.end();
							} else {
								const bf = Buffer.alloc(cl);
								let i = 0;
								req.on('data', function (data) {
									if (i + data.length > cl) {
										this.off('data').off('end');
										res.writeHead(400, hd);
										res.end();
									} else {
										data.copy(bf, i, 0, data.length);
									}
									i += data.length;
								}).once('end', function () {
									let v;
									if (i === cl) {
										auth.internal = true;
										callapi(site, auth, {
											'!api': 'restfulApi',
											encoding: cfg.restfulApi[p],
											data: bf.toString(cfg.restfulApi[p], 0, i),
											url: url
										}, sendResult);
									} else if (res.writable && !res.writableEnded) {
										res.writeHead(400, hd);
										res.end();
									}
								});
							}
						} else {
							if (cl > 0) {
								let c, token, i = 0,
									uploadEnd = () => {
										callapi(site, auth, {
											'!api': 'uploadEnd',
											filename: c,
											token: token,
											success: i === cl
										}, (cid, result) => {
											delete uploading[c];
											sendResult(cid, result);
										});
									};
								auth.internal = true;
								while (!c || uploading[c]) {
									c = Date.now().toString(36) + Math.random().toString(36).substring(1);
								}
								uploading[c] = fs.createWriteStream(path.join('uploading', c));
								stream.pipeline(req, new stream.Transform({
									transform: function (chunk, encoding, next) {
										i += chunk.length;
										if (i > cl) {
											req.destroy();
										} else {
											this.push(chunk);
											next();
										}
									}
								}), uploading[c], err => {
									if (err) {
										fs.unlink(uploading[c].path, () => { });
										delete uploading[c];
										res.destroy();
									} else if (token) {
										uploadEnd();
									}
								});
								callapi(site, auth, {
									'!api': 'uploadStart',
									path: p,
									length: cl
								}, (cid, result) => {
									if (dataType(result) !== 'Error') {
										auth.cid = cid;
										token = result;
										if (uploading[c].closed) {
											uploadEnd();
										}
									} else if (req.readable && !req.readableEnded) {
										auth.cid = cid;
										req.destroy();
									} else {
										fs.unlink(uploading[c].path, () => { });
										delete uploading[c];
										sendResult(cid, result);
									}
								});
							} else {
								res.writeHead(411, hd);
								res.end();
							}
						}
					} else {
						res.writeHead(403, hd);
						res.end();
					}
				} else if (reqtype === 'OPTIONS') {
					hd['access-control-allow-methods'] = 'POST, GET, HEAD, OPTIONS';
					res.writeHead(200, hd);
					res.end();
				} else {
					res.writeHead(405, hd);
					res.end();
				}
			}
		}
	}).on('error', function (err) {
		console.error(err.stack);
		if (err.code === 'EADDRINUSE') {
			process.exit();
		}
	}).on('listening', function () {
		console.log('server is started');
	}).on('closed', startServer);
process.on('message', function (msg) {
	if (msg.type === 'updateConfig') {
		const s = config.site;
		let m;
		try {
			m = Function('return ' + msg.data)();
		} catch (e) {
			console.error(e);
		}
		if (dataType(m) === 'Object') {
			for (const n in m) {
				if (apis[n] && (!m[n].api || !isEqual(s[n].api.serv, m[n].api.serv))) {
					apis[n].client.destroy();
					for (const o in apis[n].sockets) {
						apis[n].sockets[o].close();
					}
				}
				if (!(n in s)) {
					makeStat(n);
				}
			}
		}
		config.site = m;
		console.log('site config updated.');
		for (const n in s) {
			if (!s[n].api && m[n].api) {
				loadApi(n);
			}
			if (!(n in m)) {
				delete stats[n];
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
}).title = 'fusion web server';
new ws.Server({
	perMessageDeflate: true,
	server: server,
	verifyClient: function (info) {
		const host = getHost(info.req),
			site = getSite(host);
		return apis[site] && chkOH(config.site[site].origin, info.origin && originHost(info.origin), host);
	}
}).on('error', function (err) {
	console.error(err.stack);
}).on('connection', function (client, req) {
	const host = getHost(req),
		site = getSite(host);
	if (apis[site]) {
		const auth = {
			__proto__: null,
			internal: true,
			cid: getCid(req.headers.cookie),
			host: host,
			agent: req.headers['user-agent'],
			ip: req.socket.address().address,
			skid: stats[site].ws.active + stats[site].ws.done
		};
		apis[site].sockets[auth.skid] = client;
		++stats[site].ws.active;
		apis[site].client.write('null\n' + toJsex(auth) + '\n' + toJsex({
			'!api': 'socketOpen'
		}) + '\n');
		delete auth.internal;
		client.on('message', function (msg, isBinary) {
			if (!isBinary) {
				const data = msg.toString('utf8').split('\n');
				if (data.length === 3) {
					const v = data[2].parseJsex();
					if (v) {
						if (data[0][0] === 'q' && data[1] === 'anwser') {
							if (apis[site]) {
								apis[site].client.write(data[0].substring(1) + '\n' + auth.skid + '\n' + toJsex(result));
							}
						} else {
							auth.cid = data[1];
							callapi(site, auth, v.value, (cid, result) => {
								auth.cid = cid;
								if (client.readyState === ws.OPEN) {
									client.send(data[0] + '\n' + cid + '\n' + toJsex(result));
								}
							});
						}
					}
				}
			}
		}).on('error', function (err) {
			//this.close();
			console.error(err.statk);
		}).once('close', function () {
			if (apis[site]) {
				auth.internal = true;
				apis[site].client.write('null\n' + toJsex(auth) + '\n' + toJsex({
					'!api': 'socketClose'
				}) + '\n');
				delete apis[site].sockets[auth.skid];
			}
			--stats[site].ws.active;
			++stats[site].ws.done;
		});
	} else {
		client.close();
	}
});
for (const n in config.site) {
	makeStat(n);
	if (config.site[n].api) {
		loadApi(n);
	}
};
startServer();