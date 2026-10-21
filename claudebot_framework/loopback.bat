@echo off
chcp 65001 1>NUL
net session 1>NUL 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)
cd /d "%~dp0"
echo === loopback %date% %time% === 1>out.log
CheckNetIsolation LoopbackExempt -a -n=Microsoft.MinecraftUWP_8wekyb3d8bbwe 1>>out.log 2>&1
CheckNetIsolation LoopbackExempt -s 1>>out.log 2>&1
echo.
echo Это окно разрешает боту подключаться к миру Minecraft.
echo Держи его открытым, пока бот в игре. Закрыть - Ctrl+C или крестик.
echo.
CheckNetIsolation LoopbackExempt -is -n=Microsoft.MinecraftUWP_8wekyb3d8bbwe
