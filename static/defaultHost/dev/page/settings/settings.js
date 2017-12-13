'use strict';
define(['module', 'common/kernel/kernel', 'site/util/util'], function (module, kernel, util) {
	var thispage = module.id.replace(/^[^/]+\/|\/[^/]+/g, ''),
		dom = document.querySelector('#page>.content>.' + thispage),
		t = dom.querySelector('input'),
		captcha = dom.appendChild(kernel.makeSvg());
	t.onchange = function () {
		if (this.files.length) {
			util.upload('/upload/', this.files[0]);
		}
	};

	captcha.addEventListener('click', function () {
		let d = Date.now();
		for (let i = 0; i< 100; i++) {
			util.callapi({
				'!api': 'getcaptcha',
				type: 'all',
				len: 4
			}).then(function (data) {
				kernel.setSvgPath(captcha, data.path);
				console.log(Date.now() - d);
			});
		}
	});

	return {
		onload: function (force) {
			captcha.dispatchEvent(new MouseEvent('click'));
		}
	};
});