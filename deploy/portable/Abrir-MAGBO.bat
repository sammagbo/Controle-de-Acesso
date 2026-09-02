@echo off
REM ===================================================================
REM  MAGBO Access Control - lanceur du portable (MODELE)
REM ===================================================================
REM  !! CE LANCEUR EST DESORMAIS OPTIONNEL.
REM
REM  Depuis septembre 2026, l'application s'ouvre par son .exe, comme
REM  n'importe quelle application : elle demande son reglage la premiere
REM  fois (adresse du serveur + poste), l'ecrit dans magbo-poste.json a
REM  cote du .exe, et ne le redemande plus jamais.
REM
REM  !! MAIS LES VARIABLES CI-DESSOUS GARDENT LA PRIORITE SUR CE FICHIER.
REM  C'est delibere : un poste deja installe, non touche, continue de se
REM  comporter exactement comme avant. Tant que ce .bat est la, c'est lui
REM  qui gouverne, et l'ecran de correction (engrenage -> Poste) refusera
REM  d'enregistrer en disant pourquoi - plutot que d'annoncer un
REM  "enregistre" que ce lanceur effacerait a la prochaine ouverture.
REM
REM  Pour migrer un poste vers le reglage a l'ecran : retirer ce fichier
REM  du dossier, ouvrir le .exe, repondre une fois.
REM  Procedure complete : docs/operacional/guide-installation-postes.md
REM ===================================================================

set MAGBO_API_URL=http://192.168.1.253:8080
set MAGBO_SECTOR=PORT1

REM  Postes possibles : PORT1 PORT2 PORT3 BIBLIO ENFERM REFEI1 REFEI2

REM ===================================================================
REM  MODE QUIOSQUE - plein ecran, touches de sortie bloquees, PIN.
REM
REM  !! CES DEUX LIGNES RESTENT ICI ET N'IRONT PAS DANS LE FICHIER DE
REM  REGLAGE : un code de sortie n'a rien a faire en clair a cote du
REM  programme, sur un PC partage. Pour un poste en quiosque deja migre,
REM  faire un Abrir-MAGBO-kiosque.bat qui ne pose QUE ces deux lignes -
REM  l'adresse et le poste continueront de venir du fichier.
REM ===================================================================
REM set NODE_ENV=production
REM set MAGBO_KIOSK_PIN=changez-ce-code

start "" "%~dp0MAGBO-Access-Control-Portable.exe"
