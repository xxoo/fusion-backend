'use strict';
const fs = require('fs'),
	path = require('path'),
	prefix = (process.platform === 'win32' ? '\\\\?\\pipe\\' : '/tmp/') + 'fusion.',
	config = {
		server: {
			__proto__: null,
			web: 443,
			http: 80,
			captcha: prefix + 'server.captcha'
		},
		site: {
			__proto__: null,
			defaultHost: {
				origin: /^.*$/,
				index: 'index.html',
				postLen: 512 * 1024,
				fileLen: 2 * 1024 * 1024,
				zLen: 4 * 1024,
				//serverRender: /^server$/,
				//securePath: /^\//,
				api: {
					serv: prefix + 'api.defaultHost',
					deps: ['tdx']
				}
			}
		},
		manager: {
			port: 444,
			logcache: 1000,
			password: '123456'
		}
	};
for (let n in config.site) {
	if (('api' in config.site[n]) && ('deps' in config.site[n].api)) {
		let j = 0;
		while (j < config.site[n].api.deps.length) {
			if (config.site[n].api.deps[j] in config.server) {
				j++;
			} else {
				config.site[n].api.deps.splice(j, 1);
			}
		}
		if (!config.site[n].api.deps.length) {
			delete config.site[n].api.deps;
		}
	}
	try {
		config.site[n].certs = {
			cert: fs.readFileSync(path.join('certs', n, 'cert.pem'), {
				encoding: 'utf8'
			}),
			key: fs.readFileSync(path.join('certs', n, 'key.pem'), {
				encoding: 'utf8'
			})
		};
	} catch (e) { }
}
module.exports = config;