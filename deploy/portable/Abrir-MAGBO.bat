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

REM  Postes possibles : PORT1 PORT2 PORT3 BIBLIO ENFERM REFEI1 REFEI2 ADMINISTRATIF
REM  ADMINISTRATIF = poste de bureau, pas un point de passage
REM  (Vie Scolaire, direction, informatique) - ne change que le titre.

REM ===================================================================
REM  MODE QUIOSQUE - plein ecran, touches de sortie bloquees.
REM
REM  !! IL N'Y A PAS DE SORTIE PAR CODE. Mesure le 03/09/2026 :
REM  Ctrl+Shift+Alt+Q ne fait RIEN (l'atalho est enregistre dans main.js
REM  mais aucun ecran n'ecoute l'evenement), et MAGBO_KIOSK_PIN n'est lue
REM  par aucun ecran. Pour fermer un poste verrouille :
REM  Ctrl+Alt+Suppr -> Gestionnaire des taches -> MAGBO Access Control
REM  -> Fin de tache.
REM
REM  !! CETTE LIGNE RESTE ICI ET N'IRA PAS DANS LE FICHIER DE REGLAGE :
REM  verrouiller une machine se decide depuis la machine, pas depuis
REM  l'application qu'elle affiche. Pour un poste en quiosque deja migre,
REM  faire un Abrir-MAGBO-kiosque.bat qui ne pose QUE cette ligne -
REM  l'adresse et le poste continueront de venir du fichier.
REM ===================================================================
REM set NODE_ENV=production
REM set MAGBO_KIOSK_PIN=changez-ce-code

start "" "%~dp0MAGBO-Access-Control-Portable.exe"
