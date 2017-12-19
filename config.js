(function () {
	'use strict';
	const prefix = (process.platform === 'win32' ? '\\\\?\\pipe\\' : '/tmp/') + 'fusion.',
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
			let i = 0;
			while (i < config.site[n].api.deps.length) {
				if (config.server.hasOwnProperty(config.site[n].api.deps[i])) {
					i++;
				} else {
					config.site[n].api.deps.splice(i, 1);
				}
			}
			if (!config.site[n].api.deps.length) {
				delete config.site[n].api.deps;
			}
		}
	}
	return config;
})();