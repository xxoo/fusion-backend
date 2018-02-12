'use strict';
const path = require('path'),
	fs = require('fs'),
	fsext = require('../../fsext.js'),
	pathreg = /\/images\/(product|article|forumpost|formsection|topic|banner|richtext)\/[^\/]+/,
	uploads = {};
let i = 0;
module.exports = {
	getcaptcha: async function (params, auth) {
		return new Promise(function (resolve, reject) {
			clients.captcha.getCaptcha(params).then(resolve, reject);
		});
	},
	securePath: async function (params, auth) {
		return Promise.resolve();
	},
	serverRender: async function (params, auth) {
		return Promise.resolve({
			status: res.statusCode,
			encoding: 'utf8',
			head: {
				'content-type': 'text/html'
			},
			data: 'randered from server'
		});
	},
	uploadStart: async function (params, auth) {
		if (pathreg.test(params.path)) {
			let ext = path.posix.extname(params.path).toLocaleLowerCase();
			if (['.png', '.jpg'].indexOf(ext) < 0) {
				return Promise.resolve(Error('bad_file_type'));
			} else if (params.length > 2 * 1024 * 1024) {
				return Promise.resolve(Error('file_size_too_large'));
			} else {
				uploads[i] = params;
				return Promise.resolve(i++);
			}
		} else {
			return Promise.resolve(Error('bad_upload_path'));
		}
	},
	uploadEnd: async function (params, auth) {
		return new Promise(function (resolve, reject) {
			if (uploads.hasOwnProperty(params.token)) {
				let item = uploads[params.token],
					dir = path.posix.dirname(item.path),
					absdir = path.join('static', site + dir),
					filepath = path.join('uploading', params.filename),
					del = function (err) {
						fs.unlink(filepath, function () {
							resolve(err);
						});
					},
					rename = function () {
						let n = Date.now() + Math.random() + path.posix.extname(item.path);
						fs.rename(filepath, path.join(absdir, n), function (err) {
							if (err) {
								rename();
							} else {
								resolve(dir + '/' + n);
							}
						});
					};
				delete uploads[params.token];
				if (params.success) {
					fsext.md(absdir).then(function () {
						rename();
					}, function (err) {
						err.message = err.stack;
						del(err);
					});
				} else {
					del(Error('upload_intrupted'));
				}
			} else {
				resolve(Error('bad_upload_token'));
			}
		});
	}
};