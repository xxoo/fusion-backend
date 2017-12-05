'use strict';
const fs = require('fs'),
	path = require('path'),
	config = eval(fs.readFileSync(path.join(__dirname, 'config.js'), {
		encoding: 'utf8'
	})),
	fsext = require('./fsext.js'),
	stream = require('stream'),
	zlib = require('zlib'),
	http2 = require('http2'),
	net = require('net'),
	ws = require('ws'),
	util = require('util'),
	mime = require('mime'),
	apis = {},
	compressing = {},
	uploading = {},
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
	getSite = function (d, isApi) {
		if (d) {
			return config.site.hasOwnProperty(d) ? d : getSite(d.replace(/[^\.]*\.?/, ''));
		} else {
			return 'defaultHost';
		}
	},
	getHost = function (req) {
		return req.headers[req.httpVersion >= 2 ? ':authority' : 'host'].replace(/:\d+$/, '');
	},
	originHost = function (origin) {
		return origin.replace(/^[^:]+:\/\/|:[\d]+$/g, '');
	},
	chkOH = function (reg, oh, host) {
		let d = dataType(reg);
		if (d === 'regex') {
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
			let err = Error('api server connection lost.');
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
			cb(Error(`not connected to api for ${site}`));
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
		key: fs.readFileSync(path.join(__dirname, 'key.pem')),
		cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
	}, function (req, res) {
		let host = getHost(req),
			site = getSite(host),
			cfg = config.site[site],
			hd = {},
			p = req.url.replace(/\?.*$/, '');
		if (!req.headers.origin || chkOH(cfg.origin, originHost(req.headers.origin), host)) {
			if (req.headers.origin) {
				hd['access-control-allow-origin'] = req.headers.origin;
			}
			if (req.method === 'GET' || req.method === 'HEAD') {
				let c,
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
							if (req.method === 'GET') {
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
							if (req.method === 'GET') {
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
				if (p[p.length - 1] === '/') {
					p += cfg.index || config.site.defaultHost.index;
				}
				c = path.normalize(path.resolve(__dirname, 'cache', site, p.substr(1)) + '.gz');
				p = path.normalize(path.resolve(__dirname, 'static', site, p.substr(1)));
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
			} else if (req.method === 'POST') {
				if (apis[site]) {
					let cl = req.headers['content-length'] | 0,
						auth = {
							cid: req.headers.cid || '',
							host: host,
							agent: req.headers['user-agent'],
							address: req.socket.address().address
						},
						sendResult = function (cid, result) {
							if (!res.finished) {
								let v = chkEnc(req.headers['accept-encoding']);
								hd.cid = auth.cid = cid;
								hd['content-type'] = 'text/jsex';
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
							}).on('close', function () {
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
							let c, apidone, i = 0,
								del = function () {
									fs.unlink(c, function () {});
								},
								moveFile = function () {
									let dir = path.dirname(p).substr(1),
										absdir = path.normalize(path.join(__dirname, 'static', site, dir)),
										rename = function () {
											let n = Date.now() + Math.random() + path.extname(p);
											fs.rename(c, path.join(absdir, n), function (err) {
												if (err) {
													rename();
												} else {
													sendResult(auth.cid, '/' + dir + '/' + n);
												}
											});
										};
									fsext.md(absdir).then(function () {
										rename();
									}, function (err) {
										del();
										err.message = err.stack;
										sendResult(auth.cid, err);
									});
								};
							while (!c || uploading[c]) {
								c = path.normalize(path.join(__dirname, 'uploading', Date.now() + Math.random() + ''));
							}
							uploading[c] = fs.createWriteStream(c).on('close', function () {
								delete uploading[c];
								if (i === cl) {
									if (apidone) {
										moveFile();
									}
								} else {
									del();
									if (apidone && !res.finished) {
										res.writeHead(400, hd);
										res.end();
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
								'!api': 'upload',
								path: p,
								len: cl
							}, function (cid, result) {
								if (result) {
									if (uploading[c]) {
										req.destroy();
									}
									sendResult(cid, result);
								} else {
									auth.cid = cid;
									if (uploading[c]) {
										apidone = true;
									} else {
										moveFile();
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
			} else if (req.method === 'OPTIONS') {
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
let apiid = 0;
require('./jsex.js');
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
			cid: req.url.substr(1),
			agent: req.headers['user-agent'],
			address: req.socket.address().address
		};
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
							client.send(id + '\n' + toJsex(cid) + '\n' + toJsex(result));
						}
					});
				}
			}
		}
	});
});
process.on('message', function (msg) {
	let s = config.site;
	for (let n in msg) {
		if (apis[n] && !isEqual(s[n].api.serv, msg[n].api.serv)) {
			apis[n].client.destroy();
		}
	}
	config.site = msg;
	console.log('site config updated.');
	for (let n in s) {
		if (!s[n].api && msg[n].api) {
			loadApi(n);
		}
	}
});
for (let n in config.site) {
	if (config.site[n].api) {
		console.log(`connecting to api server for ${n}...`);
		loadApi(n);
	}
};
startServer();