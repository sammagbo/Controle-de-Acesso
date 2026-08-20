// =====================================================================
// ERROR BOUNDARY — a rede que faltava
// =====================================================================
// Até 20/08/2026 este projeto tinha ZERO error boundaries (medido:
// `grep -rn "componentDidCatch\|getDerivedStateFromError" js/` → 0 em 70
// arquivos). A consequência não é teórica e já aconteceu duas vezes nesta
// mesma semana:
//
//   • 48ffa19 — um hook depois de um `return null` no Toast. QUALQUER
//     notificação derrubava o aplicativo inteiro.
//   • ff93f5f — uma função sumida num merge, escondida por uma guarda.
//
// Nos dois casos o React fez o que o React faz quando um erro sobe até a
// raiz sem encontrar boundary: DESMONTA A ÁRVORE INTEIRA. A janela fica
// branca e travada, e a única saída é o X. Num posto em modo kiosk, o X
// nem está lá.
//
// ⚠️ A LIÇÃO QUE ESTE ARQUIVO EXISTE PARA GUARDAR: as duas correções acima
// trataram CAUSAS. Esta trata a CONDIÇÃO — a que transforma qualquer causa
// futura, ainda não escrita, no mesmo desastre. Uma tela quebrada deve
// custar UMA TELA, nunca o aplicativo.
//
// ---------------------------------------------------------------------
// REGRA Nº 1, E ELA NÃO É NEGOCIÁVEL: O FALLBACK NÃO PODE ESTOURAR.
// ---------------------------------------------------------------------
// Um fallback que lança dentro de um boundary sobe para o boundary de cima
// — e se for o da raiz, volta a tela branca, agora com a rede acionada e
// inútil. Por isso, aqui dentro:
//
//   • NADA de <LucideIcon>. Se o lucide não carregou (kiosk sem libs/,
//     ordem de <script> trocada), o ícone é justamente o que falta — e o
//     erro seria o mesmo que estamos tentando exibir. Os ícones aqui são
//     SVG inline.
//   • NADA de useI18n(): é hook, e classe não tem hook. A tradução passa
//     por `texto()`, que é try/catch com francês cravado no fim. Se o
//     dicionário sumiu, a tela ainda fala francês — feio, mas legível.
//   • NADA de window.userCache, window.api, ACCESS_POINTS ou qualquer
//     dado. O fallback só conhece o que recebeu por prop.
// =====================================================================

/**
 * Texto do fallback, à prova de i18n quebrado.
 *
 * ⚠️ O `padrao` (francês) não é redundância: é o que aparece se
 * js/utils/i18n.js não carregou, se a chave não existe nos dois
 * dicionários, ou se `t` lançar. A escola opera em francês — a degradação
 * correta é francês cravado, nunca a chave crua e nunca vazio.
 */
function textoDeErro(chave, padrao) {
      try {
            const traduzido = window.MagboI18n && window.MagboI18n.t(chave);
            // `t` devolve a PRÓPRIA CHAVE quando ela não existe (decisão de
            // js/utils/i18n.js). Numa tela de erro isso é ruído: preferimos o
            // francês cravado a "erro.titulo" no meio do aviso.
            if (traduzido && traduzido !== chave) return traduzido;
      } catch (e) {
            /* i18n quebrado é exatamente um dos casos que este componente cobre */
      }
      return padrao;
}

/** Ícone de alerta em SVG inline — ver REGRA Nº 1: nada de lucide aqui. */
function IconeAlerta({ size = 22, className = '' }) {
      return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                 strokeLinejoin="round" className={className} aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
      );
}

/**
 * ErrorBoundary — captura o erro de renderização da sua subárvore.
 *
 * Props:
 *   nom        — nome LEGÍVEL da tela/janela (aparece no aviso). Sem ele o
 *                operador lê "un écran" e não sabe qual reportar.
 *   variante   — 'ecran' (padrão) · 'modal' · 'discret'
 *   onRetour   — ação do botão de volta. Sem ela o botão não aparece (um
 *                botão que não faz nada é pior que a ausência dele).
 *   labelRetour— rótulo do botão de volta.
 *   resetKey   — quando MUDA, o boundary volta a tentar renderizar. É o que
 *                faz a troca de tela limpar o erro da tela anterior; sem
 *                isto, o boundary ficaria preso no fallback para sempre.
 *
 * A variante 'discret' existe para o CROMO (Toast, ConnectionStatus,
 * rodapé): coisas montadas em toda tela, cuja falha não deve roubar a tela
 * de quem está trabalhando. Ela não desenha NADA — só registra. Um aviso
 * vermelho permanente no rodapé por causa de um sino quebrado seria a
 * segunda maneira de estragar a tela.
 */
class ErrorBoundary extends React.Component {
      constructor(props) {
            super(props);
            this.state = { erro: null, pilha: null, aberto: false };
      }

      static getDerivedStateFromError(erro) {
            return { erro: erro };
      }

