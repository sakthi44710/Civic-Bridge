import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, FileText, Mic, ArrowRight, ChevronRight } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';

export const WelcomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { setDemoMode, setAuthenticated, setOnboarded } = useUserStore();

  const handleGetStarted = () => navigate('/auth');
  const handleDemo = () => {
    setDemoMode(true);
    setAuthenticated(true);
    setOnboarded(true);
    navigate('/');
  };

  const features = [
    { icon: Shield, title: 'Find Schemes', titleHi: 'योजनाएं खोजें', desc: 'AI-powered eligibility matching' },
    { icon: FileText, title: 'Auto-Apply', titleHi: 'स्वचालित आवेदन', desc: 'Fill forms in minutes' },
    { icon: Mic, title: 'Voice Assist', titleHi: 'आवाज़ सहायता', desc: 'Speak in your language' },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden" style={{ background: '#f0f4f8' }}>
      {/* Tricolor strip at top */}
      <div className="tricolor-strip" />

      {/* Header section with blue gradient */}
      <div className="umang-header relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #42a5f5, transparent 70%)' }} />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FF9933, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col items-center py-16 px-6">
          {/* Emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
                border: '2px solid rgba(255,255,255,0.3)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div className="w-16 h-16 rounded-full border-4 border-white/50 flex items-center justify-center relative">
                <div className="w-3 h-3 rounded-full bg-white/70" />
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="absolute w-0.5 h-4 bg-white/40"
                    style={{ transform: `rotate(${i * 30}deg)`, transformOrigin: 'bottom center', top: '6px' }} />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-extrabold text-white tracking-tight text-center"
          >
            CivicBridge
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-white/70 text-base font-medium tracking-wide mt-1"
          >
            The Spirit of New India
          </motion.p>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="w-28 h-1 rounded-full mt-4"
            style={{ background: 'linear-gradient(90deg, #FF9933, #FFFFFF, #138808)' }}
          />
        </div>
      </div>

      {/* Content section */}
      <div className="flex-1 flex flex-col items-center px-6 py-8 z-10">
        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="text-center mb-8 max-w-lg"
        >
          <h2 className="text-xl font-bold text-[#1a237e] mb-2">
            AI-powered gateway to government welfare schemes
          </h2>
          <p className="text-[#64748b] text-sm">
            Apply in minutes, not months — सरकारी योजनाओं के लिए AI-संचालित सहायता
          </p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="grid grid-cols-3 gap-4 w-full max-w-lg mb-10"
        >
          {features.map((f) => (
            <div key={f.title} className="umang-card p-4 flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-[#EEF2FF] flex items-center justify-center">
                <f.icon size={22} className="text-[#1a237e]" />
              </div>
              <p className="text-sm font-semibold text-[#1e293b]">{f.title}</p>
              <p className="text-[10px] text-[#64748b] leading-tight">{f.desc}</p>
            </div>
          ))}
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="flex flex-col gap-3 w-full max-w-sm"
        >
          <button
            onClick={handleGetStarted}
            className="btn-umang w-full py-4 text-lg flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </button>
          <button
            onClick={handleDemo}
            className="btn-umang-outline w-full py-3 flex items-center justify-center gap-2"
          >
            Explore Demo <ChevronRight size={18} />
          </button>
        </motion.div>

        <p className="text-[#94a3b8] text-xs mt-6">Powered by AWS AI for Bharat</p>
      </div>

      {/* Tricolor strip at bottom */}
      <div className="tricolor-strip" />
    </div>
  );
};
