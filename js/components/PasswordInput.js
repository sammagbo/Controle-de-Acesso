// =====================================================================
// CAMPO DE SENHA COM OLHO — revela enquanto pressionado o botão
// =====================================================================
// Um componente para TODOS os campos de senha (login, criar operador,
// trocar senha): três implementações do mesmo olho divergiriam na primeira
// manutenção — a lição repetida da Fase H.
//
// O olho ALTERNA (clique liga/desliga) em vez de "segurar para ver": o
// operador da portaria digita com uma mão segurando o crachá de visitante na
// outra. A senha voltada a esconder no BLUR do campo não foi implementada de
// propósito — fechar o olho quando o foco sai esconderia a senha no meio da
// conferência, que é exatamente quando o olho serve.

function PasswordInput({ value, onChange, id, name, placeholder, autoComplete = 'current-password',
      required = false, disabled = false, className = '', style = null, inputRef = null, onKeyDown = null }) {
      const [visivel, setVisivel] = React.useState(false);
      const t = useI18n();

      return (
            <div className="relative">
                  <input
                        ref={inputRef}
                        id={id}
                        name={name}
                        // A ÚNICA diferença entre os estados é o type — valor,
                        // cursor e foco ficam onde estavam.
                        type={visivel ? 'text' : 'password'}
                        value={value}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        autoComplete={autoComplete}
                        required={required}
                        disabled={disabled}
                        className={className + ' pr-11'}
                        style={style}
                  />
                  <button
                        type="button"
                        onClick={() => setVisivel(v => !v)}
                        disabled={disabled}
                        // tabIndex -1: o Tab vai do campo de senha direto para o
                        // botão de entrar — o olho é auxílio de mouse, não parada
                        // obrigatória do teclado.
                        tabIndex={-1}
                        title={t(visivel ? 'senha.ocultar' : 'senha.mostrar')}
                        aria-label={t(visivel ? 'senha.ocultar' : 'senha.mostrar')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy-500 transition-colors disabled:opacity-40"
                  >
                        <LucideIcon name={visivel ? 'eye-off' : 'eye'} size={18} />
                  </button>
            </div>
      );
}
