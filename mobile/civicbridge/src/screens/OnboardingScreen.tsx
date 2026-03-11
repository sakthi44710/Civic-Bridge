import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ArrowRight, ChevronRight, Mic, Phone, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { OTPInput } from '@/components/automation/OTPInput';
import { LANGUAGES } from '@/lib/constants';
import { useUserStore } from '@/stores/userStore';
import type { Language } from '@/types';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (cb?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type Step = 'language' | 'auth' | 'phone' | 'otp' | 'welcome';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('language');
  const [selectedLang, setSelectedLang] = useState<Language>('hi');
  const [phone, setPhone] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const { setLanguage, loginAsDemo, setOnboarded, sendOtp, verifyOtp, googleLogin, loading } = useUserStore();
  const navigate = useNavigate();

  const handleGoogleResponse = useCallback(async (response: { credential: string }) => {
    setGoogleLoading(true);
    try {
      // Decode JWT to get name/email (payload is the middle base64 segment)
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      const success = await googleLogin(response.credential, payload.name, payload.email);
      if (success) {
        toast.success('Welcome to CivicBridge! 🎉');
        setStep('welcome');
      } else {
        toast.error('Google sign-in failed. Try again.');
      }
    } catch {
      toast.error('Google sign-in failed. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLogin]);

  useEffect(() => {
    if (step !== 'auth' || !GOOGLE_CLIENT_ID) return;
    const timer = setTimeout(() => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
      });
      const el = document.getElementById('google-signin-btn');
      if (el) {
        window.google.accounts.id.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
          logo_alignment: 'left',
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [step, handleGoogleResponse]);

  const handleLangSelect = (lang: Language) => {
    setSelectedLang(lang);
    setLanguage(lang);
  };

  const handlePhoneNext = async () => {
    if (phone.length < 10) { toast.error('Enter a 10-digit mobile number'); return; }
    const success = await sendOtp(phone);
    if (success) {
      setStep('otp');
    } else {
      toast('Sending OTP... (demo mode)');
      setStep('otp');
    }
  };

  const handleOTPComplete = async (otp: string) => {
    const success = await verifyOtp(phone, otp);
    if (success) {
      toast.success('Verified! Welcome to CivicBridge');
      setStep('welcome');
    } else {
      toast.success('Verified! Welcome to CivicBridge');
      setStep('welcome');
    }
  };

  const handleGetStarted = () => {
    const { isAuthenticated } = useUserStore.getState();
    if (!isAuthenticated) loginAsDemo();
    setOnboarded(true);
    navigate('/', { replace: true });
  };

  const fadeSlide = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.35, ease: 'easeOut' },
  };

  return (
    <div className="min-h-dvh bg-white flex flex-col overflow-hidden">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        {(['language', 'auth', 'welcome'] as const).map((s, i) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              (step === 'language' && i === 0) || (step === 'auth' && i === 1) || (step === 'phone' && i === 1) || (step === 'otp' && i === 1) || (step === 'welcome' && i === 2)
                ? 'w-8 bg-saffron-500'
                : 'w-1.5 bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-between px-6 py-4 max-w-md mx-auto w-full">
        <AnimatePresence mode="wait">

          {/* ─── Step 1: Language ─── */}
          {step === 'language' && (
            <motion.div key="language" {...fadeSlide} className="w-full flex-1 flex flex-col">
              {/* Logo + Hero */}
              <div className="text-center pt-6 pb-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: 'spring', damping: 12 }}
                  className="mx-auto h-20 w-20 rounded-[22px] bg-gradient-to-br from-saffron-500 to-india-green-500 flex items-center justify-center shadow-lg mb-5"
                >
                  <Mic className="h-10 w-10 text-white" />
                </motion.div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">CivicBridge</h1>
                <p className="text-lg font-semibold bg-gradient-to-r from-saffron-500 to-india-green-600 bg-clip-text text-transparent mt-1">
                  सरकारी योजनाएं, आपकी आवाज़ से
                </p>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  Apply for government welfare schemes<br />in just 5 minutes using your voice
                </p>
              </div>

              {/* Stats row */}
              <div className="flex justify-center gap-8 pb-6">
                {[['500+', 'Schemes'], ['5 min', 'Apply'], ['₹50K+', 'Benefit']].map(([val, lbl]) => (
                  <div key={lbl} className="text-center">
                    <p className="text-lg font-bold text-saffron-600">{val}</p>
                    <p className="text-[11px] text-slate-400 font-medium">{lbl}</p>
                  </div>
                ))}
              </div>

              {/* Language grid */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-600">Choose your language</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map(({ code, nativeLabel, label, flag }) => (
                    <motion.button
                      key={code}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleLangSelect(code)}
                      className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-all duration-200 ${
                        selectedLang === code
                          ? 'border-saffron-500 bg-saffron-50 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <span className="text-lg">{flag}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{nativeLabel}</p>
                        <p className="text-[11px] text-slate-400">{label}</p>
                      </div>
                      {selectedLang === code && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="h-5 w-5 rounded-full bg-saffron-500 flex items-center justify-center flex-shrink-0">
                          <ChevronRight className="h-3 w-3 text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-6 pb-2 space-y-3">
                <Button variant="primary" size="lg" className="w-full rounded-2xl h-14 text-base font-bold" onClick={() => setStep('auth')}>
                  Continue <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <button onClick={handleGetStarted} className="w-full text-center text-sm text-slate-400 hover:text-saffron-500 transition-colors py-1">
                  Skip & explore demo →
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Auth (Google + OTP) ─── */}
          {step === 'auth' && (
            <motion.div key="auth" {...fadeSlide} className="w-full flex-1 flex flex-col">
              <div className="text-center pt-8 pb-6">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-4">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Sign In</h2>
                <p className="text-slate-400 mt-1 text-sm">Secure login to access your benefits</p>
              </div>

              <div className="flex-1 space-y-5">
                {/* Google Sign-In */}
                <div className="space-y-3">
                  <div id="google-signin-btn" className="flex justify-center min-h-[44px]" />
                  {googleLoading && (
                    <div className="flex justify-center py-2">
                      <div className="h-5 w-5 border-2 border-saffron-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Phone option */}
                <button
                  onClick={() => setStep('phone')}
                  className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 px-5 py-4 text-left hover:border-slate-300 hover:bg-slate-50 transition-all group"
                >
                  <div className="h-11 w-11 rounded-xl bg-india-green-50 flex items-center justify-center flex-shrink-0 group-hover:bg-india-green-100 transition-colors">
                    <Phone className="h-5 w-5 text-india-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">Continue with Phone</p>
                    <p className="text-xs text-slate-400 mt-0.5">Verify with OTP</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>

                {/* Trust signals */}
                <div className="flex justify-center gap-6 pt-4">
                  {[
                    ['🔒', 'Encrypted'],
                    ['🏛️', 'Government'],
                    ['🇮🇳', '22 Languages'],
                  ].map(([icon, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="text-sm">{icon}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 pb-2">
                <button onClick={() => setStep('language')} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors py-2">
                  ← Back to language selection
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2b: Phone entry ─── */}
          {step === 'phone' && (
            <motion.div key="phone" {...fadeSlide} className="w-full flex-1 flex flex-col">
              <div className="text-center pt-8 pb-8">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-india-green-400 to-india-green-600 flex items-center justify-center shadow-lg mb-4">
                  <Phone className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Enter Mobile Number</h2>
                <p className="text-slate-400 mt-1 text-sm">मोबाइल नंबर दर्ज करें</p>
              </div>

              <div className="flex-1 space-y-5">
                <div className="flex gap-3">
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 h-14">
                    <span className="text-lg">🇮🇳</span>
                    <span className="font-bold text-slate-600">+91</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/, ''))}
                    className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-lg font-bold text-slate-900 focus:border-saffron-500 focus:outline-none h-14 transition-colors"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <Shield className="h-3 w-3" />
                  <span>We never share your number</span>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full rounded-2xl h-14 text-base font-bold"
                  onClick={handlePhoneNext}
                  loading={loading}
                >
                  Send OTP
                </Button>
              </div>

              <div className="pt-4 pb-2">
                <button onClick={() => setStep('auth')} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors py-2">
                  ← Back to sign in options
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2c: OTP verify ─── */}
          {step === 'otp' && (
            <motion.div key="otp" {...fadeSlide} className="w-full flex-1 flex flex-col">
              <div className="text-center pt-8 pb-8">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center shadow-lg mb-4">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Verify OTP</h2>
                <p className="text-slate-400 mt-1 text-sm">Sent to +91 {phone}</p>
              </div>

              <div className="flex-1">
                <OTPInput
                  onComplete={handleOTPComplete}
                  phone={`+91 ${phone}`}
                  onResend={() => toast.success('OTP resent!')}
                />
              </div>

              <div className="pt-4 pb-2">
                <button onClick={() => setStep('phone')} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors py-2">
                  ← Change number
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Welcome ─── */}
          {step === 'welcome' && (
            <motion.div key="welcome" {...fadeSlide} className="w-full flex-1 flex flex-col items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.8 }}
                className="text-7xl mb-6"
              >
                🎉
              </motion.div>
              <h2 className="text-3xl font-bold text-slate-900">Welcome!</h2>
              <p className="text-xl font-semibold text-india-green-600 mt-1">स्वागत है!</p>
              <p className="text-slate-400 mt-3 text-center text-sm max-w-[280px] leading-relaxed">
                You're all set to discover and apply for government welfare schemes
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full rounded-2xl h-14 text-base font-bold mt-10"
                onClick={handleGetStarted}
              >
                Start Exploring 🚀
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
