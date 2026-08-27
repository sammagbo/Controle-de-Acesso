// =====================================================================
// CONFIGURATION DU SYSTÈME — tout ce qui se règle, au même endroit
// =====================================================================
// ⚠️ CE QU'IL Y A ICI N'EST PAS UNE PRÉFÉRENCE D'AFFICHAGE. Ces valeurs
// décident si une passage est signalée, si le CDI se dit plein, quelles
// classes disparaissent du Moniteur. Chaque ligne dit donc TROIS choses et
// pas une : ce qui s'applique maintenant, ce qui s'appliquerait sans
// intervention (le défaut), et QUI a décidé autrement.
//
// ⚠️ « REVENIR AU DÉFAUT » EST UN BOUTON, pas une manœuvre. Vider le champ
// supprime la ligne en base et le code reprend la main — c'est le contrat de
// la V024, et il ne vaut que si on peut y revenir sans savoir quelle était la
// valeur d'origine.
//
// ⚠️ AUCUN SECRET NE PASSE PAR ICI. Jetons, mots de passe et clé JWT vivent
// dans l'environnement (`.env` de la VM, `setx` du PC). Un écran qui les
// afficherait les mettrait sur une capture d'écran le jour même.
//
// ⚠️ La LECTURE est derrière `CONFIG_WRITE`, comme l'écriture. Il n'y a pas de
// donnée personnelle ici, mais il y a la carte complète du comportement du
// système, et cette carte est un sujet d'administration.

/**
 * Le libellé d'un domaine, avec repli sur son nom brut.
 *
 * ⚠️ Sans repli, un domaine ajouté côté serveur afficherait la clé i18n crue
 * `config.dominio.xxx` en titre de section — la même faute que `comum.voltar`
 * a déjà commise à l'écran, et qu'aucune suite ne voit.
 */
function rotuloDominio(t, dom) {
    const k = 'config.dominio.' + dom;
    const r = t(k);
    return r === k ? dom : r;
}

function SystemConfiguration({ onBack }) {
    const t = useI18n();
    const [linhas, setLinhas] = React.useState(null);
    const [erro, setErro] = React.useState(null);
    const [rascunho, setRascunho] = React.useState({});   // chave -> valeur en cours d'édition
    const [ocupado, setOcupado] = React.useState(null);   // chave en cours d'écriture

    const pode = window.MagboPermissions
        ? window.MagboPermissions.canWrite(window.auth, 'CONFIG_WRITE')
        : false;

    const carregar = React.useCallback(async () => {
        try {
            setLinhas(await window.api.fetchSettingsCatalogue());
            setErro(null);
        } catch (e) {
            setErro((e && e.message) || t('config.erro'));
        }
    }, []);

    React.useEffect(() => { if (pode) carregar(); }, [carregar, pode]);

    const gravar = async (chave, valor) => {
        setOcupado(chave);
        try {
            await window.api.saveSetting(chave, valor);
            // ⚠️ On RELIT au lieu de patcher l'état local. Le serveur peut
            // avoir normalisé, refusé, ou renvoyé au défaut ; afficher ce
            // qu'on croit avoir écrit ferait mentir l'écran sur ce qui
            // s'applique réellement.
            await carregar();
            setRascunho(r => { const n = { ...r }; delete n[chave]; return n; });
        } catch (e) {
            alert(t('config.erro') + ' ' + ((e && e.message) || ''));
        } finally {
            setOcupado(null);
        }
    };

    if (!pode) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <button onClick={onBack} className="text-xs font-bold text-slate-500 mb-4">
                    {t('header.voltar')}
                </button>
                <p className="text-sm text-slate-600 bg-soft-100 border border-soft-200 rounded-xl px-4 py-3">
                    {t('config.sem.permissao')}
                </p>
            </div>
        );
    }

    const dominios = [];
    (linhas || []).forEach(l => { if (!dominios.includes(l.dominio)) dominios.push(l.dominio); });

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 animate-fade-in space-y-5">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-navy-500">
                    {t('header.voltar')}
                </button>
                <div className="w-12 h-12 rounded-2xl bg-navy-500/10 flex items-center justify-center">
                    <LucideIcon name="sliders-horizontal" size={26} className="text-navy-500" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-navy-500">{t('config.titulo')}</h2>
                    <p className="text-sm text-slate-400">{t('config.subtitulo')}</p>
                </div>
            </div>

            <p className="text-xs text-slate-600 bg-soft-100 border border-soft-200 rounded-xl px-3 py-2">
                {t('config.aviso')}
            </p>

            {erro && (
                <p className="text-sm text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-4 py-3">
                    {erro}
                </p>
            )}

            {linhas === null ? (
                <p className="text-sm text-slate-400">{t('comum.conectando')}</p>
            ) : dominios.map(dom => (
                <div key={dom} className="space-y-2">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pt-2">
                        {rotuloDominio(t, dom)}
                    </h3>
                    {linhas.filter(l => l.dominio === dom).map(l => (
                        <ConfigLinha key={l.chave} linha={l}
                            rascunho={rascunho[l.chave]}
                            onRascunho={v => setRascunho(r => ({ ...r, [l.chave]: v }))}
                            ocupado={ocupado === l.chave}
                            onGravar={v => gravar(l.chave, v)} />
                    ))}
                </div>
            ))}
        </div>
    );
}

