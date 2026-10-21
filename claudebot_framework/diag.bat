@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Проверяю, подожди ~20 секунд...
echo === diag %date% %time% === > out.log
echo --- Minecraft packages: >> out.log
powershell -NoProfile -Command "Get-AppxPackage *minecraft* | Format-List Name,PackageFamilyName,Version,InstallLocation" >> out.log 2>&1
echo --- loopback exemptions: >> out.log
CheckNetIsolation LoopbackExempt -s >> out.log 2>&1
echo --- ping: >> out.log
node ping.js >> out.log 2>&1
echo --- done >> out.log
echo Готово, окно можно закрыть.
timeout /t 3 >nul
