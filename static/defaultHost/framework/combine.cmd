cd /d %~dp0
uglifyjs src\jsex.js src\init.js src\svgClassList.js src\require.js -c hoist_vars,unsafe,comparisons -m -o all.js