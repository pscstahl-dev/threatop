; installer.nsh — Threat-Op Screensaver post-install registry setup

!macro customInstall
  ; Copy all files to System32\ThreatOp
  CreateDirectory "$WINDIR\System32\ThreatOp"
  CopyFiles "$INSTDIR\*.*" "$WINDIR\System32\ThreatOp"
  
  ; Copy the exe as a .scr file
  CopyFiles "$WINDIR\System32\ThreatOp\ThreatOp Screensaver.exe" "$WINDIR\System32\ThreatOp\ThreatOp.scr"
  
  ; Remove any old .scr from System32 root that might conflict
  Delete "$WINDIR\System32\ThreatOp.scr"
  
  ; Set registry to point to the correct screensaver path
  WriteRegStr HKCU "Control Panel\Desktop" "SCRNSAVE.EXE" "$WINDIR\System32\ThreatOp\ThreatOp.scr"
  WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveActive" "1"
  WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveTimeOut" "300"
  
  ; Notify Windows of the screensaver change
  ExecWait 'rundll32.exe desk.cpl,InstallScreenSaver "$WINDIR\System32\ThreatOp\ThreatOp.scr"'
!macroend

!macro customUnInstall
  ; Remove screensaver files
  RMDir /r "$WINDIR\System32\ThreatOp"
  Delete "$WINDIR\System32\ThreatOp.scr"
  
  ; Clear registry
  DeleteRegValue HKCU "Control Panel\Desktop" "SCRNSAVE.EXE"
  WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveActive" "0"
!macroend