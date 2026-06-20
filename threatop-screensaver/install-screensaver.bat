@echo off
echo Installing Threat-Op Screensaver...

REM Copy all files to System32\ThreatOp
xcopy "%~dp0*.*" "C:\Windows\System32\ThreatOp\" /E /I /Y /Q

REM Copy exe as .scr
copy "C:\Windows\System32\ThreatOp\ThreatOp Screensaver.exe" "C:\Windows\System32\ThreatOp\ThreatOp.scr"

REM Remove conflicting .scr from System32 root
del "C:\Windows\System32\ThreatOp.scr" 2>nul

REM Set registry
reg add "HKCU\Control Panel\Desktop" /v "SCRNSAVE.EXE" /t REG_SZ /d "C:\Windows\System32\ThreatOp\ThreatOp.scr" /f
reg add "HKCU\Control Panel\Desktop" /v "ScreenSaveActive" /t REG_SZ /d "1" /f
reg add "HKCU\Control Panel\Desktop" /v "ScreenSaveTimeOut" /t REG_SZ /d "300" /f

echo Done! Threat-Op Screensaver installed successfully.
pause