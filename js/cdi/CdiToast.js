// =====================================================================
// CDI Toast Notification
// =====================================================================

function CdiToast({ message, type, onClose }) {
      React.useEffect(() => {
            const t = setTimeout(onClose, 2500);
            return () => clearTimeout(t);
      }, []);

      return (
            <div className={`toast fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${type === 'in' || type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                  <CdiIcon name={type === 'in' ? 'log-in' : type === 'success' ? 'check' : 'log-out'} size={18} />
                  {message}
            </div>
      );
}
