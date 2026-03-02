import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore, useAuthStore } from '../store';

const LANGUAGES = [
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'en', name: 'English', english: 'English' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil' },
  { code: 'te', name: 'తెలుగు', english: 'Telugu' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali' },
  { code: 'mr', name: 'मराठी', english: 'Marathi' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', name: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', name: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'or', name: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'as', name: 'অসমীয়া', english: 'Assamese' },
  { code: 'ur', name: 'اردو', english: 'Urdu' },
  { code: 'sa', name: 'संस्कृतम्', english: 'Sanskrit' },
  { code: 'ne', name: 'नेपाली', english: 'Nepali' },
  { code: 'sd', name: 'سنڌي', english: 'Sindhi' },
];

export default function LanguageSelect() {
  const navigate = useNavigate();
  const { setLanguage } = useLanguageStore();
  const { isAuthenticated } = useAuthStore();
  const [selected, setSelected] = useState('');
  const [animating, setAnimating] = useState(false);

  const handleSelect = (lang) => {
    setSelected(lang.code);
    setAnimating(true);
    setLanguage(lang.code, lang.english);
    setTimeout(() => {
      navigate(isAuthenticated ? '/chat' : '/auth', { replace: true });
    }, 400);
  };

  return (
    <div className={`fixed inset-0 bg-[#060609] flex flex-col items-center justify-center p-6 transition-all duration-500 ${animating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      {/* Header */}
      <div className="mb-10 text-center z-10">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#00cc88] flex items-center justify-center shadow-lg shadow-[#00d4ff]/10">
            <svg viewBox="0 0 20 20" className="w-4.5 h-4.5" fill="white"><circle cx="10" cy="10" r="3" /></svg>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">CivicBridge</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Choose your language</h1>
        <p className="text-white/25 text-sm">Select the language you'd like to speak in</p>
      </div>

      {/* Language grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-w-2xl w-full z-10 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang)}
            className={`
              relative p-4 rounded-2xl text-left transition-all duration-200 border
              ${selected === lang.code
                ? 'bg-[#00d4ff]/8 border-[#00d4ff]/25 scale-[0.97]'
                : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]'}
            `}
          >
            <div className="text-lg font-semibold text-white/90 mb-0.5">{lang.name}</div>
            <div className="text-[11px] text-white/25">{lang.english}</div>
            {selected === lang.code && (
              <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00cc88] flex items-center justify-center">
                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}