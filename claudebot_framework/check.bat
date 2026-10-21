@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === %date% %time% === > out.log
echo --- node: >> out.log
node -v >> out.log 2>&1
echo --- npm: >> out.log
call npm -v >> out.log 2>&1
echo --- where node: >> out.log
where node >> out.log 2>&1
echo --- UDP 19132/19133, мир открыт в сети: >> out.log
netstat -ano -p UDP | findstr ":19132 :19133" >> out.log 2>&1
echo --- done >> out.log
echo Готово, окно можно закрыть.
timeout /t 3 >nul
