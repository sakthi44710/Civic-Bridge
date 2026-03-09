import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Calendar, ArrowLeft, Globe, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUserStore } from '@/stores/userStore';
import { generateId } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { authAPI } from '@/services/api';

/* ── Cognito OAuth (Google Sign-In via Hosted UI) ──────────── */
const COGNITO_DOMAIN = 'https://civicbridge-bfrdbdfy.auth.ap-south-1.amazoncognito.com';
const COGNITO_CLIENT_ID = '1sd74elvt96qmejimkjv8v5qvg';
const COGNITO_REDIRECT_URI = `${window.location.origin}/auth`;

/* ── Language Data ─────────────────────────────────────────── */
const LANG_LIST = [
  { code: 'en', native: 'English',   english: 'English' },
  { code: 'hi', native: 'हिन्दी',    english: 'Hindi' },
  { code: 'ta', native: 'தமிழ்',     english: 'Tamil' },
  { code: 'te', native: 'తెలుగు',    english: 'Telugu' },
  { code: 'bn', native: 'বাংলা',     english: 'Bengali' },
  { code: 'mr', native: 'मराठी',     english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી',   english: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ',     english: 'Kannada' },
  { code: 'ml', native: 'മലയാളം',   english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ',    english: 'Punjabi' },
  { code: 'or', native: 'ଓଡ଼ିଆ',     english: 'Odia' },
  { code: 'as', native: 'অসমীয়া',   english: 'Assamese' },
];

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi'];
const CITIES: Record<string, string[]> = {
  'Maharashtra': ['Mumbai','Pune','Nagpur','Nashik','Aurangabad','Solapur'],
  'Delhi': ['New Delhi','Dwarka','Saket','Rohini','Lajpat Nagar'],
  'Karnataka': ['Bengaluru','Mysuru','Hubli','Mangaluru','Belagavi'],
  'Tamil Nadu': ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem'],
  'Uttar Pradesh': ['Lucknow','Kanpur','Agra','Varanasi','Meerut'],
};
const DISTRICTS: Record<string, string[]> = {
  'Maharashtra': ['Mumbai','Mumbai Suburban','Pune','Thane','Nagpur','Nashik'],
  'Delhi': ['Central Delhi','East Delhi','North Delhi','South Delhi','West Delhi'],
};

/* ── Auth Shell (UMANG style) ─────────────────────────────── */
const Shell: React.FC<{ children: React.ReactNode; onBack?: () => void; step?: string }> = ({ children, onBack, step }) => (
  <div className="min-h-[100dvh] flex flex-col" style={{ background: '#f0f4f8' }}>
    {/* Tricolor */}
    <div className="tricolor-strip" />
    {/* Header */}
    <div className="umang-header px-6 py-4 flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft size={18} className="text-white" />
        </button>
      )}
      <div className="flex-1">
        <h1 className="text-white font-bold text-lg">CivicBridge</h1>
        {step && <p className="text-white/60 text-xs">{step}</p>}
      </div>
      <div className="w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center">
        <Globe size={14} className="text-white/70" />
      </div>
    </div>
    {/* Content */}
    <div className="flex-1 flex items-start justify-center px-4 py-8">
      {children}
    </div>
    {/* Footer */}
    <div className="text-center pb-4">
      <p className="text-[#64748b] text-xs">Powered by AWS AI for Bharat</p>
    </div>
  </div>
);

