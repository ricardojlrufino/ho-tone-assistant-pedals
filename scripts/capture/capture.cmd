@echo off
rem Captura ao vivo do USB no Windows: tshark (USBPcap) -> leitor que decodifica o USB-MIDI.
rem   capture.cmd list                       lista as interfaces USBPcap
rem   capture.cmd <N> <sessao> [opcoes]      N = número da interface (USBPcap1 -> 1); opcoes: --device, --endpoint, --mode, --list
setlocal
set "TSHARK=%ProgramFiles%\Wireshark\tshark.exe"
if not exist "%TSHARK%" (
  echo Wireshark nao encontrado em "%TSHARK%". Instale o Wireshark marcando a opcao USBPcap.
  exit /b 1
)
if /i "%~1"=="list" (
  "%TSHARK%" -D
  exit /b %errorlevel%
)
if "%~2"=="" (
  echo Uso: capture.cmd ^<N da interface USBPcap^> ^<sessao^> [opcoes]
  exit /b 1
)
set "SESSION=%~2"
if not exist "%~dp0..\..\captures\%SESSION%" mkdir "%~dp0..\..\captures\%SESSION%"
rem -l descarrega a saida a cada pacote; -x mostra os bytes; -t e usa hora em epoch; -P mostra na tela mesmo gravando o .pcapng
"%TSHARK%" -i "\\.\USBPcap%~1" -l -x -t e -P -w "%~dp0..\..\captures\%SESSION%\raw.pcapng" | bun "%~dp0live.ts" %SESSION% %3 %4 %5 %6 %7 %8
