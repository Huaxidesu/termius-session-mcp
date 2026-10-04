@echo off
if "%~3"=="" (
  echo Usage: launch.cmd "Termius.exe" "node.exe" "private state directory"
  exit /b 1
)
echo Starting Termius Session MCP. Keep this window open while using the integration.
echo Launcher wrapper started.>>"%~dp0..\launcher.log"
"%~2" "%~dp0..\src\launcher.js" --termius "%~1" --state-dir "%~3" >>"%~dp0..\launcher.log" 2>&1
if errorlevel 1 (
  echo Launch failed. Diagnostic log:
  type "%~dp0..\launcher.log"
  pause
)
