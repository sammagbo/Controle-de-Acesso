// =====================================================================
// LISTA LONGA COM TETO DE RENDERIZAÇÃO — componente compartilhado
// =====================================================================
// Por que existe: uma lista sem limite empurra o botão de confirmar para fora
// da tela e, com mil linhas, deixa a janela intransitável — foi assim que a
// tela de Configurações ficou impossível de fechar em produção. O relatório do
// HikCentral chega a 1197 linhas (numa reimportação, todas caem em "ignorar"),
// e montar isso de uma vez trava a janela do Electron por segundos. O restante
// fica a um clique de distância — cortar o dado seria mentir sobre o tamanho
// do problema.
//
// Estava dentro do AppSettingsModal.js. Saiu de lá quando a importação de
// direitos de refeição passou a precisar do mesmo teto: usá-lo de outro
// arquivo dependia de o AppSettingsModal.js já ter executado, e ele carrega
// DEPOIS no index.html. Dependência implícita na ordem errada é exatamente a
// classe de defeito que derrubou a tela de Sorties em 06/08.
//
// A aritmética vive em js/utils/listPaging.js, com teste — um off-by-one aqui
// mostra "200 de 1197" quando são 199, ou esconde a última linha.

function ListaLimitada({ titulo, total, children, alturaMax = 'max-h-[38vh]', classeTitulo = 'text-slate-600' }) {
      const t = useI18n();
    const paging = window.MagboListPaging;
    const [mostrando, setMostrando] = React.useState(paging.LINHAS_POR_PAGINA);

    // Arquivo novo (total diferente) volta a mostrar do começo.
    React.useEffect(() => { setMostrando(paging.LINHAS_POR_PAGINA); }, [total]);

    const estado = paging.pageState(total, mostrando);

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                {/* Classe inteira vinda por prop: o Tailwind do projeto é o Play
                    CDN, e nome de classe montado em runtime é frágil demais
                    para depender dele numa tela crítica. */}
                <p className={`text-xs font-bold ${classeTitulo}`}>{titulo}</p>
                <span className="text-[11px] text-slate-400 tabular-nums">{estado.rotulo}</span>
            </div>
            {/* SEM `overscroll-contain` aqui de propósito: numa lista curta,
                ele impede a rolagem de continuar para a área de conteúdo ao
                chegar no fim, e a tela parece travada — a sensação exata que
                se está corrigindo. */}
            <div className={`${alturaMax} overflow-y-auto rounded-xl border border-soft-200 bg-white`}>
                {typeof children === 'function' ? children(estado.visiveis) : children}
            </div>
            {estado.truncada && (
                <button
                    type="button"
                    onClick={() => setMostrando(m => paging.nextChunk(m, total))}
                    className="mt-2 w-full py-2 rounded-xl bg-soft-100 text-navy-500 text-xs font-bold hover:bg-soft-200 transition-colors"
                >
                    {t('lista.mais')} {estado.proximoLote} {t('lista.faltam')} {estado.restantes})
                </button>
            )}
        </div>
    );
}
