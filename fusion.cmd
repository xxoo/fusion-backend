@echo off
:begin
node %* "%~dp0\lib\manager.js"
goto begin