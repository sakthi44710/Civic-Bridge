import { useEffect, useRef, useMemo } from 'react';

/**
 * AI Globe - Animated orb with phone-call interaction states
 *
 * States:
 *   idle       → Mic icon, "Tap to start", gentle breathing glow
 *   listening  → Waveform bars (cyan), pulse rings, voice volume reactive
 *   speaking   → Waveform bars (green), organic pulse
 *   in-call    → Active call indicator (when call is live but idle between turns)
 */
export default function Globe({
  status = 'idle',
  inCall = false,
  volume = 0,
  onClick,
  tapText = 'Tap to start',
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const timeRef = useRef(0);

  // Normalize volume to 0-1 range
  const normalizedVolume = useMemo(() => Math.min(volume / 60, 1), [volume]);

  // Canvas particle animation with FPS limiting
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // FPS limiting
    let lastTime = 0;
    const targetFPS = 30;
    const frameDelay = 1000 / targetFPS;

    const particles = Array.from({ length: 80 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 55 + Math.random() * 50,
      speed: (Math.random() - 0.5) * 0.015,
      size: Math.random() * 2.5 + 0.3,
      offset: Math.random() * Math.PI * 2,
      layer: Math.random() > 0.5 ? 1 : 0,
    }));

    const getColor = () => {
      switch (status) {
        case 'listening':  return { r: 0, g: 212, b: 255 };
        case 'speaking':   return { r: 0, g: 204, b: 136 };
        case 'processing': return inCall ? { r: 0, g: 200, b: 240 } : { r: 0, g: 180, b: 220 };
        default:           return inCall ? { r: 0, g: 200, b: 240 } : { r: 0, g: 180, b: 220 };
      }
    };

    const animate = (currentTime) => {
      // FPS limiting
      if (currentTime - lastTime < frameDelay) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastTime = currentTime;

      timeRef.current += 0.012;
      const t = timeRef.current;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      const color = getColor();
      const isActive = status === 'listening' || status === 'speaking';
      const intensity = isActive ? 0.85 : 0.25;
      const volBoost = status === 'listening' ? normalizedVolume * 25 : 0;

      particles.forEach((p) => {
        const speedMul = status === 'speaking' ? 2.5 : status === 'listening' ? 1.8 : 0.8;
        p.angle += p.speed * speedMul;
        let wobble = Math.sin(t * 1.5 + p.offset) * 5;
        if (status === 'speaking') wobble = Math.sin(t * 4 + p.offset) * 18;
        if (status === 'listening') wobble = Math.sin(t * 2 + p.offset) * (8 + volBoost * 0.5);
        const r = p.radius + wobble + volBoost * (p.layer ? 0.5 : 0.3);
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r * 0.85;
        const alpha = intensity * (p.layer ? 0.7 : 0.4);
        ctx.beginPath();
        ctx.arc(x, y, p.size + (isActive ? normalizedVolume : 0), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.fill();
      });

      if (status !== 'idle' || inCall) {
        const pulseR = 45 + Math.sin(t * 2.5) * (isActive ? 12 + volBoost : 6);
        const gradient = ctx.createRadialGradient(cx, cy, pulseR * 0.3, cx, cy, pulseR);
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity * 0.2})`);
        gradient.addColorStop(0.6, `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity * 0.06})`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      if (isActive) {
        const ringR = 70 + Math.sin(t * 1.8) * 4 + volBoost * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [status, inCall, normalizedVolume]);

  const globeAnim = status === 'idle' && !inCall ? 'globe-idle'
    : status === 'listening' ? 'globe-listening'
    : status === 'speaking' ? 'globe-speaking' : '';

  const borderColor = status === 'listening' ? 'border-[#00d4ff]/50'
    : status === 'speaking' ? 'border-[#00cc88]/50'
    : inCall ? 'border-[#00d4ff]/25' : 'border-white/[0.06]';

  const shadowColor = status === 'listening'
    ? '0 0 60px rgba(0,212,255,0.25), 0 0 120px rgba(0,212,255,0.08)'
    : status === 'speaking'
    ? '0 0 60px rgba(0,204,136,0.25), 0 0 120px rgba(0,204,136,0.08)'
    : inCall ? '0 0 40px rgba(0,212,255,0.12)' : '0 0 30px rgba(0,212,255,0.06)';

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* Pulse rings */}
      {(status === 'listening' || status === 'speaking') && (
        <>
          <div className="absolute rounded-full pointer-events-none"
            style={{
              width: 220 + normalizedVolume * 40, height: 220 + normalizedVolume * 40,
              border: `1px solid ${status === 'listening' ? 'rgba(0,212,255,0.15)' : 'rgba(0,204,136,0.15)'}`,
              animation: 'pulse-ring 2s ease-out infinite',
            }} />
          <div className="absolute rounded-full pointer-events-none"
            style={{
              width: 220 + normalizedVolume * 30, height: 220 + normalizedVolume * 30,
              border: `1px solid ${status === 'listening' ? 'rgba(0,212,255,0.08)' : 'rgba(0,204,136,0.08)'}`,
              animation: 'pulse-ring 2s ease-out infinite 0.6s',
            }} />
        </>
      )}

      {/* Main orb */}
      <button onClick={onClick}
        aria-label={status === 'idle' && !inCall ? tapText : `Voice status: ${status}`}
        aria-pressed={inCall}
        className={`relative w-[180px] h-[180px] rounded-full bg-gradient-to-br from-[#0d0d14] via-[#111118] to-[#161620] border-2 ${borderColor} cursor-pointer transition-all duration-500 ${globeAnim} hover:scale-[1.03] active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30 focus:ring-offset-2 focus:ring-offset-[#060609]`}
        style={{ boxShadow: shadowColor }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center z-10">
          {status === 'idle' && !inCall && (
            <svg className="w-11 h-11 text-[#00d4ff] opacity-50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
          {(status === 'listening' || (status === 'idle' && inCall)) && (
            <div className="flex items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-[3px] rounded-full transition-all duration-100"
                  style={{
                    height: status === 'listening' ? 10 + normalizedVolume * 28 + Math.sin(Date.now() / 200 + i) * 6 : 8,
                    backgroundColor: 'rgba(0, 212, 255, 0.8)',
                    opacity: status === 'listening' ? 0.5 + normalizedVolume * 0.5 : 0.3,
                  }} />
              ))}
            </div>
          )}
          {status === 'speaking' && (
            <div className="flex items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-[3px] bg-[#00cc88] rounded-full"
                  style={{
                    height: 8 + Math.random() * 26,
                    animation: `pulse 0.35s ${i * 0.07}s ease-in-out infinite alternate`,
                    opacity: 0.8,
                  }} />
              ))}
            </div>
          )}
          {status === 'processing' && (
            <div className="flex items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-[3px] rounded-full transition-all duration-100"
                  style={{
                    height: 8,
                    backgroundColor: 'rgba(0, 212, 255, 0.8)',
                    opacity: 0.3,
                  }} />
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Status label */}
      <div className="mt-3 text-center">
        <p className={`text-xs font-medium tracking-wide transition-colors duration-300 ${
          status === 'listening' ? 'text-[#00d4ff]'
          : status === 'speaking' ? 'text-[#00cc88]'
          : inCall ? 'text-[#00d4ff]/60' : 'text-[#555566]'
        }`}>
          {status === 'idle' && !inCall && tapText}
          {status === 'idle' && inCall && 'Connected'}
          {status === 'listening' && 'Listening...'}
          {status === 'speaking' && 'Speaking...'}
          {status === 'processing' && 'Connected'}
        </p>
      </div>
    </div>
  );
}