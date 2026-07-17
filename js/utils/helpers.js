// =====================================================================
// LUCIDE ICON COMPONENT
// =====================================================================

function LucideIcon({ name, size = 24, className = '', strokeWidth = 2 }) {
      const ref = React.useRef(null);
      React.useEffect(() => {
            if (ref.current) {
                  ref.current.innerHTML = '';
                  try {
                        const iconNode = lucide.createElement(lucide.icons[toPascalCase(name)]);
                        iconNode.setAttribute('width', size);
                        iconNode.setAttribute('height', size);
                        iconNode.setAttribute('stroke-width', strokeWidth);
                        if (className) {
                              className.split(' ').forEach(c => { if (c) iconNode.classList.add(c); });
                        }
                        ref.current.appendChild(iconNode);
                  } catch (e) {
                        const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        fallback.setAttribute('width', size);
                        fallback.setAttribute('height', size);
                        fallback.setAttribute('viewBox', '0 0 24 24');
                        fallback.setAttribute('fill', 'none');
                        fallback.setAttribute('stroke', 'currentColor');
                        fallback.setAttribute('stroke-width', strokeWidth);
                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', '3'); rect.setAttribute('y', '3');
                        rect.setAttribute('width', '18'); rect.setAttribute('height', '18');
                        rect.setAttribute('rx', '2');
                        fallback.appendChild(rect);
                        ref.current.appendChild(fallback);
                  }
            }
      }, [name, size, className, strokeWidth]);
      return <span ref={ref} className="inline-flex items-center justify-center" />;
}

function toPascalCase(str) {
      return str.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Null-safe date parser. Returns a valid timestamp (ms) or Date.now() as fallback.
 * Prevents NaN from propagating through timer/log math.
 */
function safeDateParse(val) {
      if (!val) return Date.now();
      const ms = new Date(val).getTime();
      return isNaN(ms) ? Date.now() : ms;
}

function formatTime(date) {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--:--:--';
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms) {
      if (ms == null || isNaN(ms) || ms < 0) return '00m 00s';
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
      return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

/** Default fallback for missing TIPO_LABELS entries */
const TIPO_LABEL_FALLBACK = { label: 'Desconhecido', color: 'bg-slate-400', textColor: 'text-white' };

/** Palette for local avatars (MAGBO tokens) — deterministic per seed */
const AVATAR_BG_COLORS = ['#2E3F66', '#3AA3B0', '#2563EB', '#059669', '#D97706', '#576585'];

/** Local avatar generator (F7c) — inline SVG data-URI with initials, zero network.
 *  Replaces the api.dicebear.com fallback (broken images on offline kiosk). */
function localAvatar(seed, bg) {
      const s = String(seed || '?').trim() || '?';
      const parts = s.split(/\s+/).filter(Boolean);
      const initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : s.slice(0, 2))
            .toUpperCase().replace(/[&<>]/g, '?');
      let hash = 0;
      for (let i = 0; i < s.length; i++) hash = (hash + s.charCodeAt(i)) % 997;
      const fill = bg || AVATAR_BG_COLORS[hash % AVATAR_BG_COLORS.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${fill}"/><text x="32" y="32" dy=".35em" text-anchor="middle" font-family="Inter, sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">${initials}</text></svg>`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
window.localAvatar = localAvatar;

/** Default avatar for broken/missing images (local SVG — F7c) */
const DEFAULT_AVATAR = localAvatar('?', '#94a3b8');

/** onError handler for <img> tags — swaps to default avatar */
function handleImgError(e) {
      e.target.onerror = null; // prevent infinite loop
      e.target.src = DEFAULT_AVATAR;
}

function isPortaria(pointId) {
      return pointId.startsWith('PORT');
}

function isEspecial(pointId) {
      return pointId === 'BIBLIO' || pointId === 'ENFERM';
}
