// =====================================================================
// CDI Icon & Clock Components
// =====================================================================

const CdiIcon = ({ name, size = 20 }) => {
      const ref = React.useRef(null);
      React.useEffect(() => {
            if (ref.current && name) {
                  ref.current.innerHTML = '';
                  try {
                        const parts = name.split('-');
                        const pascalName = parts.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
                        if (lucide[pascalName]) {
                              const svg = lucide.createElement(lucide[pascalName]);
                              svg.setAttribute('width', size);
                              svg.setAttribute('height', size);
                              ref.current.appendChild(svg);
                        }
                  } catch (e) {
                        console.error("CdiIcon render error:", e);
                  }
            }
      }, [name, size]);
      return <span ref={ref} className="inline-flex" />;
};

const CdiClock = () => {
      const [time, setTime] = React.useState('--:--');
      React.useEffect(() => {
            const u = () => setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
            u();
            const i = setInterval(u, 60000);
            return () => clearInterval(i);
      }, []);
      return <span className="font-mono text-slate-600">{time}</span>;
};
