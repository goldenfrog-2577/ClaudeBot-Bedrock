@echo off
chcp 65001 1>NUL
net session 1>NUL 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" & exit /b)
CheckNetIsolation LoopbackExempt -d -n=Microsoft.MinecraftUWP_8wekyb3d8bbwe
echo Исключение удалено.
pause
