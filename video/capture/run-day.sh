#!/usr/bin/env bash
# O dia de captura inteiro num comando só, para o vídeo do portfólio, num relógio simulado: não espera a hora real.
# Antes de cada etapa, o script põe o relógio da demo na hora da cena e roda a etapa na hora:
#
#   B.1  11:30 de Paris       instância nova, dados do dia (seed-day.mjs) e as duas semanas antes (seed-history.mjs)
#   B.2  11:56 de Paris       capture-day.mjs --session midi
#   B.3  16:16 de Paris       capture-day.mjs --session soir
#   B.4  17:01 de São Paulo   o fechamento automático das 17:00, depois capture-day.mjs --session cloture
#   B.5  logo depois          down -v e as conferências finais
#
# O relógio é um offset em segundos em /tmp/magbo-demo-clock/faketime.rc: o libfaketime o soma ao relógio real do
# backend (Dockerfile.demo-backend), demo.mjs o soma ao dos scripts, e capture-day.mjs põe o navegador na mesma hora.
# O dia é a próxima segunda-feira depois de hoje, e o relógio só anda para a frente: a licença fecha a gestão quando a
# data volta dois dias ou mais (LicenceHorloge). Leva uns 35 minutos.
#
#   ~/Controle-de-Acesso/video/capture/run-day.sh            o dia inteiro; o computador não suspende enquanto ele roda
#   ~/Controle-de-Acesso/video/capture/run-day.sh --detach   o mesmo, fora deste terminal e da sessão que o lançou
#   ~/Controle-de-Acesso/video/capture/run-day.sh --plan     só mostra o dia e os horários e confere o repositório
#
# No primeiro erro ele para e deixa a instância como está, para a conferência. A saída vai também para
# ~/magbo-dia-AAAA-MM-DD.log. Ctrl+C interrompe; um dia com --detach para com: pkill -f '[r]un-day.sh'
# No fim, na pasta de downloads: magbo-dia.png, a folha de contato, e magbo-dia-capturas.tar.gz, a cópia das
# capturas em WebP com o manifest.json, para mandar ao revisor.
set -euo pipefail

REPO="$HOME/Controle-de-Acesso"
CAPTURE="$REPO/video/capture"
OUT="$REPO/video/public/portfolio-day"
TOKEN_FILE=/tmp/magbo-demo-token
CLOCK_DIR=/tmp/magbo-demo-clock
CLOCK_FILE="$CLOCK_DIR/faketime.rc"
REVIEW_COPY=/tmp/magbo-dia-capturas
PARIS=Europe/Paris
SAO_PAULO=America/Sao_Paulo
SECTION="the start checks"
CLOCK_OFFSET=0

# As 22 capturas do dia, que o vídeo precisa, e as 5 telas de visão geral, opcionais (overviews.mjs).
REQUIRED="login-0 login-1 dashboard portail cdi cantine-0 cantine-1 cantine-2 cantine-3 droits-0 droits-1
sorties-0 sorties-1 sorties-2 portail-sortie recherche-0 recherche-1 rapport-0 rapport-1 fin-0 fin-1 logout"
OVERVIEWS="ppms-0 ppms-1 panneau rapport-2 cdi-stats"

# O instante no relógio da demo: o real mais o offset que este script pôs por último.
demo_now() { echo $(( $(date +%s) + CLOCK_OFFSET )); }
log() { printf '%s  %s\n' "$(TZ=$PARIS date -d "@$(demo_now)" +%H:%M:%S)" "$*"; }
fail() { log "$*"; exit 1; }
compose() { (cd "$REPO" && docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml "$@"); }

# Na saída com erro: em que etapa parou, e como desligar a instância se ela ficou ligada.
on_exit() {
    local status=$?
    (( status == 0 )) && return 0
    log "STOPPED in $SECTION (exit $status)"
    if [[ -n $(docker ps -a --filter name=magbo-demo --format '{{.Names}}' 2>/dev/null || true) ]]; then
        log "the instance is left as it is, for the check. To turn it off:"
        log "  cd ~/Controle-de-Acesso && docker compose -p magbo-demo -f docker-compose.yml -f video/capture/docker-compose.demo.yml down -v && rm -f $CLOCK_FILE"
    fi
}

# Uma hora local num fuso ("2026-10-19" "11:30"), em segundos desde 1970.
epoch_at() { TZ="$1" date -d "$2 $3" +%s; }

# Um instante, em Paris e em São Paulo.
both() { printf '%s Paris, %s São Paulo' "$(LC_ALL=C TZ=$PARIS date -d "@$1" '+%a %d/%m %H:%M')" "$(TZ=$SAO_PAULO date -d "@$1" +%H:%M)"; }

