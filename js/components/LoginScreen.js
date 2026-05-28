// =====================================================================
// LOGIN SCREEN
// =====================================================================
// Tela inicial antes de qualquer acesso ao app.
// Bloqueia tudo até autenticar via /api/auth/login.
// Design: institucional inspirado no Lycée Molière (paleta turquesa + navy).

function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await window.auth.login(username.trim(), password);
      await window.userCache?.reload();
      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0C1B3A' }}>

      {/* ============ COLUNA ESQUERDA — Identidade ============ */}
      <div className="hidden md:flex md:flex-col justify-between p-12 lg:p-16 relative"
           style={{ width: '47%', background: '#0C1B3A' }}>

        {/* Tag superior */}
        <div>
          <div className="h-0.5 w-16 mb-3" style={{ background: '#48C3D2' }}></div>
          <span className="font-serif text-xs tracking-[0.3em]" style={{ color: '#48C3D2' }}>
            CONTRÔLE D'ACCÈS
          </span>
        </div>

        {/* Ilustração linha contínua (chave) — centralizada verticalmente */}
        <div className="flex justify-start items-center flex-1 my-8">
          <svg width="280" height="120" viewBox="0 0 280 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Selo circular externo */}
            <circle cx="60" cy="60" r="50" stroke="#48C3D2" strokeWidth="2.5" fill="none"/>
            {/* Anel interno decorativo */}
            <circle cx="60" cy="60" r="40" stroke="#48C3D2" strokeWidth="0.6" fill="none"/>
            {/* M duas montanhas estilo Molière, em branco */}
            <path d="M 38 85 Q 38 35 50 35 Q 60 35 60 60 Q 60 35 70 35 Q 82 35 82 85"
                  stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            {/* Haste de chave saindo do selo pra direita */}
            <path d="M 110 60 L 200 60 L 200 78 L 183 78 L 183 69 L 170 69"
                  stroke="#48C3D2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>

        {/* Bloco de marca */}
        <div>
          <h1 className="font-serif text-5xl lg:text-6xl font-medium text-white tracking-wider mb-2">
            MAGBO
          </h1>
          <p className="font-script text-2xl mb-5" style={{ color: '#48C3D2' }}>
            Access Control
          </p>
          <div className="h-px w-32 mb-4" style={{ background: '#48C3D2' }}></div>
          <p className="font-serif italic text-sm text-white/85 leading-relaxed">
            Système institutionnel de contrôle<br/>
            d'accès multi-secteurs
          </p>
        </div>

        {/* Footer institucional */}
        <div className="mt-8">
          <div className="h-0.5 w-8 mb-2" style={{ background: '#48C3D2' }}></div>
          <a
  href="https://www.lyceemoliere.com.br/"
  target="_blank"
  rel="noopener noreferrer"
  className="font-serif text-[10px] tracking-[0.2em] mb-1 block hover:opacity-80 transition cursor-pointer"
  style={{ color: '#48C3D2', fontWeight: 600, textDecoration: 'none' }}>
            LYCÉE MOLIÈRE · RIO DE JANEIRO
          </a>
          <p className="font-serif italic text-[10px] text-white/60">
            Anno MMXXVI · v1.0
          </p>
          <a
            href="https://sammagbo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-script text-sm mt-2 inline-block hover:opacity-80 transition cursor-pointer"
            style={{ color: '#48C3D2', textDecoration: 'none' }}>
            sammagbo.com
          </a>
        </div>
      </div>

      {/* ============ COLUNA DIREITA — Formulário ============ */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16"
           style={{ background: '#F7F4ED' }}>
        <div className="w-full max-w-md">

          {/* Tag superior direita (visível apenas no desktop) */}
          <div className="hidden md:flex justify-end items-center gap-2 mb-12">
            <span className="font-serif italic text-xs tracking-widest" style={{ color: '#0C1B3A' }}>
              Identification
            </span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#48C3D2' }}></div>
          </div>

          {/* Título do formulário */}
          <h2 className="font-serif text-3xl lg:text-4xl font-medium mb-2" style={{ color: '#0C1B3A' }}>
            Bienvenue
          </h2>
          <p className="font-serif italic text-sm mb-2" style={{ color: '#1F2D52' }}>
            Veuillez vous identifier pour accéder
          </p>
          <div className="h-0.5 w-8 mb-10" style={{ background: '#48C3D2' }}></div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Campo Identifiant */}
            <div>
              <label className="block font-serif italic text-xs tracking-[0.2em] mb-2"
                     style={{ color: '#0C1B3A' }}>
                IDENTIFIANT
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                disabled={loading}
                className="w-full px-4 py-3 bg-white border font-serif text-base focus:outline-none focus:ring-2 transition disabled:opacity-50"
                style={{ borderColor: '#0C1B3A', color: '#0C1B3A' }}
                placeholder="admin"
              />
            </div>

            {/* Campo Mot de passe */}
            <div>
              <label className="block font-serif italic text-xs tracking-[0.2em] mb-2"
                     style={{ color: '#0C1B3A' }}>
                MOT DE PASSE
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-white border font-serif text-base focus:outline-none focus:ring-2 transition disabled:opacity-50"
                style={{ borderColor: '#0C1B3A', color: '#0C1B3A' }}
              />
            </div>

            {/* Mensagem de erro */}
            {error && (
              <div className="px-4 py-3 border-l-2 font-serif text-sm"
                   style={{ background: '#FEF2F2', borderColor: '#DC2626', color: '#991B1B' }}>
                {error}
              </div>
            )}

            {/* Botão Accéder */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 font-serif italic tracking-[0.4em] text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
              style={{ background: '#0C1B3A', color: '#F7F4ED' }}
            >
              {loading ? 'CONNEXION...' : (
                <>
                  ACCÉDER
                  <svg width="14" height="12" viewBox="0 0 14 12" fill="none"
                       className="transition-transform group-hover:translate-x-1">
                    <path d="M 1 6 L 12 6 M 8 2 L 12 6 L 8 10"
                          stroke="#48C3D2" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer direito */}
          <div className="mt-12">
            <div className="h-0.5 w-8 mb-2" style={{ background: '#0C1B3A' }}></div>
            <p className="font-serif text-[10px] tracking-widest mb-1" style={{ color: '#1F2D52', fontWeight: 600 }}>
              SYSTÈME SÉCURISÉ · CONNEXION CHIFFRÉE
            </p>
            <a
  href="https://sammagbo.com"
  target="_blank"
  rel="noopener noreferrer"
  className="font-script text-base hover:opacity-80 transition cursor-pointer inline-block"
  style={{ color: '#48C3D2', textDecoration: 'none' }}>
              MAGBO Studio · 2026
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
