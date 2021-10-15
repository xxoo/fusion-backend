'use strict';
const net = require('net'),
	startCaptchaClient = function () {
		let msg = '';
		if (captchaClient) {
			const err = Error('captcha server connection lost');
			captchaClient = undefined;
			for (let i = 0; i < captchacbs.length; ++i) {
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
			for (let i = 0; i < data.length; ++i) {
				msg += data[i];
				if (i < data.length - 1) {
					try {
						msg = Function('return ' + msg)();
					} catch (e) {
						console.error(e);
					}
					captchacbs.shift()(dataType(msg) === 'Object' ? msg : Error('bad_response'));
					msg = '';
				}
			}
		}).once('close', startCaptchaClient).on('error', function (err) {
			if (captchaClient) {
				console.error(err.stack);
			}
		}).setEncoding('utf8');
	};
let captchaClient, captchacbs, cfg;
module.exports = {
	start: function (c) {
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
		if (captchaClient) {
			return new Promise(function (resolve, reject) {
				captchaClient.write(toJsex(params) + '\n');
				captchacbs.push(resolve);
			});
		} else {
			return Error('not_connected_to_captcha_server');
		}
	}
};