      componentDidCatch(erro, info) {
            const nome = this.props.nom || '?';
            // Console é o único destino: NÃO existe telemetria neste projeto e
            // não é esta a entrega que a introduz. A mensagem de erro pode
            // conter nome de aluno — ela fica no console local do posto, que é
            // onde já estaria de qualquer forma.
            try {
                  console.error('[ErrorBoundary] ' + nome, erro, info && info.componentStack);
                  // Guardado para quem for depurar depois pelo DevTools do posto.
                  window.__magboLastError = {
                        ecran: nome,
                        mensagem: erro && erro.message ? String(erro.message) : String(erro),
                        pilha: info && info.componentStack ? info.componentStack : null,
                        quando: new Date().toISOString()
                  };
            } catch (e) { /* nunca deixar o registro derrubar o fallback */ }
            this.setState({ pilha: info && info.componentStack ? info.componentStack : null });
      }

      componentDidUpdate(prevProps) {
            // Trocou de tela → esquece o erro da anterior e tenta de novo.
            if (this.state.erro && prevProps.resetKey !== this.props.resetKey) {
                  this.setState({ erro: null, pilha: null, aberto: false });
            }
      }

      render() {
            if (!this.state.erro) return this.props.children;

            const variante = this.props.variante || 'ecran';
            if (variante === 'discret') return null;

            const nome = this.props.nom || textoDeErro('erro.ecran.desconhecido', 'cet écran');
            const detalhe = (() => {
                  const e = this.state.erro;
                  const msg = e && e.message ? String(e.message) : String(e);
                  return msg + (this.state.pilha ? '\n' + this.state.pilha : '');
            })();

            const corpo = (
                  <div className="bg-white rounded-2xl shadow-xl border border-danger-200 overflow-hidden">
                        <div className="flex items-start gap-4 p-6">
                              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-danger-100 flex items-center justify-center text-danger-600">
                                    <IconeAlerta size={24} />
                              </div>
                              <div className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-navy-500">
                                          {variante === 'modal'
                                                ? textoDeErro('erro.modal.titulo', "Cette fenêtre n'a pas pu s'afficher")
                                                : textoDeErro('erro.titulo', "Cet écran n'a pas pu s'afficher")}
                                    </h2>
                                    <p className="text-sm text-slate-600 mt-1">
                                          {textoDeErro('erro.subtitulo', "Le reste de l'application continue de fonctionner.")}
                                    </p>

                                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-soft-100 border border-soft-200">
                                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                                {textoDeErro('erro.ecran', 'Écran concerné')}
                                          </span>
                                          <span className="text-sm font-bold text-navy-500">{nome}</span>
                                    </div>

                                    {/* A frase que evita o telefonema. Um erro de tela neste
                                        sistema é de LEITURA: as passagens já estão gravadas,
                                        e quem opera precisa saber disso antes de refazer o
                                        trabalho por medo de ter perdido alguma coisa. */}
                                    <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                                          {textoDeErro('erro.aviso.dados', "Aucune donnée n'a été perdue : cet écran ne fait qu'afficher des enregistrements déjà en base.")}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-2 mt-5">
                                          {this.props.onRetour && (
                                                <button
                                                      onClick={() => { try { this.props.onRetour(); } catch (e) { console.error(e); } }}
                                                      className="px-4 py-2 rounded-xl bg-navy-500 text-white text-sm font-semibold hover:bg-navy-600 transition-colors">
                                                      {this.props.labelRetour || textoDeErro('erro.voltar', 'Retour au tableau de bord')}
                                                </button>
                                          )}
                                          <button
                                                onClick={() => this.setState({ erro: null, pilha: null, aberto: false })}
                                                className="px-4 py-2 rounded-xl bg-white border border-soft-300 text-navy-500 text-sm font-semibold hover:bg-soft-100 transition-colors">
                                                {textoDeErro('erro.reessayer', 'Réessayer')}
                                          </button>
                                          <button
                                                onClick={() => { try { window.location.reload(); } catch (e) { /* noop */ } }}
                                                className="px-4 py-2 rounded-xl bg-white border border-soft-300 text-slate-500 text-sm font-medium hover:bg-soft-100 transition-colors">
                                                {textoDeErro('erro.recarregar', "Recharger l'application")}
                                          </button>
                                    </div>

                                    <button
                                          onClick={() => this.setState(s => ({ aberto: !s.aberto }))}
                                          className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">
                                          {this.state.aberto
                                                ? textoDeErro('erro.detalhe.esconder', 'Masquer les détails techniques')
                                                : textoDeErro('erro.detalhe.mostrar', 'Détails techniques')}
                                    </button>

                                    {this.state.aberto && (
                                          <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-200 text-[10px] leading-relaxed overflow-auto max-h-56 whitespace-pre-wrap">
                                                {detalhe}
                                          </pre>
                                    )}
                              </div>
                        </div>
                  </div>
            );

            if (variante === 'modal') {
                  return (
                        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-navy-900/40 p-4">
                              <div className="w-full max-w-lg">{corpo}</div>
                        </div>
                  );
            }

            return (
                  <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">{corpo}</div>
            );
      }
}

// O app não tem bundler: os componentes são globais léxicos (o Babel
// converte `class` em `var`, como faz com o `const` de constants.js). A
// atribuição explícita abaixo é para quem procura `window.` — e para o
// teste de fiação, que lê o índice sem executar o React.
window.ErrorBoundary = ErrorBoundary;