/* ── Step 1: Language ─────────────────────────────────────── */
const LanguageStep: React.FC<{ onSelect: (code: string) => void }> = ({ onSelect }) => {
  const [selected, setSelected] = useState('en');
  return (
    <Shell step="Step 1 of 4 — Choose Language">
      <motion.div
        className="umang-card w-full max-w-2xl p-8"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-[#1a237e] mb-1">Choose your language</h2>
          <p className="text-[#64748b] text-sm">अपनी भाषा चुनें</p>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {LANG_LIST.map((lang) => {
            const active = selected === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => { setSelected(lang.code); }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-4 rounded-xl border-2 transition-all',
                  active
                    ? 'border-[#1a237e] bg-[#1a237e]/5 shadow-md'
                    : 'border-[#e2e8f0] bg-white hover:border-[#1a237e]/40 hover:bg-[#f8fafc]'
                )}
              >
                <span className={cn('text-lg font-bold', active ? 'text-[#1a237e]' : 'text-[#1e293b]')}>{lang.native}</span>
                <span className={cn('text-xs', active ? 'text-[#1a237e]' : 'text-[#64748b]')}>{lang.english}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onSelect(selected)}
          className="btn-umang w-full py-4 text-lg"
        >
          Continue
        </button>
      </motion.div>
    </Shell>
  );
};

/* ── Step 2: Phone ─────────────────────────────────────────── */
const PhoneStep: React.FC<{ phone: string; setPhone: (v: string) => void; onNext: () => void; onBack: () => void; email: string; setEmail: (v: string) => void; onGoogleAuth: () => void }> = ({ phone, setPhone, onNext, onBack, email, setEmail, onGoogleAuth }) => {
  const [loading, setLoading] = useState(false);

  const handleGetOtp = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    try {
      const res = await authAPI.sendOTP(phone, email || undefined);
      const devOtp = res.data?.dev_otp;
      if (devOtp) {
        toast.success(`OTP: ${devOtp}`, { duration: 15000 });
      } else {
        toast.success('OTP sent to +91 ' + phone);
      }
      onNext();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell onBack={onBack} step="Step 2 of 4 — Login">
      <motion.div
        className="umang-card w-full max-w-md p-8"
        initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-[#1a237e] mb-1">Welcome to CivicBridge</h2>
          <p className="text-[#64748b] text-sm">सिविकब्रिज में स्वागत है</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[#64748b] text-sm font-medium mb-1.5 block">Phone Number</label>
            <div className="flex items-center gap-2 border-2 border-[#e2e8f0] rounded-xl px-4 py-3 bg-[#f8fafc] focus-within:border-[#1a237e] focus-within:bg-white transition-all">
              <span className="text-[#1a237e] font-semibold">+91</span>
              <div className="w-px h-5 bg-[#e2e8f0]" />
              <input
                type="tel" inputMode="numeric" maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit number"
                className="flex-1 bg-transparent text-[#1e293b] outline-none placeholder:text-[#94a3b8]"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="text-[#64748b] text-sm font-medium mb-1.5 block">Email (optional)</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="umang-input"
            />
          </div>

          <button
            onClick={handleGetOtp}
            disabled={phone.length < 10 || loading}
            className={cn(
              'w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2',
              phone.length >= 10 && !loading
                ? 'btn-umang'
                : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
            )}
          >
            {loading && <Loader2 size={20} className="animate-spin" />}
            {loading ? 'Sending...' : 'Get OTP'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#e2e8f0]" />
            <span className="text-[#94a3b8] text-sm">or</span>
            <div className="flex-1 h-px bg-[#e2e8f0]" />
          </div>

          <button
            onClick={onGoogleAuth}
            className="w-full py-3 rounded-xl border-2 border-[#e2e8f0] bg-white flex items-center justify-center gap-3 text-[#1e293b] hover:bg-[#f8fafc] transition-all font-medium"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </motion.div>
    </Shell>
  );
};

/* ── Step 3: OTP ─────────────────────────────────────────── */
const OtpStep: React.FC<{ phone: string; onVerified: (result: any) => void; onBack: () => void; onResend: () => void }> = ({ phone, onVerified, onBack, onResend }) => {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const ref4 = useRef<HTMLInputElement>(null);
  const ref5 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3, ref4, ref5];
  const [seconds, setSeconds] = useState(180);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const verifyOtp = async (otpString: string) => {
    setLoading(true);
    try {
      const res = await authAPI.verifyOTP(phone, otpString);
      toast.success('OTP verified!');
      onVerified(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Invalid OTP');
      setOtp(Array(6).fill(''));
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) refs[idx + 1].current?.focus();
    if (next.every(Boolean)) verifyOtp(next.join(''));
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) refs[idx - 1].current?.focus();
  };

  return (
    <Shell onBack={onBack} step="Step 3 of 4 — Verify OTP">
      <motion.div
        className="umang-card w-full max-w-md p-8 text-center"
        initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      >
        <h2 className="text-xl font-bold text-[#1a237e] mb-1">Verify Phone</h2>
        <p className="text-[#64748b] text-sm mb-8">
          OTP sent to +91 {phone || '9876543210'}
        </p>

        <div className="flex justify-center gap-3 mb-4">
          {otp.map((digit, i) => (
            <input
              key={i} ref={refs[i]}
              type="tel" inputMode="numeric" maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={cn('umang-otp', digit && 'filled')}
              disabled={loading}
            />
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 mb-4 text-[#1a237e]">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-medium">Verifying...</span>
          </div>
        )}

        <p className="text-[#64748b] text-sm">
          Resend in {mm}:{ss}{' '}
          <button
            className="text-[#1a237e] font-semibold ml-1 hover:underline"
            onClick={() => { setSeconds(180); onResend(); }}
          >
            Resend OTP
          </button>
        </p>
      </motion.div>
    </Shell>
  );
};

/* ── Step 4: Profile ─────────────────────────────────────── */
interface ProfileData { name: string; dob: string; gender: string; state: string; city: string; district: string; }

const ProfileStep: React.FC<{ onNext: (data: ProfileData) => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const [name, setName] = useState('Rahul Kumar');
  const [dob, setDob] = useState('1987-01-06');
  const [gender, setGender] = useState('Male');
  const [state, setState] = useState('Maharashtra');
  const [city, setCity] = useState('Mumbai');
  const [district, setDistrict] = useState('Mumbai');

  const SelectField: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }> =
    ({ label, value, onChange, options, placeholder }) => (
      <div>
        <label className="text-[#64748b] text-sm font-medium mb-1.5 block">{label}</label>
        <div className="relative">
          <select
            value={value} onChange={(e) => onChange(e.target.value)}
            className="umang-input appearance-none pr-10"
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
        </div>
      </div>
    );

  return (
    <Shell onBack={onBack} step="Step 4 of 4 — Complete Profile">
      <motion.div
        className="umang-card w-full max-w-2xl p-8"
        initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-[#1a237e] mb-1">Complete Your Profile</h2>
          <p className="text-[#64748b] text-sm">अपनी प्रोफ़ाइल पूरी करें</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-[#64748b] text-sm font-medium mb-1.5 block">Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="umang-input" placeholder="Enter full name" />
          </div>
          <div>
            <label className="text-[#64748b] text-sm font-medium mb-1.5 block">Date of Birth</label>
            <div className="relative">
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="umang-input" />
            </div>
          </div>
          <SelectField label="Gender" value={gender} onChange={setGender} options={['Male','Female','Other']} />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <SelectField label="State" value={state} onChange={setState} options={STATES} />
          <SelectField label="City" value={city} onChange={setCity} options={CITIES[state] || ['Select city']} />
          <SelectField label="District" value={district} onChange={setDistrict} options={DISTRICTS[state] || [state]} />
        </div>

        <button
          onClick={() => onNext({ name, dob, gender, state, city, district })}
          className="btn-umang w-full py-4 text-lg"
        >
          Finish Registration
        </button>
      </motion.div>
    </Shell>
  );
};

/* ── Main ─────────────────────────────────────────────────── */
export const PhoneAuthScreen: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setToken, setAuthenticated } = useUserStore();
  const [step, setStep] = useState<'language' | 'phone' | 'otp' | 'profile'>('language');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedLang, setSelectedLang] = useState('en');
  const oauthProcessed = useRef(false);

  /* ── Google OAuth: Cognito implicit flow callback ────────── */
  const handleImplicitCallback = useCallback(async (idToken: string) => {
    try {
      // Decode JWT payload to extract user info
      const parts = idToken.split('.');
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(payloadB64));

      const res = await authAPI.googleAuth({
        id_token: idToken,
        name: payload.name || payload['cognito:username'] || payload.email?.split('@')[0],
        email: payload.email,
        preferred_language: selectedLang || 'en',
      });

      const result = res.data;
      if (result.access_token) {
        localStorage.setItem('token', result.access_token);
        setToken(result.access_token);
        setUser({
          id: result.user_id,
          phone: result.phone_number || '',
          name: result.name || 'User',
          language: (result.preferred_language || selectedLang) as any,
          verified: true,
          createdAt: new Date(),
          familyMembers: [],
        });
        setAuthenticated(true);
        toast.success('Signed in with Google!');
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Google sign-in failed');
    }
  }, [selectedLang, setToken, setUser, setAuthenticated, navigate]);

  // Check for Cognito OAuth redirect (id_token in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('id_token') && !oauthProcessed.current) {
      oauthProcessed.current = true;
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      if (idToken) {
        window.history.replaceState({}, '', '/auth');
        handleImplicitCallback(idToken);
      }
    }
  }, [handleImplicitCallback]);

  const handleGoogleAuth = () => {
    const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
    authUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('redirect_uri', COGNITO_REDIRECT_URI);
    authUrl.searchParams.set('identity_provider', 'Google');
    window.location.href = authUrl.toString();
  };

  const handleOtpVerified = (result: any) => {
    if (result.access_token) {
      // Existing user — store token and navigate
      localStorage.setItem('token', result.access_token);
      setToken(result.access_token);
      setUser({
        id: result.user_id,
        phone: `+91${phone}`,
        name: result.name || 'User',
        language: (result.preferred_language || selectedLang) as any,
        verified: true,
        createdAt: new Date(),
        familyMembers: [],
      });
      setAuthenticated(true);
      navigate('/');
    } else {
      // New user — go to profile step
      setStep('profile');
    }
  };

  const handleResendOtp = async () => {
    try {
      const res = await authAPI.sendOTP(phone, email || undefined);
      const devOtp = res.data?.dev_otp;
      if (devOtp) {
        toast.success(`OTP: ${devOtp}`, { duration: 15000 });
      } else {
        toast.success('OTP resent!');
      }
    } catch { /* ignore */ }
  };

  const handleProfileComplete = async (data: ProfileData) => {
    try {
      const res = await authAPI.register({
        phone_number: phone,
        name: data.name,
        preferred_language: selectedLang,
        email: email || undefined,
      });
      const result = res.data;
      if (result.access_token) {
        localStorage.setItem('token', result.access_token);
        setToken(result.access_token);
      }
      setUser({
        id: result.user_id || generateId(),
        phone: `+91${phone}`,
        name: data.name,
        language: selectedLang as any,
        verified: true,
        createdAt: new Date(),
        familyMembers: [],
      });
      setAuthenticated(true);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    }
  };

  return (
    <AnimatePresence mode="wait">
      {step === 'language' && (
        <motion.div key="lang" exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          <LanguageStep onSelect={(code) => { setSelectedLang(code); setStep('phone'); }} />
        </motion.div>
      )}
      {step === 'phone' && (
        <motion.div key="phone" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
          <PhoneStep phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} onNext={() => setStep('otp')} onBack={() => setStep('language')} onGoogleAuth={handleGoogleAuth} />
        </motion.div>
      )}
      {step === 'otp' && (
        <motion.div key="otp" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
          <OtpStep phone={phone} onVerified={handleOtpVerified} onBack={() => setStep('phone')} onResend={handleResendOtp} />
        </motion.div>
      )}
      {step === 'profile' && (
        <motion.div key="profile" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
          <ProfileStep onNext={handleProfileComplete} onBack={() => setStep('otp')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
