(function (cb) {
	'use strict';
	var n, i = 0,
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
					domain: /^localhost$/,
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
	for (n in config.site) {
		if (config.site[n].hasOwnProperty('api') && config.site[n].api.hasOwnProperty('deps')) {
			var j = 0;
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
		config.site[n].certs = {};
		getCert(n, 'cert');
		getCert(n, 'key');
	}

	function getCert(site, type) {
		i++;
		fs.readFile(path.join(__dirname, 'certs', n, type + '.pem'), {
			encoding: 'utf8'
		}, function (err, data) {
			if (!err) {
				config.site[site].certs[type] = data;
			} else {
				throw err;
			}
			i--;
			if (i === 0) {
				cb(config);
			}
		});
	}
})