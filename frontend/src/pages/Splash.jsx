import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useLanguageStore } from '../store';

export default function Splash() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { language } = useLanguageStore();
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 100);
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        if (isAuthenticated && language) navigate('/chat', { replace: true });
        else if (language) navigate('/auth', { replace: true });
        else navigate('/language', { replace: true });
      }, 500);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, language, navigate]);

  return (
    <div className={`fixed inset-0 bg-[#060609] flex flex-col items-center justify-center transition-all duration-700 ${fadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00cc88, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* Content */}
      <div className={`flex flex-col items-center z-10 transition-all duration-1000 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* Logo */}
        <div className="w-20 h-20 mb-8 relative">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00cc88] opacity-15 blur-xl" />
          <div className="relative w-full h-full rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center backdrop-blur-sm">
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
              <path d="M20 4L4 12v16l16 8 16-8V12L20 4z" stroke="url(#splash-g)" strokeWidth="1.5" />
              <path d="M20 12l-8 4v8l8 4 8-4v-8l-8-4z" fill="url(#splash-g)" opacity="0.2" />
              <circle cx="20" cy="20" r="4" fill="url(#splash-g)" />
              <defs><linearGradient id="splash-g" x1="4" y1="4" x2="36" y2="36">
                <stop offset="0%" stopColor="#00d4ff" /><stop offset="100%" stopColor="#00cc88" />
              </linearGradient></defs>
            </svg>
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00d4ff] to-[#00cc88]">CivicBridge</span>
        </h1>

        <p className="text-white/20 text-[11px] tracking-[0.3em] uppercase font-medium">
          AI-Powered Government Services
        </p>

        {/* Loading bar */}
        <div className="mt-14 w-32 h-0.5 bg-white/[0.03] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#00d4ff] to-[#00cc88] rounded-full animate-loading-bar" />
        </div>
      </div>

      {/* Version */}
      <p className={`absolute bottom-8 text-white/10 text-[10px] tracking-wider z-10 transition-all duration-1000 delay-500 ${show ? 'opacity-100' : 'opacity-0'}`}>
        v1.0 — Powered by AWS
      </p>
    </div>
  );
}