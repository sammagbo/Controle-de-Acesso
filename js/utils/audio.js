// =====================================================================
// AUDIO UTILITIES (Sintetizador Web Audio API)
// =====================================================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

/**
 * Cria um oscilador base para tocar um som
 */
function playTone(frequency, type, duration, volume = 0.5) {
      if (audioCtx.state === 'suspended') {
            audioCtx.resume();
      }

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      // Envelope para evitar "cliques" sonoros no início/fim
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(volume, audioCtx.currentTime + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
}

/**
 * Toca um bipe agudo simples (Acesso Liberado)
 */
window.playSuccessBeep = () => {
      // Bipe rápido em 1000Hz (Sine wave = suave)
      playTone(1000, 'sine', 0.15, 0.6);
};

/**
 * Bipe único e discreto — item novo no feed de negadas (F7a).
 * 1 bipe por LOTE de itens novos; volume baixo para não assustar a fila.
 */
window.playDeniedFeedBeep = () => {
      playTone(880, 'sine', 0.18, 0.25);
};

/**
 * Toca dois bipes graves curtos (Acesso Negado / Erro)
 */
window.playErrorBeep = () => {
      // Primeiro bipe grave (300Hz, sawtooth = mais ríspido)
      playTone(300, 'sawtooth', 0.15, 0.4);
      
      // Segundo bipe logo em seguida
      setTimeout(() => {
            playTone(300, 'sawtooth', 0.15, 0.4);
      }, 200);
};