# O dia de captura: a próxima segunda-feira depois de hoje. O histórico (seed-history.mjs) são os 10 dias úteis antes
# dela e termina na sexta, três dias antes: nenhuma passagem dele cai nas últimas 24 horas que as telas do Portail,
# do CDI e da cantina leem.
capture_day() {
    local day i
    day=$(date -u -d "$(TZ=$PARIS date -d "@$1" +%F) + 1 day" +%F)
    for i in 1 2 3 4 5 6 7; do
        if (( $(date -u -d "$day" +%u) == 1 )); then
            echo "$day"
            return 0
        fi
        day=$(date -u -d "$day + 1 day" +%F)
    done
    return 1
}

# Põe o relógio da demo num instante, num arquivo novo trocado de uma vez: o backend nunca lê um arquivo pela metade.
# Com o backend ligado, espera ele chegar à hora nova, porque ele relê o arquivo a cada segundo.
set_clock() {   # instante, etapa, e «before-up» antes de o backend existir
    local offset=$(( $1 - $(date +%s) )) i stamp seen
    printf '%+d\n' "$offset" > "$CLOCK_DIR/.faketime.rc.new"
    mv -f "$CLOCK_DIR/.faketime.rc.new" "$CLOCK_FILE"
    CLOCK_OFFSET=$offset
    log "clock: $(both "$1") for $2"
    [[ ${3:-} == before-up ]] && return 0
    for i in $(seq 1 20); do
        stamp=$(curl -s http://localhost:8080/api/health | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4 || true)
        if [[ -n $stamp ]]; then
            seen=$(date -d "$stamp" +%s)
            if (( seen >= $1 - 5 && seen <= $(demo_now) + 5 )); then return 0; fi
        fi
        sleep 1
    done
    fail "the backend clock did not move to $(both "$1"): it says «$stamp»"
}

# A branch certa, nenhum arquivo do git mudado e nada sobrando de outra instância demo.
check_repo() {
    local branch changed left
    branch=$(git -C "$REPO" branch --show-current)
    changed=$(git -C "$REPO" status --short --untracked-files=no)
    log "repository: $branch, $(git -C "$REPO" log --oneline -1)"
    [[ $branch == feat/portfolio-motion ]] || fail "the branch is «$branch», not feat/portfolio-motion"
    [[ -z $changed ]] || fail "files tracked by git changed: ${changed//$'\n'/; }"
    left=$(( $(docker ps -a --filter name=magbo-demo --format '{{.Names}}' | wc -l) + $(docker volume ls --filter name=magbo-demo --format '{{.Name}}' | wc -l) ))
    (( left == 0 )) || fail "$left containers or volumes of magbo-demo are left over"
    log "no magbo-demo container or volume left over"
}

b1() {
    SECTION=B.1
    log "B.1: new instance, the day's data and the two weeks before"
    check_repo
    mkdir -p "$CLOCK_DIR"
    [[ -w $CLOCK_DIR ]] || fail "$CLOCK_DIR is not writable; remove it with: sudo rm -rf $CLOCK_DIR"
    set_clock "$T1" B.1 before-up   # o backend já nasce no dia da demo
    head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$TOKEN_FILE"   # no arquivo também, para os comandos à mão
    MAGBO_DEMO_WEBHOOK_TOKEN=$(cat "$TOKEN_FILE")
    export MAGBO_DEMO_WEBHOOK_TOKEN
    compose up -d --build
    local i health=''
    for i in $(seq 1 200); do
        health=$(curl -s http://localhost:8080/api/health || true)
        if [[ $health == *'"UP"'* ]]; then break; fi
        (( i < 200 )) || fail "the backend is not UP after 10 minutes"
        sleep 3
    done
    local stamp
    stamp=$(grep -o '"timestamp":"[^"]*"' <<< "$health" | cut -d'"' -f4 || true)
    [[ -n $stamp && $(TZ=$PARIS date -d "$stamp" +%F) == "$DAY" ]] || fail "the backend clock says «$stamp», not $DAY: it is not on the simulated clock"
    log "backend UP, its clock at $(LC_ALL=C TZ=$PARIS date -d "$stamp" '+%a %d/%m %H:%M') Paris"
    (cd "$CAPTURE" && npm ci && node seed-day.mjs && node seed-history.mjs)
    rm -rf "$OUT"
}

b2() {
    SECTION=B.2
    set_clock "$T2" B.2
    log "B.2: session midi"
    (cd "$CAPTURE" && node capture-day.mjs --session midi)
}

b3() {
    SECTION=B.3
    set_clock "$T3" B.3
    log "B.3: session soir"
    (cd "$CAPTURE" && node capture-day.mjs --session soir)
}

b4() {
    SECTION=B.4
    set_clock "$T4" B.4
    # O fechamento automático roda a cada 5 minutos: em 5 min 30 s ele já passou depois das 17:00 de São Paulo.
    log "B.4: waiting 5 min 30 s for the automatic closure of 17:00 in São Paulo"
    sleep 330
    log "B.4: session cloture"
    (cd "$CAPTURE" && node capture-day.mjs --session cloture && node contact-sheet.mjs ../public/portfolio-day)
    local downloads
    downloads=$(xdg-user-dir DOWNLOAD 2>/dev/null || echo "$HOME/Downloads")
    mkdir -p "$downloads"
    cp "$OUT/contact-sheet.png" "$downloads/magbo-dia.png"
    log "contact sheet copied to $downloads/magbo-dia.png"
    # A cópia para o revisor: as capturas em WebP e o manifest, num arquivo que cabe num anexo. O render usa os PNG.
    rm -rf "$REVIEW_COPY"
    (cd "$CAPTURE" && node review-copy.mjs ../public/portfolio-day "$REVIEW_COPY")
    tar czf "$downloads/magbo-dia-capturas.tar.gz" -C "$(dirname "$REVIEW_COPY")" "$(basename "$REVIEW_COPY")"
    rm -rf "$REVIEW_COPY"
    log "review copy: $downloads/magbo-dia-capturas.tar.gz, $(du -h "$downloads/magbo-dia-capturas.tar.gz" | cut -f1)"
}

b5() {
    SECTION=B.5
    log "B.5: turn the instance off"
    compose down -v
    rm -f "$CLOCK_FILE"   # o log continua na hora da demo
    local containers volumes changed name missing='' found=''
    containers=$(docker ps -a --filter name=magbo-demo --format '{{.Names}}' | wc -l)
    volumes=$(docker volume ls --filter name=magbo-demo --format '{{.Name}}' | wc -l)
    changed=$(git -C "$REPO" status --short --untracked-files=no)
    for name in $REQUIRED; do
        if [[ ! -f $OUT/$name.png ]]; then missing+=" $name"; fi
    done
    for name in $OVERVIEWS; do
        if [[ -f $OUT/$name.png ]]; then found+=" $name"; fi
    done
    log "left over: $containers containers, $volumes volumes; files changed in git: ${changed:-none}"
    log "captures: the 22 of the day${missing:+ except$missing}; overviews:${found:- none}"
    (( containers == 0 && volumes == 0 )) || fail "something of magbo-demo is left over"
    [[ -z $missing ]] || fail "captures missing:$missing"
    [[ -f $OUT/contact-sheet.png ]] || fail "the contact sheet is missing"
    [[ -z $changed ]] || fail "files tracked by git changed"
}

main() {
    local plan=false
    case "${1:-}" in
        --plan) plan=true ;;
        '') ;;
        *) echo 'usage: run-day.sh [--plan | --detach]' >&2; exit 2 ;;
    esac

    DAY=$(capture_day "$(date +%s)")
    T1=$(epoch_at $PARIS "$DAY" 11:30)
    T2=$(epoch_at $PARIS "$DAY" 11:56)
    T3=$(epoch_at $PARIS "$DAY" 16:16)
    T4=$(epoch_at $SAO_PAULO "$DAY" 17:01)

    # A saída vai também para o log, que não para com o Ctrl+C: assim a última linha diz onde o dia parou.
    $plan || exec > >(trap '' INT; tee -a "$HOME/magbo-dia-$DAY.log") 2>&1
    log "capture day: $(LC_ALL=C date -u -d "$DAY" '+%a %d/%m/%Y'), on the simulated clock: it runs now, in about 35 minutes"
    log "  B.1  $(both "$T1")  new instance, the day's data and the two weeks before"
    log "  B.2  $(both "$T2")  session midi"
    log "  B.3  $(both "$T3")  session soir"
    log "  B.4  $(both "$T4")  the automatic closure, then the session cloture, the contact sheet and the review copy"
    log "  B.5  right after B.4  down -v and the final checks"
    check_repo
    if $plan; then
        log "plan only: nothing was started"
        return 0
    fi
    log "log file: $HOME/magbo-dia-$DAY.log"

    b1
    b2
    b3
    b4
    b5
    SECTION=end
    log "done: the captures and the contact sheet are in $OUT"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    # Com --detach, o dia roda numa sessão própria: fechar o terminal, ou o fim da sessão que o lançou, não o interrompe.
    if [[ ${1:-} == --detach ]]; then
        setsid nohup "$BASH" "$0" > /dev/null 2>&1 < /dev/null &
        echo "run-day.sh runs on its own now; follow it with: tail -f $HOME/magbo-dia-$(capture_day "$(date +%s)").log"
        exit 0
    fi
    # O dia roda sob um bloqueio de suspensão, inclusive com a tampa fechada se o sistema deixar; o --plan não precisa.
    if [[ ${1:-} != --plan && -z ${MAGBO_DAY_INHIBITED:-} ]]; then
        export MAGBO_DAY_INHIBITED=1
        for what in sleep:idle:handle-lid-switch sleep:idle; do
            if systemd-inhibit --what=$what --who=MAGBO --why='dia de captura do vídeo' true 2> /dev/null; then
                exec systemd-inhibit --what=$what --who=MAGBO --why='dia de captura do vídeo' "$BASH" "$0" "$@"
            fi
        done
        echo 'systemd-inhibit could not take the lock: the computer may suspend during the run' >&2
    fi
    trap on_exit EXIT
    trap 'exit 130' INT TERM
    main "$@"
fi
