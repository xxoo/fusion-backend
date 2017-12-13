'use strict';
module.exports = {
	getcaptcha: async function (params, auth) {
		return new Promise(function (resolve, reject) {
			clients.captcha.getCaptcha(params).then(resolve, reject);
		});
	},
	upload: async function (params, auth) {
		return Promise.resolve();
	}
};