/**
 * UNE LIGNE DE RÉGLAGE.
 *
 * ⚠️ Au scope du module. Définie dans le parent, elle recevrait un type React
 * neuf à chaque frappe : React démonterait le champ et le curseur sauterait
 * après chaque caractère. C'est la maladie qui a coûté cinq remontages dans
 * CantineMonitor, et un écran de formulaires est précisément là où elle fait
 * le plus mal.
 */
function ConfigLinha({ linha, rascunho, onRascunho, ocupado, onGravar }) {
    const t = useI18n();
    const emEdicao = rascunho !== undefined;
    const valor = emEdicao ? rascunho : (linha.valor || '');
    const mudou = emEdicao && String(rascunho) !== String(linha.valor || '');

    // Un orphelin n'a pas de défaut : il n'est plus déclaré nulle part.
    const orfao = linha.dominio === 'orphelins';
    const rotulo = t('config.chave.' + linha.chave);
    const nome = rotulo === 'config.chave.' + linha.chave ? linha.chave : rotulo;

    const campo = () => {
        if (linha.tipo === 'CHOIX') {
            return (
                <select value={valor} onChange={e => onRascunho(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-soft-200 text-sm">
                    {(linha.opcoes || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            );
        }
        return (
            <input
                type={linha.tipo === 'INT' ? 'number' : (linha.tipo === 'HEURE' ? 'time' : 'text')}
                /* ⚠️ `min` : sans lui on saisissait 0 dans « capacité du CDI »
                   et le serveur l'acceptait — la salle se déclarait pleine en
                   permanence. Le serveur refuse maintenant aussi ; ceci évite
                   d'avoir à essayer pour l'apprendre. */
                min={linha.tipo === 'INT' ? 1 : undefined}
                value={valor}
                onChange={e => onRascunho(e.target.value)}
                placeholder={linha.tipo === 'CSV' ? '6E1, 5A2' : ''}
                className={`px-3 py-2 rounded-xl border border-soft-200 text-sm ${
                    linha.tipo === 'INT' ? 'w-28 text-center font-black' : 'w-64'}`}
            />
        );
    };

    return (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 border ${
            orfao ? 'bg-amber-50 border-amber-300'
                  : linha.modificado ? 'bg-white border-accent-300' : 'bg-white border-soft-200'}`}>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-500">{nome}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{linha.chave}</p>
            </div>

            {campo()}

            {/* ⚠️ Le DÉFAUT est écrit à côté du champ, toujours, même quand il
                n'a pas été touché. « Quelle était la valeur avant ? » est la
                question qu'on se pose au pire moment, un vendredi soir. */}
            <div className="text-right min-w-40">
                {orfao ? (
                    <p className="text-[11px] font-bold text-amber-700">{t('config.orfao')}</p>
                ) : (
                    <p className="text-[11px] text-slate-400">
                        {t('config.padrao')} <span className="font-bold text-slate-500">
                            {linha.padrao === '' ? t('config.vazio') : linha.padrao}
                        </span>
                    </p>
                )}
                {linha.modificado && (
                    <p className="text-[11px] text-accent-600 font-bold truncate">
                        {t('config.por', {
                            quem: linha.updatedBy,
                            quando: String(linha.updatedAt || '').slice(0, 16).replace('T', ' ')
                        })}
                    </p>
                )}
            </div>

            <button type="button" disabled={!mudou || ocupado} onClick={() => onGravar(valor)}
                className="text-xs font-bold text-white bg-navy-500 px-3 py-2 rounded-xl disabled:opacity-30">
                {t('config.gravar')}
            </button>

            {/* Revenir au défaut : vider la valeur supprime la ligne. */}
            <button type="button" disabled={!linha.modificado || ocupado}
                onClick={() => onGravar('')}
                className="text-xs font-bold text-slate-500 hover:text-danger-600 px-2 py-2 disabled:opacity-20">
                {t('config.repor')}
            </button>
        </div>
    );
}
