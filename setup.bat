@echo off
where node >nul 2>nul || (echo Node.js 22.18+ is required: https://nodejs.org & exit /b 1)
call npm run setup
