'use strict';
const fs = require('fs'),
	path = require('path'),
	prefix = (process.platform === 'win32' ? '\\\\?\\pipe\\' : '/tmp/') + 'fusion.',
	config = {
		server: {
			web: 4443,
			captcha: prefix + 'server.captcha'
		},
		site: {
			defaultHost: {
				index: 'index.html',
				postLen: 64 * 1024,
				fileLen: 2 * 1024 * 1024,
				zLen: 4 * 1024,
				securePath: /^\//,
				api: {
					serv: prefix + 'api.defaultHost',
					deps: ['captcha']
				}
			},
			localhost: {
				api: {
					serv: prefix + 'api.localhost',
					deps: ['captcha']
				}
			}
		},
		manager: {
			port: 4444,
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
	config.site[n].certs = {
		cert: fs.readFileSync(path.join(__dirname, 'certs', n, 'cert.pem'), {
			encoding: 'utf8'
		}),
		key: fs.readFileSync(path.join(__dirname, 'certs', n, 'key.pem'), {
			encoding: 'utf8'
		})
	};
}
module.exports = config;