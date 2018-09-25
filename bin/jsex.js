! function () {
	'use strict';
	var g = typeof self === 'undefined' ? global : self;
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
			} else if (a === '\\') {
				return '\\\\';
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
		var m, l, r;
		if (this.substr(0, l = 4) === 'null') {
			r = {
				value: null,
				length: l
			};
		} else if (this.substr(0, l = 9) === 'undefined') {
			r = {
				value: undefined,
				length: l
			};
		} else if (this.substr(0, l = 8) === 'Infinity') {
			r = {
				value: Infinity,
				length: l
			};
		} else if (this.substr(0, l = 9) === '-Infinity') {
			r = {
				value: -Infinity,
				length: l
			};
		} else if (this.substr(0, l = 3) === 'NaN') {
			r = {
				value: NaN,
				length: l
			};
		} else if (this.substr(0, l = 4) === 'true') {
			r = {
				value: true,
				length: l
			};
		} else if (this.substr(0, l = 5) === 'false') {
			r = {
				value: false,
				length: l
			};
		} else if (m = this.match(/^(-?[1-9]\d*|0)n/)) {
			r = {
				value: BigInt(m[1]),
				length: m[0].length
			};
		} else if (m = this.match(/^(?:-?(?:[1-9](?:\.\d*[1-9])?[eE][\+\-][1-9]\d*|0\.\d*[1-9]?|[1-9]\d*(?:\.\d*[1-9])?)|0?)/)) {
			r = {
				value: +m[0],
				length: m[0].length
			};
		} else if (m = this.match(/^"(?:(?:[^\n\r"]|\\")*?[^\\])??(?:\\\\)*"/)) {
			r = {
				value: m[0].JsDecode(),
				length: m[0].length
			};
		} else if (this.substr(0, l = 9) === 'new Date(') {
			m = this.substr(l).parseJsex();
			if (m && typeof m.value === 'number' && this.charAt(l += m.length) === ')') {
				r = {
					value: new Date(parseFloat(m.value)),
					length: l + 1
				};
			}
		} else if (this.substr(0, l = 7) === 'Symbol(') {
			if (this.charAt(l) === ')') {
				r = {
					value: Symbol(),
					length: l + 1
				};
			} else {
				m = this.substr(l).parseJsex();
				if (m && typeof m.value === 'string') {
					l += m.length;
					if (this.charAt(l) === ')') {
						r = {
							value: Symbol(m.value),
							length: l + 1
						};
					}
				}
			}
		} else if (m = this.match(/^\/((?:\\\\)+|(?:[^\\\/]|[^\/][^\n\r]*?[^\\])(?:\\\\)*)\/(g?i?m?u?y?)/)) {
			try {
				r = {
					value: RegExp(m[1], m[2]),
					length: m[0].length
				};
			} catch (e) {}
		} else if (m = this.match(/^(Range|Reference|Syntax|Type|URI|Eval)?Error\(/)) {
			l = m[0].length;
			m = {
				t: m[1]
			};
			if (m.t === 'Range') {
				m.t = RangeError;
			} else if (m.t === 'Reference') {
				m.t = ReferenceError;
			} else if (m.t === 'Syntax') {
				m.t = SyntaxError;
			} else if (m.t === 'Type') {
				m.t = TypeError;
			} else if (m.t === 'URI') {
				m.t = URIError;
			} else if (m.t === 'Eval') {
				m.t = EvalError;
			} else {
				m.t = Error;
			}
			if (this.charAt(l) === ')') {
				r = {
					value: m.t(),
					length: l + 1
				};
			} else {
				m.l = this.substr(l).parseJsex();
				l += m.l.length;
				if (m.l && typeof m.l.value === 'string') {
					if (this.charAt(l) === ')') {
						r = {
							value: m.t(m.l.value),
							length: l + 1
						};
					}
				}
			}
		} else if (this.charAt(0) === '[') {
			l = 1;
			m = {
				l: true,
				e: true,
				q: false,
				n: false,
				f: undefined,
				g: []
			};
			while (!(m.n || (m.e && this.charAt(l) === ']'))) {
				if (m.q) {
					if (this.charAt(l) === ',') {
						l += 1;
						m.l = true;
						m.e = m.q = false;
						continue;
					}
				} else if (m.l) {
					m.f = this.substr(l).parseJsex();
					if (m.f) {
						l += m.f.length;
						m.g.push(m.f.value);
						m.l = false;
						m.e = m.q = true;
						continue;
					}
				}
				m.n = true;
			}
			if (!m.n) {
				r = {
					value: m.g,
					length: l + 1
				};
			}
		} else if (this.charAt(0) === '{') {
			l = 1;
			m = {
				l: true,
				e: true,
				q: false,
				n: false,
				f: undefined,
				m: '',
				g: {}
			};
			while (!(m.n || (m.e && this.charAt(l) === '}'))) {
				if (m.q) {
					if (this.charAt(l) === ',') {
						l += 1;
						m.l = true;
						m.e = m.q = false;
						continue;
					}
				} else if (m.l) {
					m.f = this.substr(l).parseJsex();
					if (m.f && typeof m.f.value === 'string' && !(m.f.value in m.g)) { //disallow index duplication
						l += m.f.length;
						m.m = m.f.value;
						if (this.charAt(l) === ':') {
							l += 1;
							m.f = this.substr(l).parseJsex();
							if (m.f) {
								l += m.f.length;
								m.g[m.m] = m.f.value;
								m.l = false;
								m.e = m.q = true;
								continue;
							}
						}
					}
				}
				m.n = true;
			}
			if (!m.n) {
				r = {
					value: m.g,
					length: l + 1
				};
			}
		}
		return r;
	};
	g.dataType = function (a) {
		var t = typeof a;
		if (['boolean', 'string', 'symbol', 'number', 'bigint', 'function', 'undefined'].indexOf(t) < 0) {
			t = Object.prototype.toString.call(a).replace(/^\[object |\]$/g, '').toLowerCase();
			if (['date', 'array', 'regexp', 'error', 'null'].indexOf(t) < 0) {
				return 'object';
			} else {
				return t;
			}
		} else {
			return t;
		}
	};
	g.toJsex = function (d) {
		var s, i;
		if (d === null) {
			s = 'null';
		} else {
			i = dataType(d);
			if (i === 'string') {
				s = '"' + d.JsEncode() + '"';
			} else if (i === 'number' || i === 'boolean') {
				s = d.toString();
			} else if (i === 'bigint') {
				s = d.toString() + 'n';
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
	};
	g.isEqual = function (o1, o2) {
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
	};
}();