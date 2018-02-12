'use strict';
const fs = require('fs'),
	path = require('path'),
	fsext = require('./fsext.js'),
	stream = require('stream'),
	zlib = require('zlib'),
	http2 = require('http2'),
	net = require('net'),
	tls = require('tls'),
	ws = require('ws'),
	util = require('util'),
	mime = require('mime'),
	config = require('./config.js');
require('./jsex.js');
let apiid = 0,
	apis = {},
	compressing = {},
	uploading = {},
	stats = {},
	makeStat = function (n) {
		stats[n] = {
			other: {
				active: 0,
				done: 0
			},
			ws: {
				active: 0,
				done: 0
			},
			GET: {
				active: 0,
				done: 0
			},
			POST: {
				active: 0,
				done: 0
			},
			HEAD: {
				active: 0,
				done: 0
			},
			OPTIONS: {
				active: 0,
				done: 0
			}
		};
	},
	statLog = function (m) {
		let s = '[' + m + ']';
		for (let n in stats[m]) {
			s += ` ${n}: ${stats[m][n].active} active, ${stats[m][n].done} done;`;
		}
		return s + '\n';
	},
	chkEnc = function (r) {
		let s = ['gzip', 'deflate'];
		if (r) {
			r = r.split(', ');
			for (let i = 0; i < s.length; i++) {
				if (r.indexOf(s[i]) >= 0) {
					return s[i];
				}
			}
		}
	},
	makeEnc = function (r) {
		let v, c = {
			gzip: zlib.createGzip,
			deflate: zlib.createDeflate
		};
		if (r) {
			return c[r]({
				level: 9,
				memLevel: 9
			});
		}
	},
	getSite = function (d) {
		if (d) {
			return config.site.hasOwnProperty(d) ? d : getSite(d.replace(/[^\.]*\.?/, ''));
		} else {
			return 'defaultHost';
		}
	},
	getHost = function (req) {
		let r = req.headers[req.httpVersion >= 2 ? ':authority' : 'host'];
		return r ? r.replace(/:\d+$/, '') : '';
	},
	getCid = function (cookie) {
		let cid;
		if (cookie) {
			cid = cookie.match(/(?:^|; ?)cid=([^;]+)/);
			cid = cid ? unescape(cid[1]) : '';
		} else {
			cid = '';
		}
		return cid;
	},
	originHost = function (origin) {
		return origin.replace(/^[^:]+:\/\/|:[\d]+$/g, '');
	},
	chkOH = function (reg, oh, host) {
		let d = dataType(reg);
		if (d === 'regexp') {
			return reg.test(oh);
		} else if (d === 'string') {
			return reg === oh;
		} else if (d === 'array') {
			let r = false;
			for (let i = 0; i < reg.length; i++) {
				r = r || chkOH(reg[i], oh, host);
				if (r) {
					break;
				}
			}
			return r;
		} else {
			return oh === host;
		}
	},
	loadApi = function (id) {
		if (apis[id]) {
			let err = Error('api_server_connection_lost');
			for (let n in apis[id].cbs) {
				apis[id].cbs[n]('', err);
			}
			delete apis[id];
			console.log(`connection of api server for ${id} closed. reconnecting...`);
		}
		if (config.site[id].api) {
			let last = [''];
			net.createConnection(config.site[id].api.serv, function () {
				console.log(`connected to api server for ${id}.`);
				apis[id] = {
					client: this,
					cbs: {}
				};
			}).on('data', function (data) {
				data = data.split('\n');
				for (let i = 0; i < data.length; i++) {
					let j = last.length - 1;
					last[j] += data[i];
					if (i < data.length - 1) {
						last[j] = last[j].parseJsex();
						if (last[j]) {
							let t = dataType(last[j].value);
							if ((j === 1 && t === 'string') || (j === 0 && t === 'number') || j === 2) {
								last[j] = last[j].value;
								if (j === 2) {
									if (apis[id].cbs.hasOwnProperty(last[0])) {
										apis[id].cbs[last[0]](last[1], last[2]);
										delete apis[id].cbs[last[0]];
									}
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
			}).on('close', loadApi.bind(this, id)).on('error', function (err) {
				if (apis[id]) {
					console.error(err.stack);
				}
			}).setEncoding('utf8');
		} else {
			console.log(`api config for ${id} is gone.`);
		}
	},
	callapi = function (site, auth, op, cb) {
		if (apis[site]) {
			apis[site].client.write(apiid + '\n' + toJsex(auth) + '\n' + toJsex(op) + '\n');
			apis[site].cbs[apiid++] = cb;
		} else {
			cb('', Error('not_connected_to_api_server'));
		}
	},
	startServer = function (err) {
		if (err) {
			console.log('server is stoped by error. restarting...');
		}
		server.listen(config.server.web);
	},
	server = http2.createSecureServer({
		allowHTTP1: true,
		key: config.site.defaultHost.certs.key,
		cert: config.site.defaultHost.certs.cert,
		SNICallback: function (host, cb) {
			cb(null, tls.createSecureContext(config.site[getSite(host)].certs));
		}
	}, function (req, res) {
		let host = getHost(req),
			site = getSite(host),
			cfg = config.site[site],
			hd = {},
			p = req.url.replace(/\?.*$/, '').replace(/\\/g, '/'),
			reqtype = stats[site].hasOwnProperty(req.method) ? req.method : 'other';
		if (p[0] !== '/') {
			p = '/' + p;
		}
		p = path.posix.normalize(p);
		stats[site][reqtype].active++;
		res.on('finish', function () {
			stats[site][reqtype].active--;
			stats[site][reqtype].done++;
		});
		if (!req.headers.origin || chkOH(cfg.origin, originHost(req.headers.origin), host)) {
			let auth = {
					cid: getCid(req.headers.cookie),
					host: host,
					agent: req.headers['user-agent'],
					address: req.socket.address().address
				},
				sendCid = function (cid) {
					if (cid) {
						hd['set-cookie'] = 'cid=' + escape(cid) + ';path=/;expires=Fri, 31-Dec-9999 23:59:59 GMT';
					}
				};
			if (req.headers.origin) {
				hd['access-control-allow-origin'] = req.headers.origin;
			}
			if (reqtype === 'GET' || reqtype === 'HEAD') {
				if (cfg.serverRender && cfg.serverRender.test(req.url)) {
					auth.internal = true;
					callapi(site, auth, {
						'!api': 'serverRender',
						url: req.url
					}, function (cid, result) {
						if (!res.finished) {
							sendCid(cid);
							if (dataType(result) === 'error') {
								res.writeHead(500, hd);
								if (reqtype === 'GET') {
									res.end(result.message);
								} else {
									res.end();
								}
							} else {
								for (let n in result.head) {
									hd[n] = result.head[n];
								}
								if (!hd['content-type']) {
									hd['content-type'] = 'text/html';
								}
								res.writeHead(result.status, hd);
								if (reqtype === 'GET') {
									res.end(result.data, result.encoding);
								} else {
									res.end();
								}
							}
						}
					});
				} else {
					let procStaticFile = function () {
						let c = path.join('cache', site, p.substr(1) + '.gz'),
							sendFile = function (p, stat, start, end) {
								if (!res.finished) {
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
							checkRange = function (p, stat) {
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
							compress = function (p, t, c) {
								if (!res.finished) {
									res.writeHead(200, hd);
									if (reqtype === 'GET') {
										let enc = makeEnc('gzip');
										fs.createReadStream(p).pipe(enc).pipe(res);
										if (c && !compressing.hasOwnProperty(c)) {
											compressing[c] = fs.createWriteStream(c).on('close', function () {
												t = new Date(t);
												fs.utimes(c, t, t, function (err) {
													delete compressing[c];
												});
											});
											enc.pipe(compressing[c]);
										}
									} else {
										res.end();
									}
								}
							};
						p = path.join('static', site, p.substr(1));
						fs.stat(p, function (err, stat) {
							if (!res.finished) {
								if (err) {
									res.writeHead(404, hd);
									res.end();
								} else if (stat.isDirectory()) {
									hd.location = req.url.replace(/(\?.*)?$/, '/$1');
									res.writeHead(302, hd);
									res.end();
								} else {
									let t = Math.floor(Math.max(stat.mtimeMs, stat.ctimeMs) / 1000) * 1000;
									if (req.headers['if-modfied-since'] && t < new Date(req.headers['if-modfied-since']).valueOf()) {
										res.writeHead(304, hd);
										res.end();
									} else {
										hd['last-modfied'] = new Date(t).toUTCString();
										hd['content-type'] = mime.getType(path.extname(p).substr(1));
										if (chkEnc(req.headers['accept-encoding']) === 'gzip') {
											hd['content-encoding'] = 'gzip';
											fs.stat(c, function (err, stat2) {
												if (!res.finished) {
													if (err) {
														fsext.md(path.dirname(c)).then(function () {
															compress(p, t, c);
														}, function (err) {
															compress(p, t);
														});
													} else if (stat2.isDirectory()) {
														fsext.rd(c).then(function () {
															compress(p, t, c);
														}, function (err) {
															compress(p, t);
														});
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
						}, function (cid, result) {
							if (!res.finished) {
								sendCid(cid);
								if (dataType(result) === 'error') {
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
					let cl = req.headers['content-length'] | 0,
						sendResult = function (cid, result) {
							if (!res.finished) {
								let v = chkEnc(req.headers['accept-encoding']);
								hd['content-type'] = 'text/jsex;charset=utf-8';
								sendCid(cid);
								auth.cid = cid;
								result = new Buffer(toJsex(result));
								if (result.length > (cfg.zLen || config.site.defaultHost.zLen) && v) {
									hd['content-encoding'] = v;
									res.writeHead(200, hd);
									v = makeEnc(v);
									v.pipe(res);
									v.end(result);
								} else {
									hd['content-length'] = result.length;
									res.writeHead(200, hd);
									res.end(result);
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
							let i = 0,
								bf = new Buffer(cl);
							req.on('data', function (data) {
								if (i + data.length <= cl) {
									data.copy(bf, i, 0, data.length);
								} else {
									req.destroy();
								}
								i += data.length;
							}).on('end', function () {
								let v;
								if (i === cl) {
									v = bf.toString('utf8', 0, i).parseJsex();
									if (v) {
										callapi(site, auth, v.value, sendResult);
									}
								}
								if (!v && !res.finished) {
									res.writeHead(400, hd);
									res.end();
								}
							});
						}
					} else {
						if (cl > 0) {
							let c, token, i = 0,
								uploadEnd = function (success) {
									callapi(site, auth, {
										'!api': 'uploadEnd',
										filename: c,
										token: token,
										success: success
									}, sendResult);
								};
							auth.internal = true;
							while (!c || uploading[c]) {
								c = Date.now() + Math.random() + '';
							}
							uploading[c] = fs.createWriteStream(path.join('uploading', c)).on('close', function () {
								delete uploading[c];
								if (i === cl) {
									if (token) {
										uploadEnd(true);
									}
								} else {
									if (token) {
										uploadEnd(false);
									}
								}
							});
							req.pipe(new stream.Transform({
								transform: function (chunk, encoding, next) {
									this.push(chunk);
									i += chunk.length;
									if (i > cl) {
										req.destroy();
									}
									next();
								}
							})).pipe(uploading[c]);
							callapi(site, auth, {
								'!api': 'uploadStart',
								path: p,
								length: cl
							}, function (cid, result) {
								if (dataType(result) === 'error') {
									if (uploading[c]) {
										req.destroy();
									}
									sendResult(cid, result);
								} else {
									auth.cid = cid;
									if (uploading[c]) {
										token = result;
									} else {
										uploadEnd(true);
									}
								}
							});
						} else {
							res.writeHead(400, hd);
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
		} else {
			res.writeHead(403, hd);
			res.end();
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
		let s = config.site,
			m = msg.data.parseJsex().value;
		for (let n in m) {
			if (apis[n] && !isEqual(s[n].api.serv, m[n].api.serv)) {
				apis[n].client.destroy();
			}
			if (!s.hasOwnProperty(n)) {
				makeStat(n);
			}
		}
		config.site = m;
		console.log('site config updated.');
		for (let n in s) {
			if (!s[n].api && m[n].api) {
				loadApi(n);
			}
		}
	} else if (msg.type === 'stats') {
		let s;
		if (stats.hasOwnProperty(msg.data)) {
			s = statLog(msg.data);
		} else {
			s = '';
			for (let m in stats) {
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
		let host = getHost(info.req),
			site = getSite(host);
		return Boolean(chkOH(config.site[site].origin, originHost(info.origin), host) && apis[site]);
	}
}).on('error', function (err) {
	console.error(err.stack);
}).on('connection', function (client, req) {
	let host = getHost(req),
		site = getSite(host),
		auth = {
			host: host,
			cid: getCid(req.headers.cookie),
			agent: req.headers['user-agent'],
			address: req.socket.address().address
		};
	stats[site].ws.active++;
	client.on('message', function (msg) {
		let id = msg.parseJsex(),
			v, t;
		if (id) {
			t = id.length + 1;
			id = id.value;
			if (typeof id === 'number') {
				v = msg.substr(t).parseJsex();
				if (v) {
					callapi(site, auth, v.value, function (cid, result) {
						if (client.readyState === ws.OPEN) {
							auth.cid = cid;
							client.send(id + '\n' + cid + '\n' + toJsex(result));
						}
					});
				}
			}
		}
	}).on('close', function () {
		stats[site].ws.active--;
		stats[site].ws.done++;
	}).on('error', function (err) {
		this.close();
		console.error(err.statk);
	});
});
for (let n in config.site) {
	makeStat(n);
	if (config.site[n].api) {
		loadApi(n);
	}
};
startServer();