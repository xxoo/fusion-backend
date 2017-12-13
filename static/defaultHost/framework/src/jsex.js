'use strict';
String.prototype.JsEncode = function () {
	return this.replace(/[\n\r"\\]/g, function (a) {
		if (a === '\n') {
			return '\\n';
		} else if (a === '\r') {
			return '\\r';
		} else if (a === '\'') {
			return '\\\'';
		} else if (a === '"') {
			return '\\"';
		}
	});
};
String.prototype.JsDecode = function () {
	return this.replace(/^"|\\\\|\\n|\\r|\\'|\\"|"$/g, function (a) {
		if (a === '\\\\') {
			return '\\';
		} else if (a === '\\n') {
			return '\n';
		} else if (a === '\\r') {
			return '\r';
		} else if (a === '\\\'') {
			return '\'';
		} else if (a === '\\"') {
			return '"';
		} else if (a === '"') {
			return '';
		}
	});
};
String.prototype.RegEncode = function (p) {
	if (p) {
		return this.replace(/[\r\n]/g, function (a) {
			if (a === '\r') {
				return '\\r';
			} else if (a === '\n') {
				return '\\n';
			}
		}).replace(/^(?=\/)/, '\\').replace(/[^\\](\\\\)*(?=\/)/g, '$&\\');
	} else {
		return this.replace(/[\(\)\-\|\*\-\+\?\!\:\=\.\,\^\$\[\{\\]/g, '\\$&');
	}
};
String.prototype.parseJsex = function () {
	var ss, tmpr, r;
	if (this.substr(0, tmpr = 4) === 'null') {
		r = {
			value: null,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 9) === 'undefined') {
		r = {
			value: undefined,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 8) === 'Infinity') {
		r = {
			value: Infinity,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 9) === '-Infinity') {
		r = {
			value: -Infinity,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 3) === 'NaN') {
		r = {
			value: NaN,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 4) === 'true') {
		r = {
			value: true,
			length: tmpr
		};
	} else if (this.substr(0, tmpr = 5) === 'false') {
		r = {
			value: false,
			length: tmpr
		};
	} else if (ss = this.match(/^(?:(?:\-?(?:[1-9](?:\.\d*[1-9])?[eE][\+\-][1-9]\d*))|(?:\-?(?:(?:0\.\d*[1-9])|(?:[1-9]\d*)(?:\.\d*[1-9])?))|0)/)) {
		r = {
			value: +ss[0],
			length: ss[0].length
		};
	} else if (ss = this.match(/^"(?:(?:[^\n\r"]|\\")*?[^\\])??(?:\\\\)*"/)) {
		r = {
			value: ss[0].JsDecode(),
			length: ss[0].length
		};
	} else if (this.substr(0, tmpr = 9) === 'new Date(') {
		ss = this.substr(tmpr).parseJsex();
		if (ss && typeof ss.value === 'number' && this.charAt(tmpr += ss.length) === ')') {
			r = {
				value: new Date(parseFloat(ss.value)),
				length: tmpr + 1
			};
		}
	} else if (this.substr(0, tmpr = 7) === 'Symbol(') {
		if (this.charAt(tmpr) === ')') {
			r = {
				value: Symbol(),
				length: tmpr + 1
			};
		} else {
			ss.l = this.substr(tmpr).parseJsex();
			tmpr += ss.l.length;
			if (ss.l && typeof ss.l.value === 'string') {
				if (this.charAt(tmpr) === ')') {
					r = {
						value: Symbol(ss.l.value),
						length: tmpr + 1
					};
				}
			}
		}
	} else if (ss = this.match(/^\/((?:\\\\)+|(?:[^\\\/]|[^\/][^\n\r]*?[^\\])(?:\\\\)*)\/(g?i?m?u?y?)/)) {
		try {
			r = {
				value: RegExp(ss[1], ss[2]),
				length: ss[0].length
			};
		} catch (e) {}
	} else if (ss = this.match(/^(Range|Reference|Syntax|Type|URI|Eval)?Error\(/)) {
		tmpr = ss[0].length;
		ss = {
			t: ss[1]
		};
		if (ss.t === 'Range') {
			ss.t = RangeError;
		} else if (ss.t === 'Reference') {
			ss.t = ReferenceError;
		} else if (ss.t === 'Syntax') {
			ss.t = SyntaxError;
		} else if (ss.t === 'Type') {
			ss.t = TypeError;
		} else if (ss.t === 'URI') {
			ss.t = URIError;
		} else if (ss.t === 'Eval') {
			ss.t = EvalError;
		} else {
			ss.t = Error;
		}
		if (this.charAt(tmpr) === ')') {
			r = {
				value: ss.t(),
				length: tmpr + 1
			};
		} else {
			ss.l = this.substr(tmpr).parseJsex();
			tmpr += ss.l.length;
			if (ss.l && typeof ss.l.value === 'string') {
				if (this.charAt(tmpr) === ')') {
					r = {
						value: ss.t(ss.l.value),
						length: tmpr + 1
					};
				}
			}
		}
	} else if (this.charAt(0) === '[') {
		tmpr = 1;
		ss = {
			l: true,
			e: true,
			q: false,
			n: false,
			f: undefined,
			g: []
		};
		while (!(ss.n || (ss.e && this.charAt(tmpr) === ']'))) {
			if (ss.q) {
				if (this.charAt(tmpr) === ',') {
					tmpr += 1;
					ss.l = true;
					ss.e = ss.q = false;
					continue;
				}
			} else if (ss.l) {
				ss.f = this.substr(tmpr).parseJsex();
				if (ss.f) {
					tmpr += ss.f.length;
					ss.g.push(ss.f.value);
					ss.l = false;
					ss.e = ss.q = true;
					continue;
				}
			}
			ss.n = true;
		}
		if (!ss.n) {
			r = {
				value: ss.g,
				length: tmpr + 1
			};
		}
	} else if (this.charAt(0) === '{') {
		tmpr = 1;
		ss = {
			l: true,
			e: true,
			q: false,
			n: false,
			f: undefined,
			m: '',
			g: {}
		};
		while (!(ss.n || (ss.e && this.charAt(tmpr) === '}'))) {
			if (ss.q) {
				if (this.charAt(tmpr) === ',') {
					tmpr += 1;
					ss.l = true;
					ss.e = ss.q = false;
					continue;
				}
			} else if (ss.l) {
				ss.f = this.substr(tmpr).parseJsex();
				if (ss.f && typeof ss.f.value === 'string' && !(ss.f.value in ss.g)) { //disallow index duplication
					tmpr += ss.f.length;
					ss.m = ss.f.value;
					if (this.charAt(tmpr) === ':') {
						tmpr += 1;
						ss.f = this.substr(tmpr).parseJsex();
						if (ss.f) {
							tmpr += ss.f.length;
							ss.g[ss.m] = ss.f.value;
							ss.l = false;
							ss.e = ss.q = true;
							continue;
						}
					}
				}
			}
			ss.n = true;
		}
		if (!ss.n) {
			r = {
				value: ss.g,
				length: tmpr + 1
			};
		}
	}
	return r;
};

function dataType(a) {
	var t = typeof a;
	if (t === 'boolean' || t === 'string' || t === 'symbol' || t === 'number' || t === 'function' || t === 'undefined') {
		return t;
	} else {
		t = Object.prototype.toString.call(a).replace(/^\[object |\]$/g, '').toLowerCase();
		if (t === 'date' || t === 'array' || t === 'regexp' || t === 'error' || t === 'null') {
			return t;
		} else {
			return 'object';
		}
	}
}

function toJsex(d) {
	var s, i;
	if (d === null) {
		s = 'null';
	} else {
		i = dataType(d);
		if (i === 'string') {
			s = '"' + d.JsEncode() + '"';
		} else if (i === 'number' || i === 'boolean') {
			s = d.toString();
		} else if (i === 'date') {
			s = 'new Date(' + d.valueOf() + ')';
		} else if (i === 'regexp') {
			s = '/' + d.source.RegEncode(true) + '/';
			if (d.global) {
				s += 'g';
			}
			if (d.ignoreCase) {
				s += 'i';
			}
			if (d.multiline) {
				s += 'm';
			}
			if (d.sticky) {
				s += 'y';
			}
			if (d.unicode) {
				s += 'u';
			}
		} else if (i === 'error') {
			s = d.name + '(';
			if (d.message) {
				s += toJsex(d.message);
			}
			s += ')';
		} else if (i === 'array') {
			s = '[';
			for (i = 0; i < d.length; i++) {
				if (i > 0) {
					s += ',';
				}
				s += toJsex(d[i]);
			}
			s += ']';
		} else if (i === 'object') {
			s = '{';
			for (i in d) {
				if (s.length > 1) {
					s += ',';
				}
				s += toJsex(i) + ':' + toJsex(d[i]);
			}
			s += '}';
		} else if (i === 'symbol') {
			i = d.length;
			s = 'Symbol(' + (i > 8 ? '"' + d.substr(7, i - 8).JsEncode() + '"' : '') + ')';
		} else {
			s = 'undefined';
		}
	}
	return s;
}

function isEqual(o1, o2) {
	var n, t = dataType(o1);
	if (t === dataType(o2)) {
		if (t === 'object') {
			if (Object.keys(o1).length === Object.keys(o2).length) {
				for (n in o1) {
					if (!(n in o2) || !isEqual(o1[n], o2[n])) {
						return false;
					}
				}
				return true;
			} else {
				return false;
			}
		} else if (t === 'array') {
			if (o1.length === o2.length) {
				for (n = 0; n < o1.length; n++) {
					if (!isEqual(o1[n], o2[n])) {
						return false;
					}
				}
				return true;
			} else {
				return false;
			}
		} else if (t === 'regexp') {
			return o1.source === o2.source && o1.global === o2.global && o1.ignoreCase === o2.ignoreCase && o1.multiline === o2.multiline && o1.sticky === o2.sticky && o1.unicode === o2.unicode;
		} else if (t === 'error') {
			return o1.message = o2.message && o1.name === o2.name;
		} else if (t === 'date') {
			return o1.getTime() === o2.getTime();
		} else if (t === 'symbol') {
			return o1.toString() === o2.toString();
		} else {
			return o1 === o2;
		}
	} else {
		return false;
	}
}