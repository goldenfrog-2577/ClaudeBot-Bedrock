@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Устанавливаю зависимости, это может занять пару минут...
echo === install %date% %time% === > out.log
call npm install --no-audit --no-fund --ignore-scripts >> out.log 2>&1
echo --- exit code: %errorlevel% >> out.log
echo Готово, окно можно закрыть.
timeout /t 5 >nul
