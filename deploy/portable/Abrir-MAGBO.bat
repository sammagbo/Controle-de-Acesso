@echo off
REM ===================================================================
REM  MAGBO Access Control - lancador do portatil (modelo)
REM ===================================================================
REM  O .exe NAO guarda configuracao: ele le variaveis de ambiente.
REM  Abrir o .exe direto (duplo clique) faz o app cair no padrao
REM  http://localhost:8080 e ficar sem dados. Sempre abrir por AQUI.
REM
REM  Ajuste MAGBO_API_URL para o IP do servidor (VM) e MAGBO_SECTOR
REM  para o setor deste PC: PORT1 PORT2 PORT3 BIBLIO ENFERM REFEI1 REFEI2
REM ===================================================================

set MAGBO_API_URL=http://192.168.1.253:8080
set MAGBO_SECTOR=PORT1

REM  Descomente as duas linhas abaixo para ligar o modo quiosque
REM  (tela cheia, teclas de saida bloqueadas, PIN para sair).
REM set NODE_ENV=production
REM set MAGBO_KIOSK_PIN=troque-este-pin

start "" "%~dp0MAGBO-Access-Control-Portable.exe"
