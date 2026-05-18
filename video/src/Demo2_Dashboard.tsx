import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const NAVY = '#0C1B3A';
const TURQUOISE = '#48C3D2';
const BG = '#F8FAFC';

const POINTS = [
  {icon: '🏛️', name: 'Portail Principal', subtitle: 'Entrada Principal', color: '#3B82F6'},
  {icon: '🏛️', name: 'Portail Terrain', subtitle: 'Entrada Lateral Norte', color: '#3B82F6'},
  {icon: '🚗', name: 'Garage', subtitle: 'Entrada Lateral Sul', color: '#3B82F6'},
  {icon: '📚', name: 'CDI — Biblioteca', subtitle: 'Centre de Documentation', color: '#F59E0B'},
  {icon: '🏥', name: 'Infirmerie', subtitle: 'Enfermaria', color: '#F59E0B'},
  {icon: '🍽️', name: 'Cantine Principale', subtitle: 'Refeitório 1', color: '#10B981'},
];

export const Demo2_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 30], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [310, 350], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const getCardOpacity = (idx: number) => {
    const start = 30 + idx * 15;
    return interpolate(frame, [start, start + 25], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  };

  const getCardY = (idx: number) => {
    const start = 30 + idx * 15;
    return interpolate(frame, [start, start + 25], [20, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  };

  const hoveredCard = frame >= 180 && frame < 300 ? Math.floor((frame - 180) / 20) : -1;

  return (
    <AbsoluteFill style={{backgroundColor: BG, opacity: fadeIn * fadeOut, fontFamily: 'Inter, sans-serif'}}>
      {/* TOPBAR */}
      <div style={{backgroundColor: NAVY, height: 90, display: 'flex', alignItems: 'center', padding: '0 40px', color: 'white'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <svg width="50" height="50" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" stroke={TURQUOISE} strokeWidth="3" fill="none" />
            <path d="M 30 70 Q 30 30 40 30 Q 50 30 50 50 Q 50 30 60 30 Q 70 30 70 70" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div>
            <div style={{fontSize: 24, fontWeight: 700}}>MAGBO Access Control</div>
            <div style={{fontSize: 14, opacity: 0.7}}>Lycée Molière</div>
          </div>
        </div>
        <div style={{marginLeft: 'auto', display: 'flex', gap: 32, alignItems: 'center'}}>
          <div style={{padding: '12px 24px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 16, fontWeight: 600}}>⊞ Dashboard</div>
          <div style={{fontSize: 14, textAlign: 'right'}}>
            <div>qui., 14 de mai. de 2026</div>
            <div style={{fontSize: 20, fontWeight: 600}}>15:49:16</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{padding: '32px 40px 16px', display: 'flex', gap: 24}}>
        {[
          {label: 'MOVIMENTAÇÕES HOJE', value: '0'},
          {label: 'CADASTRADOS', value: '11'},
          {label: 'PONTOS DE ACESSO', value: '7'},
        ].map((kpi, i) => (
          <div key={i} style={{flex: 1, backgroundColor: 'white', padding: '20px 24px', borderRadius: 12, border: '1px solid #E2E8F0'}}>
            <div style={{fontSize: 12, letterSpacing: 2, color: '#64748B', fontWeight: 600, marginBottom: 8}}>{kpi.label}</div>
            <div style={{fontSize: 36, fontWeight: 700, color: NAVY}}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* TITLE */}
      <div style={{padding: '24px 40px 16px'}}>
        <div style={{fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 6}}>Selecione o Ponto de Trabalho</div>
        <div style={{fontSize: 16, color: '#64748B'}}>Escolha o setor para iniciar o controle de acesso</div>
      </div>

      {/* GRID */}
      <div style={{padding: '8px 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20}}>
        {POINTS.map((pt, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 16,
              border: hoveredCard === idx ? `2px solid ${TURQUOISE}` : '1px solid #E2E8F0',
              opacity: getCardOpacity(idx),
              transform: `translateY(${getCardY(idx)}px) ${hoveredCard === idx ? 'scale(1.03)' : 'scale(1)'}`,
              boxShadow: hoveredCard === idx ? `0 12px 32px rgba(72,195,210,0.25)` : 'none',
            }}
          >
            <div style={{width: 56, height: 56, borderRadius: 12, backgroundColor: pt.color, color: 'white', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16}}>
              {pt.icon}
            </div>
            <div style={{fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 6}}>{pt.name}</div>
            <div style={{fontSize: 16, color: '#64748B'}}>{pt.subtitle}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
