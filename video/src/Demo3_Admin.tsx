import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const NAVY = '#0C1B3A';
const TURQUOISE = '#48C3D2';
const BG = '#F8FAFC';

export const Demo3_Admin: React.FC = () => {
  const frame = useCurrentFrame();

  // 15s = 450 frames
  const fadeIn = interpolate(frame, [0, 30], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [400, 440], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const kpi1 = interpolate(frame, [30, 60], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const kpi2 = interpolate(frame, [60, 90], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const kpi3 = interpolate(frame, [90, 120], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pronoteOpacity = interpolate(frame, [120, 160], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const filtersOpacity = interpolate(frame, [180, 220], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const modalScale = interpolate(frame, [280, 320], [0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const modalOpacity = interpolate(frame, [280, 320], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: BG, opacity: fadeIn * fadeOut, fontFamily: 'Inter, sans-serif'}}>
      {/* TOPBAR */}
      <div style={{backgroundColor: NAVY, height: 80, display: 'flex', alignItems: 'center', padding: '0 40px', color: 'white', gap: 32}}>
        <div style={{fontSize: 22, fontWeight: 700}}>MAGBO Access Control</div>
        <div style={{backgroundColor: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: 8, fontSize: 16}}>🛡️ Painel Administrativo</div>
      </div>

      {/* TÍTULO */}
      <div style={{padding: '32px 40px 24px'}}>
        <div style={{fontSize: 36, fontWeight: 700, color: NAVY, marginBottom: 6}}>Painel Administrativo</div>
        <div style={{fontSize: 16, color: '#64748B'}}>Relatórios, KPIs e gestão Pronote · Lycée Molière</div>
      </div>

      {/* KPIs */}
      <div style={{padding: '0 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24}}>
        {[
          {label: 'TOTAL DE ACESSOS HOJE', value: '0', op: kpi1},
          {label: 'UTILIZADORES ATIVOS', value: '0', op: kpi2},
          {label: 'TOTAL NA BASE DE DADOS', value: '11', op: kpi3},
        ].map((kpi, i) => (
          <div key={i} style={{backgroundColor: 'white', padding: 28, borderRadius: 12, border: '1px solid #E2E8F0', opacity: kpi.op, transform: `translateY(${interpolate(kpi.op, [0, 1], [20, 0])}px)`}}>
            <div style={{fontSize: 11, letterSpacing: 2, color: '#64748B', fontWeight: 600, marginBottom: 10}}>{kpi.label}</div>
            <div style={{fontSize: 44, fontWeight: 700, color: NAVY}}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* PRONOTE BOX */}
      <div style={{padding: '0 40px', marginBottom: 24}}>
        <div style={{backgroundColor: 'white', padding: 24, borderRadius: 12, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: pronoteOpacity}}>
          <div>
            <div style={{fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4}}>🔄 Integração Pronote</div>
            <div style={{fontSize: 14, color: '#64748B'}}>Última sincronização automática: <strong>03:00</strong></div>
          </div>
          <div style={{backgroundColor: '#7C3AED', color: 'white', padding: '12px 24px', borderRadius: 8, fontSize: 15, fontWeight: 600}}>☁ Sincronizar Agora</div>
        </div>
      </div>

      {/* FILTROS */}
      <div style={{padding: '0 40px', opacity: filtersOpacity}}>
        <div style={{fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 16}}>Relatório de Acessos do Dia</div>
        <div style={{backgroundColor: 'white', padding: 20, borderRadius: 12, border: '1px solid #E2E8F0', display: 'flex', gap: 16, alignItems: 'flex-end'}}>
          {['SETOR', 'AÇÃO', 'DE', 'ATÉ'].map((label, i) => (
            <div key={i} style={{flex: 1}}>
              <div style={{fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6, letterSpacing: 1}}>{label}</div>
              <div style={{border: '1px solid #CBD5E1', borderRadius: 6, padding: '10px 14px', fontSize: 14, color: NAVY}}>Todos</div>
            </div>
          ))}
          <div style={{backgroundColor: NAVY, color: 'white', padding: '12px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600}}>Aplicar filtros</div>
        </div>
      </div>

      {/* MODAL */}
      <AbsoluteFill style={{opacity: modalOpacity, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40}}>
        <div style={{backgroundColor: 'white', width: '85%', maxWidth: 1400, borderRadius: 16, overflow: 'hidden', transform: `scale(${modalScale})`, boxShadow: '0 25px 80px rgba(0,0,0,0.5)'}}>
          <div style={{backgroundColor: NAVY, padding: 32, color: 'white'}}>
            <div style={{fontSize: 28, fontWeight: 700, marginBottom: 6}}>🛡️ Gestão de Operadores</div>
            <div style={{fontSize: 16, opacity: 0.7}}>Administrar contas de acesso ao sistema</div>
          </div>
          <div style={{padding: 32}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
              <div>
                <div style={{fontSize: 22, fontWeight: 700, color: NAVY}}>Operadores do Sistema</div>
                <div style={{fontSize: 14, color: '#64748B'}}>Gerencie quem pode operar cada setor</div>
              </div>
              <div style={{backgroundColor: '#3B82F6', color: 'white', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600}}>+ Novo Operador</div>
            </div>
            <div style={{borderTop: '1px solid #E2E8F0', paddingTop: 16}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 16, padding: '12px 0', fontSize: 11, color: '#64748B', fontWeight: 600, letterSpacing: 1}}>
                {['USUÁRIO', 'NOME', 'ROLE', 'SETORES', 'STATUS', 'ÚLTIMO LOGIN', 'AÇÕES'].map((h) => <div key={h}>{h}</div>)}
              </div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 16, padding: '16px 0', fontSize: 14, color: NAVY, alignItems: 'center', borderTop: '1px solid #F1F5F9'}}>
                <div style={{fontFamily: 'monospace'}}>admin</div>
                <div>Administrador MAGBO</div>
                <div><span style={{backgroundColor: '#DBEAFE', color: '#1D4ED8', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600}}>ADMIN</span></div>
                <div style={{fontFamily: 'monospace'}}>*</div>
                <div>● Ativo</div>
                <div style={{fontSize: 13}}>2026-05-14 15:48</div>
                <div style={{display: 'flex', gap: 8, fontSize: 13}}>
                  <span style={{color: '#3B82F6', fontWeight: 600}}>Editar</span>
                  <span style={{color: '#DC2626', fontWeight: 600}}>Desativar</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
