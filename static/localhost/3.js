export function then (resolve, reject) {
	import('./4.js').then(m => resolve(`3.js with ${m}`));
}