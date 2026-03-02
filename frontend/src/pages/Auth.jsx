import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useLanguageStore } from '../store';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

// Cognito configuration
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'https://civicbridge-bfrdbdfy.auth.ap-south-1.amazoncognito.com';
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '1sd74elvt96qmejimkjv8v5qvg';
const COGNITO_REDIRECT_URI = `${window.location.origin}/auth`;

export default function Auth() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();
  const { language } = useLanguageStore();

  const [step, setStep] = useState('contact');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const oauthProcessed = useRef(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/chat', { replace: true });
  }, [isAuthenticated, navigate]);

  // Handle implicit flow callback — tokens arrive in URL hash fragment
  const handleImplicitCallback = useCallback(async (idToken) => {
    setLoading(true);
    try {
      // Decode the ID token to get user info
      const parts = idToken.split('.');
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(payloadB64));
      console.log('[Auth] Google user:', payload.email);

      // Send to backend for user creation/login
      const resp = await authAPI.googleAuth({
        id_token: idToken,
        name: payload.name || payload['cognito:username'] || payload.email?.split('@')[0] || 'User',
        email: payload.email,
        preferred_language: language || 'en',
      });

      const data = resp.data;
      if (data.access_token) {
        login({
          user_id: data.user_id,
          name: data.name,
          phone_number: data.phone_number || '',
          email: data.email,
          preferred_language: data.preferred_language || language,
        }, data.access_token);
        toast.success(`Welcome${data.is_new_user ? '' : ' back'}, ${data.name}!`);
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      console.error('[Auth] Google auth error:', err);
      toast.error(err.response?.data?.detail || 'Google sign-in failed. Please try again.');
    }
    setLoading(false);
  }, [language, login, navigate]);

  // Check for implicit flow tokens in URL hash (#id_token=xxx&access_token=xxx)
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

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleSendOTP = async () => {
    if (phone.length !== 10) return toast.error('Enter a valid 10-digit phone number');
    setLoading(true);
    try {
      await authAPI.sendOTP(phone, email || undefined);
      setStep('otp');
      setResendTimer(30);
      toast.success('OTP sent!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP');
    }
    setLoading(false);
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return toast.error('Enter 6-digit OTP');
    setLoading(true);
    try {
      const resp = await authAPI.verifyOTP(phone, otp);
      const data = resp.data;
      if (data.is_new_user) {
        setStep('register');
      } else if (data.access_token) {
        const userData = {
          user_id: data.user_id,
          name: data.name,
          phone_number: data.phone_number,
          email: email,
          preferred_language: data.preferred_language || language,
        };
        login(userData, data.access_token);
        toast.success(`Welcome back, ${data.name}!`);
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid OTP');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name.trim()) return toast.error('Enter your name');
    setLoading(true);
    try {
      const resp = await authAPI.register({
        phone_number: phone,
        email: email || undefined,
        otp,
        name: name.trim(),
        preferred_language: language || 'en',
      });
      const data = resp.data;
      if (data.access_token) {
        const userData = {
          user_id: data.user_id,
          name: data.name,
          phone_number: data.phone_number,
          email: email,
          preferred_language: data.preferred_language || language,
        };
        login(userData, data.access_token);
        toast.success('Account created!');
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    }
    setLoading(false);
  };

  const handleGoogleAuth = () => {
    // Redirect to Cognito Hosted UI — implicit flow (tokens in URL hash)
    const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
    authUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('redirect_uri', COGNITO_REDIRECT_URI);
    authUrl.searchParams.set('identity_provider', 'Google');
    window.location.href = authUrl.toString();
  };

  return (
    <div className="fixed inset-0 bg-[#060609] flex items-center justify-center p-4 overflow-y-auto">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #00cc88 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #ff9933 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <div className="w-full max-w-[420px] z-10 my-auto">
        {/* Branding header */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00cc88] blur-xl opacity-30" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#00cc88] flex items-center justify-center shadow-2xl">
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="1.5" fill="none" />
                  <circle cx="12" cy="12" r="3" fill="white" />
                </svg>
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {step === 'contact' ? 'Welcome to CivicBridge' : step === 'otp' ? 'Verify Your Number' : 'Almost There'}
          </h1>
          <p className="text-white/40 text-sm mt-2.5 leading-relaxed">
            {step === 'contact'
              ? 'Your AI-powered gateway to government services'
              : step === 'otp'
                ? `We sent a code to +91 ${phone}${email ? ` and ${email}` : ''}`
                : 'Just one more step to get started'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/[0.06] rounded-3xl p-7 shadow-2xl shadow-black/20">
          {step === 'contact' && (
            <div className="space-y-5">
              {/* Phone */}
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2 block">Phone Number *</label>
                <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 focus-within:border-[#00d4ff]/40 transition-colors">
                  <span className="text-white/40 mr-3 text-sm font-medium border-r border-white/[0.06] pr-3">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter phone number"
                    className="bg-transparent text-white flex-1 outline-none text-sm placeholder-white/20"
                    autoFocus
                  />
                  {phone.length === 10 && (
                    <svg className="w-5 h-5 text-[#00cc88]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2 block">Email Address</label>
                <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 focus-within:border-[#00d4ff]/40 transition-colors">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter email (optional)"
                    className="bg-transparent text-white w-full outline-none text-sm placeholder-white/20"
                  />
                  {email && email.includes('@') && (
                    <svg className="w-5 h-5 text-[#00cc88]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Send OTP */}
              <button
                onClick={handleSendOTP}
                disabled={loading || phone.length !== 10}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#00d4ff]/20 active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
                    </svg>
                    Sending...
                  </span>
                ) : 'Send OTP'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 py-1">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[11px] text-white/25 font-medium uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              {/* Google Sign-in */}
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white font-medium text-sm flex items-center justify-center gap-3 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2 block">Verification Code</label>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 focus-within:border-[#00d4ff]/40 transition-colors">
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="bg-transparent text-white w-full outline-none text-xl tracking-[0.4em] text-center placeholder-white/10 font-mono"
                    autoFocus
                    maxLength={6}
                  />
                </div>
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={loading || otp.length !== 6}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-sm disabled:opacity-30 transition-all hover:shadow-lg hover:shadow-[#00d4ff]/20 active:scale-[0.98]"
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>

              <div className="flex items-center justify-between">
                <button onClick={() => { setStep('contact'); setOtp(''); }} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                  ← Change number
                </button>
                <button
                  onClick={handleSendOTP}
                  disabled={resendTimer > 0}
                  className="text-xs text-[#00d4ff] disabled:text-white/20 transition-colors"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}

          {step === 'register' && (
            <div className="space-y-5">
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2 block">Your Name *</label>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 focus-within:border-[#00d4ff]/40 transition-colors">
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="bg-transparent text-white w-full outline-none text-sm placeholder-white/20"
                    autoFocus
                  />
                </div>
              </div>

              <button
                onClick={handleRegister}
                disabled={loading || !name.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-sm disabled:opacity-30 transition-all hover:shadow-lg hover:shadow-[#00d4ff]/20 active:scale-[0.98]"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center mt-8 gap-3">
          <button
            onClick={() => navigate('/language')}
            className="text-xs text-white/20 hover:text-white/40 flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            Change language
          </button>
          <p className="text-[10px] text-white/10">Powered by AWS AI Services</p>
        </div>
      </div>
    </div>
  );
}