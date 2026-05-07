// =====================================================================
// CONNECTION STATUS INDICATOR — React component
// =====================================================================
// Displays a live indicator in the footer:
//   🟢 Conectado         — backend is responding
//   🟡 Reconectando...   — transitioning
//   🔴 Servidor Offline  — backend is down
// =====================================================================

function ConnectionStatus() {
      const [online, setOnline] = React.useState(true);
      const [recovering, setRecovering] = React.useState(false);

      React.useEffect(() => {
            const handleLost = () => {
                  setOnline(false);
                  setRecovering(false);
            };

            const handleRestored = () => {
                  setRecovering(true);
                  // Brief "recovering" state before showing green
                  setTimeout(() => {
                        setOnline(true);
                        setRecovering(false);
                  }, 1500);
            };

            const handleStatus = (e) => {
                  // Sync state on each poll without transition animation
                  if (e.detail?.online && !online && !recovering) {
                        setRecovering(true);
                        setTimeout(() => {
                              setOnline(true);
                              setRecovering(false);
                        }, 1500);
                  }
            };

            window.addEventListener('connection-lost', handleLost);
            window.addEventListener('connection-restored', handleRestored);
            window.addEventListener('connection-status', handleStatus);

            return () => {
                  window.removeEventListener('connection-lost', handleLost);
                  window.removeEventListener('connection-restored', handleRestored);
                  window.removeEventListener('connection-status', handleStatus);
            };
      }, [online, recovering]);

      // Determine visual state
      let dotColor, label, animate;
      if (recovering) {
            dotColor = 'bg-warning-500';
            label = 'Reconectando...';
            animate = 'animate-pulse';
      } else if (online) {
            dotColor = 'bg-success-500';
            label = 'Sistema Operacional';
            animate = 'animate-pulse';
      } else {
            dotColor = 'bg-danger-500';
            label = 'Servidor Offline';
            animate = 'animate-ping';
      }

      return (
            <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${animate}`}
                        style={{ transition: 'background-color 0.3s ease' }} />
                  <span className={`text-[11px] font-medium ${online ? 'text-slate-400' : 'text-danger-500'}`}>
                        {label}
                  </span>
            </div>
      );
}
