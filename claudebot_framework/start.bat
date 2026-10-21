@echo off
chcp 65001 1>NUL
cd /d "%~dp0"
title ClaudeBot
if not exist config.json (
  copy config.example.json config.json 1>NUL
  echo Создан config.json из примера. Впиши свой ник в "owners" и запусти снова.
  pause
  exit /b
)
echo === start %date% %time% === 1>>chat.log
node bot.js
echo Бот остановлен.
pause
