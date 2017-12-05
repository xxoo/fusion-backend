'use strict';
const net = require('net'),
	startCaptchaClient = function () {
		let msg = '';
		if (captchaClient) {
			let err = Error('captcha server connection lost');
			captchaClient = undefined;
			for (let i = 0; i < captchacbs.length; i++) {
				captchacbs[i](err);
			}
			console.log('connection of captcha server is closed. reconnecting...');
		}
		net.createConnection(cfg, function () {
			console.log('connected to captcha server.');
			captchaClient = this;
			captchacbs = [];
		}).on('data', function (data) {
			data = data.split('\n');
			for (let i = 0; i < data.length; i++) {
				msg += data[i];
				if (i < data.length - 1) {
					msg = msg.parseJsex();
					if (msg && dataType(msg.value) === 'object') {
						msg = msg.value;
					} else {
						msg = Error('bad response');
					}
					captchacbs[0](msg);
					captchacbs.shift();
					msg = '';
				}
			}
		}).on('close', startCaptchaClient).on('error', function (err) {
			if (captchaClient) {
				console.error(err.stack);
			}
		}).setEncoding('utf8');
	};
let captchaClient, captchacbs, cfg;
module.exports = {
	setConfig: function (c) {
		if (!cfg) {
			cfg = c;
			startCaptchaClient();
			console.log('starting captcha client...');
		} else {
			cfg = c;
			if (captchaClient) {
				captchaClient.destroy();
			}
			console.log('restarting captcha client...');
		}
	},
	getCaptcha: async function (params) {
		return new Promise(function (resolve, reject) {
			if (captchaClient) {
				captchaClient.write(toJsex(params) + '\n');
				captchacbs.push(function (result) {
					if (dataType(result) === 'object') {
						resolve(result);
					} else {
						reject(result);
					}
				});
			} else {
				reject(Error('not connected to captcha server'));
			}
		});
	}
};