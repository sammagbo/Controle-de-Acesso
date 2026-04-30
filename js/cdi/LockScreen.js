// =====================================================================
// CDI Lock Screen
// =====================================================================

function CdiLockScreen({ onUnlock, pin, count }) {
      const [input, setInput] = React.useState('');
      const [error, setError] = React.useState(false);

      const handleSubmit = () => {
            if (input === pin) {
                  onUnlock();
            } else {
                  setError(true);
                  setInput('');
                  setTimeout(() => setError(false), 500);
            }
      };

      return (
            <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-50">
                  <div className="text-6xl font-bold text-white mb-2">{count}</div>
                  <p className="text-slate-400 text-lg mb-8">Élèves Présents</p>
                  <CdiClock />
                  <div className="mt-10 bg-slate-800 p-6 rounded-xl">
                        <p className="text-white text-center mb-4">Code PIN</p>
                        <input
                              type="password"
                              value={input}
                              onChange={e => setInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                              className={`w-48 px-4 py-3 text-center text-2xl tracking-widest rounded-lg ${error ? 'bg-red-100' : 'bg-white'}`}
                              maxLength={6}
                              autoFocus
                        />
                        <button onClick={handleSubmit} className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
                              Déverrouiller
                        </button>
                  </div>
            </div>
      );
}
