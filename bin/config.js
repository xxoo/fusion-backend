'use strict';
const fs = require('fs'),
	path = require('path'),
	prefix = (process.platform === 'win32' ? '\\\\?\\pipe\\' : '/tmp/') + 'fusion.',
	config = {
		server: {
			web: 4443,
			captcha: prefix + 'server.captcha',
			http: 8080,
		},
		site: {
			defaultHost: {
				index: 'index.html',
				postLen: 64 * 1024,
				fileLen: 2 * 1024 * 1024,
				zLen: 4 * 1024,
				serverRender: /^server$/,
				//securePath: /^\//,
				api: {
					serv: prefix + 'api.defaultHost',
					deps: ['captcha']
				}
			}
		},
		manager: {
			port: 4444,
			logcache: 1000,
			password: '123456'
		}
	};
for (let n in config.site) {
	if (config.site[n].hasOwnProperty('api') && config.site[n].api.hasOwnProperty('deps')) {
		let j = 0;
		while (j < config.site[n].api.deps.length) {
			if (config.server.hasOwnProperty(config.site[n].api.deps[j])) {
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
	} catch (e) {}
}
module.exports = config;