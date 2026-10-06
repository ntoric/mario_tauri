; Stop Mario Juicy + its bundled mario-printer sidecar before NSIS
; overwrites/removes files. A running sidecar holds a lock on
; mario-printer.exe and fails the install with "file in use".

!macro MARIO_KILL_RUNTIME
  DetailPrint "Stopping Mario Juicy and mario-printer sidecar..."
  ; Main shell — binary name is productName-derived, cover both spellings.
  nsExec::ExecToLog 'taskkill /F /T /IM "Mario Juicy.exe"'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM "mario-juicy.exe"'
  Pop $0
  ; Bundled printer sidecar (externalBin lives next to the exe).
  nsExec::ExecToLog 'taskkill /F /T /IM "mario-printer.exe"'
  Pop $0

  ; Let Windows release file handles before copy/delete.
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro MARIO_KILL_RUNTIME
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro MARIO_KILL_RUNTIME
!macroend
