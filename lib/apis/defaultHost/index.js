'use strict';
const fs = require('fs'),
	path = require('path'),
	pathreg = /\/images\/(product|article|forumpost|formsection|topic|banner|richtext)\/[^\/]+/,
	uploads = { __proto__: null };
let uploadId = 0;
module.exports = {
	async securePath(auth, param) {

	},
	async serverRender(auth, param) {
		return {
			status: 200,
			head: {
				'content-type': 'text/html'
			},
			data: 'randered from server'
		};
	},
	async uploadStart(auth, param) {
		if (pathreg.test(param.path)) {
			let ext = path.posix.extname(param.path).toLowerCase();
			if (['.png', '.jpg'].indexOf(ext) < 0) {
				throw 'bad_file_type';
			} else if (param.length > 2 * 1024 * 1024) {
				throw 'file_size_too_large';
			} else {
				uploads[++uploadId] = param;
				return uploadId;
			}
		} else {
			throw 'bad_upload_path';
		}
	},
	async uploadEnd(auth, param) {
		if (param.token in uploads) {
			return new Promise((resolve, reject) => {
				let item = uploads[param.token],
					dir = path.posix.dirname(item.path),
					absdir = path.join('static', site + dir),
					filepath = path.join('uploading', param.filename),
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
				delete uploads[param.token];
				if (param.success) {
					fs.mkdir(absdir, {
						recursive: true
					}, err => {
						if (err) {
							err.message = err.stack;
							del(err);
						} else {
							rename();
						}
					});
				} else {
					del(Error('upload_intrupted'));
				}
			});
		} else {
			throw 'bad_upload_token';
		}
	},
	async socketOpen(auth) {
	},
	async socketClose(auth) {
	},
	async getCaptcha(auth, param) {
		let captcha = await clients.captcha.getCaptcha({
			type: 'normal',
			len: 4
		});
		if (dataType(captcha) === 'Object') {
			inf.captcha = captcha.text.toLowerCase();
			captcha = captcha.path;
		}
		return captcha;
	}
};