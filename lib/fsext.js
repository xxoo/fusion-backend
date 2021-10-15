'use strict';
const fs = require('fs'),
	util = require('util'),
	path = require('path'),
	rmdir = util.promisify(fs.rmdir),
	mkdir = util.promisify(fs.mkdir),
	unlink = util.promisify(fs.unlink),
	readdir = util.promisify(fs.readdir),
	stat = util.promisify(fs.stat),
	rd = async function (dir) {
		return new Promise(function (resolve, reject) {
			readdir(dir).then(function (files) {
				let p = [];
				files.forEach(function (file) {
					p.push(del(path.join(dir, file)));
				});
				Promise.all(p).then(function () {
					rmdir(dir).then(resolve, reject);
				}, reject);
			}, function (err) {
				resolve();
			});
		});
	},
	del = async function (file) {
		return new Promise(function (resolve, reject) {
			stat(file).then(function (s) {
				if (s.isDirectory()) {
					rd(file).then(resolve, reject);
				} else {
					unlink(file).then(resolve, reject);
				}
			}, function (err) {
				resolve();
			});
		});
	},
	md = async function (dir) {
		let d = path.normalize(dir).split(path.sep);
		dir = '';
		for (let i = 0; i < d.length; i++) {
			dir += i > 0 ? path.sep + d[i] : d[i];
			try {
				await mkdir(dir);
			} catch (e) {
				if (i === d.length - 1 && e.code !== 'EEXIST') {
					return Promise.reject(e);
				}
			}
		}
		return Promise.resolve();
	};
module.exports = {
	rd,
	del,
	md
};