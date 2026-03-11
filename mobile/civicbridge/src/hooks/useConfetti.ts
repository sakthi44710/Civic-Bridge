import { useCallback } from 'react';

export function useConfetti() {
  const fire = useCallback(async () => {
    try {
      const { default: confetti } = await import('canvas-confetti');
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({ particleCount: 3, angle: 60,  spread: 55, origin: { x: 0 }, colors: ['#FF9933','#138808','#ffffff'] });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FF9933','#138808','#000080'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } catch { /* canvas-confetti not loaded */ }
  }, []);

  return { fire };
}
