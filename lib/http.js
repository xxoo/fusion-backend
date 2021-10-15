'use strict';
const http = require('http'),
	fs = require('fs');
http.createServer(function(req, res) {
	let p = req.url.substr(1).replace(/\?.*$/, ''),
		hd = {};
	fs.stat(p, function(err, stat) {
		if (!res.writableEnded) {
			if (err || stat.isDirectory()) {
				res.writeHead(404, hd);
				res.end();
			} else {
				let t = Math.floor(Math.max(stat.mtimeMs, stat.ctimeMs) / 1000) * 1000;
				if (req.headers['if-modified-since'] && t === new Date(req.headers['if-modified-since']).getTime()) {
					res.writeHead(304, hd);
					res.end();
				} else {
					hd['last-modified'] = new Date(t).toUTCString();
					hd['cache-control'] = 'must-revalidate';
					hd['content-type'] = 'text/jsex;charset=utf-8';
					hd['content-encoding'] = 'gzip';
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
				}
			}
		}
	});

	function sendFile (p, stat, start, end) {
		if (!res.writableEnded) {
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
			if (req.method === 'HEAD') {
				res.end();
			} else {
				fs.createReadStream(p, {
					start: start,
					end: end
				}).pipe(res);
			}
		}
	}
}).listen(80);