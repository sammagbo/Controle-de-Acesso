// =====================================================================
// SELETOR DE IDIOMA — no cabeçalho, ao lado do cadeado e da engrenagem
// =====================================================================
// Fica na BARRA e não numa aba de configurações: a língua não é uma opção
// avançada, é a primeira coisa de que alguém precisa quando senta no posto e
// a tela está no idioma do turno anterior. Enterrá-la em Réglages custaria
// quatro cliques a quem tem uma fila esperando.
//
// A escolha é da MÁQUINA (localStorage), não da pessoa: os postos são fixos
// (portaria, cantina, CDI) e quem senta neles muda; o que não muda é a língua
// de quem trabalha naquele posto. Decisão registrada em js/utils/i18n.js.

function LanguageSelector() {
      const t = useI18n();
      const [aberto, setAberto] = React.useState(false);
      const atual = window.MagboI18n.getLang();
      const idiomas = window.MagboI18n.languages();
      const caixaRef = React.useRef(null);

      // Clique fora fecha. Sem isto o menu fica aberto por cima da tela de
      // trabalho até alguém acertar o botão de novo.
      React.useEffect(() => {
            if (!aberto) return undefined;
            const aoClicar = (e) => {
                  if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false);
            };
            document.addEventListener('mousedown', aoClicar);
            return () => document.removeEventListener('mousedown', aoClicar);
      }, [aberto]);

      const escolher = (code) => {
            // setLang persiste E dispara `magbo-lang-changed`, que re-renderiza
            // o app inteiro — ver js/utils/i18nReact.js.
            window.MagboI18n.setLang(code);
            setAberto(false);
      };

      return (
            <div className="relative" ref={caixaRef}>
                  <button
                        onClick={() => setAberto(a => !a)}
                        title={t('idioma.rotulo')}
                        aria-label={t('idioma.rotulo')}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors text-xs font-semibold"
                  >
                        <LucideIcon name="languages" size={14} />
                        {/* O CÓDIGO, não a bandeira: bandeira é país, não idioma
                            — e o francês desta escola não é o da França. */}
                        <span className="uppercase">{atual}</span>
                  </button>

                  {aberto && (
                        <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl border border-soft-200 shadow-lg overflow-hidden z-50">
                              {idiomas.map(l => (
                                    <button
                                          key={l.code}
                                          onClick={() => escolher(l.code)}
                                          className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                                                l.code === atual
                                                      ? 'bg-accent-50 text-accent-700 font-bold'
                                                      : 'text-navy-500 hover:bg-soft-50'
                                          }`}
                                    >
                                          <span>{l.label}</span>
                                          {l.code === atual && <LucideIcon name="check" size={14} />}
                                    </button>
                              ))}
                        </div>
                  )}
            </div>
      );
}
