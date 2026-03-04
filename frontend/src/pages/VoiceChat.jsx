import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useLanguageStore, useVoiceStore } from '../store';
import { chatAPI, documentsAPI, userAPI } from '../services/api';
import useNovaSonicCall from '../hooks/useNovaSonicCall';
import Globe from '../components/Globe';
import MarkdownMessage from '../components/MarkdownMessage';
import StreamingMessage from '../components/StreamingMessage';
import toast from 'react-hot-toast';

if (typeof window !== 'undefined') window.toast = toast;

const TAP_TEXT = {
  // Nova Sonic natively supported
  en: 'Tap to speak',
  hi: 'बोलने के लिए टैप करें',
  ta: 'தொடங்க தட்டவும்',
  te: 'ప్రారంభించడానికి నొక్కండి',
  bn: 'শুরু করতে ট্যাপ করুন',
  mr: 'सुरू करण्यासाठी टॅप करा',
  gu: 'શરૂ કરવા માટે ટેપ કરો',
  kn: 'ಪ್ರಾರಂಭಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
  ml: 'ആരംഭിക്കാൻ ടാപ്പ് ചെയ്യുക',
  pa: 'ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਟੈਪ ਕਰੋ',
  // Additional Indian languages
  or: 'ଆରମ୍ଭ କରିବାକୁ ଟ୍ୟାପ୍ କରନ୍ତୁ',
  as: 'আৰম্ভ কৰিবলৈ টেপ কৰক',
  ur: 'بولنے کے لیے ٹیپ کریں',
  mai: 'बजैबाक लेल टैप करू',
  kok: 'सुरू करुंक टॅप करा',
  ne: 'बोल्न ट्याप गर्नुहोस्',
  sd: 'ڳالهائڻ لاءِ ٽيپ ڪريو',
  ks: 'بولنے کے لیے ٹیپ کریں',
  doi: 'बोलने लई टैप करो',
  mni: 'ৱারোলো অসন্দোক ট্যাপ',
  sat: 'ᱯᱷᱚᱱ ᱠᱟᱛᱮ ᱴᱮᱯ ᱢᱮ',
  brx: 'गोनां गेलेब लानाय टेप',
  sa: 'वक्तुं स्पर्शतु',
};

export default function VoiceChat() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { language } = useLanguageStore();
  const { setStatus: setVoiceStoreStatus } = useVoiceStore();
  const chatEndRef = useRef(null);
  const fileRef = useRef(null);

  const [inCall, setInCall] = useState(false);
  const [status, setStatus] = useState('idle');
  const [micVolume, setMicVolume] = useState(0);
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [currentAppName, setCurrentAppName] = useState('New Session');
  const [formInfo, setFormInfo] = useState(null);
  const [formScreenshot, setFormScreenshot] = useState('');
  const [profileCompletion, setProfileCompletion] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingIdx, setStreamingIdx] = useState(-1);
  // OTP / CAPTCHA prompt from the live browser
  const [interactionPrompt, setInteractionPrompt] = useState(null); // {type:'otp'|'captcha', captchaImageBase64?}
  const [interactionInput, setInteractionInput] = useState('');

  // Handle form updates from the live form agent
  const handleFormUpdate = (update) => {
    const data = update?.data || update;
    setFormInfo(data);
    if (data?.screenshot_base64) setFormScreenshot(data.screenshot_base64);
    if (data?.newly_filled?.length > 0) {
      toast.success(`Filled: ${data.newly_filled.join(', ')}`, { duration: 2000, icon: '📝' });
    }
    // Clear any pending prompt if status is back to normal
    if (!['waiting_otp', 'waiting_captcha'].includes(data?.status)) {
      setInteractionPrompt(null);
      setInteractionInput('');
    }
  };

  const handleOtpRequest = (data) => {
    setInteractionPrompt({ type: 'otp' });
    setInteractionInput('');
    toast('🔐 OTP required — enter it below', { icon: '📱', duration: 4000 });
  };

  const handleCaptchaRequest = (data) => {
    setInteractionPrompt({ type: 'captcha', captchaImageBase64: data?.captcha_image_base64 || '' });
    setInteractionInput('');
    toast('🤖 CAPTCHA required — solve it below', { icon: '🔤', duration: 4000 });
  };

  const submitInteraction = () => {
    const val = interactionInput.trim();
    if (!val) return;
    if (interactionPrompt?.type === 'otp') {
      voiceCall.submitOtp(val);
      toast.success('OTP sent to browser', { icon: '✅' });
    } else {
      voiceCall.submitCaptcha(val);
      toast.success('CAPTCHA submitted', { icon: '✅' });
    }
    setInteractionPrompt(null);
    setInteractionInput('');
  };

  // Nova Sonic WebSocket-based voice hook (speech-to-speech)
  const voiceCall = useNovaSonicCall({
    conversationId, language,
    schemeId: formInfo?.scheme_id || null,
    onConversationId: setConversationId,
    onUserMessage: (text) => setMessages(p => [...p, { role: 'user', content: text, timestamp: new Date().toISOString() }]),
    onAIMessage: (text) => setMessages(p => {
      const newMsgs = [...p, { role: 'assistant', content: text, timestamp: new Date().toISOString() }];
      setStreamingIdx(newMsgs.length - 1);
      return newMsgs;
    }),
    onFormUpdate: handleFormUpdate,
    onOtpRequest: handleOtpRequest,
    onCaptchaRequest: handleCaptchaRequest,
    onStatusChange: (s) => { setStatus(s); setVoiceStoreStatus(s); },
    onVolumeChange: setMicVolume,
  });

  useEffect(() => { loadProfileStatus(); loadDocCount(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadProfileStatus = async () => {
    try {
      const resp = await userAPI.getProfile();
      const p = resp.data;
      const fields = ['name', 'email', 'phone_number', 'dob', 'gender', 'category', 'state', 'district', 'pincode', 'address'];
      setProfileCompletion(Math.round((fields.filter(f => p[f]).length / fields.length) * 100));
    } catch { setProfileCompletion(0); }
  };

  const loadDocCount = async () => {
    try {
      const resp = await documentsAPI.list();
      const docs = Array.isArray(resp.data) ? resp.data : resp.data?.documents || [];
      setDocCount(docs.length);
    } catch { setDocCount(0); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large (max 10MB)'); return; }
    setUploading(true);
    try {
      const resp = await documentsAPI.upload(file);
      const data = resp.data;

      // Handle duplicate case (backend returns 200 with status=duplicate)
      if (data.status === 'duplicate') {
        toast('📄 This document is already in your vault', {
          icon: 'ℹ️',
          style: { background: '#1a1a2e', color: '#8888aa', border: '1px solid #2a2a3a' },
          duration: 3000,
        });
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      const docType = data.document_type || 'document';
      const aiName = data.ai_generated_name || file.name;
      const extracted = data.extracted_data || {};
      
      // Show success with extracted info
      const nameField = extracted.name || '';
      const numField = extracted.document_number || '';
      const preview = [nameField, numField].filter(Boolean).join(' • ');
      toast.success(
        `✅ ${docType.replace(/_/g, ' ').toUpperCase()} uploaded${preview ? `: ${preview}` : ''}`,
        { duration: 4000 }
      );
      
      // Inform the AI about the new document
      const docMsg = `I just uploaded my ${docType.replace(/_/g, ' ')} document: "${aiName}". ${
        Object.keys(extracted).length > 0
          ? `Extracted: ${JSON.stringify(extracted, null, 0)}`
          : 'OCR could not extract text (low quality scan or unsupported format).'
      } Please acknowledge this and let me know what schemes I can now apply for.`;
      
      setMessages(p => [...p, { role: 'user', content: `📄 Uploaded: ${aiName}`, timestamp: new Date().toISOString() }]);
      setIsThinking(true);
      try {
        const chatResp = await chatAPI.sendMessage(docMsg, conversationId, language);
        const chatData = chatResp.data;
        setConversationId(chatData.conversation_id);
        if (chatData.message) {
          setMessages(p => {
            const newMsgs = [...p, { role: 'assistant', content: chatData.message, timestamp: new Date().toISOString() }];
            setStreamingIdx(newMsgs.length - 1);
            return newMsgs;
          });
        }
      } catch { /* ignore chat error after upload */ }
      setIsThinking(false);
      
      loadDocCount();
    } catch (err) {
      const detail = err.response?.data?.detail;
      // Show clean, human-friendly error
      const errMsg = typeof detail === 'string'
        ? detail
        : detail?.message || err.message || 'Upload failed';
      toast.error(errMsg);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGlobeClick = () => {
    if (!inCall) { setInCall(true); voiceCall.startCall(); }
    else if (status === 'speaking') { voiceCall.skipResponse(); }
  };

  const handleEndCall = () => { setInCall(false); voiceCall.endCall(); };

  const sendTextMessage = async () => {
    const msg = textInput.trim();
    if (!msg) return;
    setTextInput('');
    setMessages(p => [...p, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    if (!currentAppName || currentAppName === 'New Session') setCurrentAppName(msg.substring(0, 30));

    // Always send via WebSocket — this enables form filling for both text and voice chat
    // The hook auto-connects the WebSocket if not already connected
    try {
      await voiceCall.sendTextMessage(msg);
    } catch (e) {
      console.error('WebSocket text send failed, falling back to REST:', e);
      // Fallback to REST API if WebSocket fails
      setIsThinking(true);
      try {
        const resp = await chatAPI.sendMessage(msg, conversationId, language);
        const data = resp.data;
        setConversationId(data.conversation_id);
        if (data.message) {
          setMessages(p => {
            const newMsgs = [...p, { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }];
            setStreamingIdx(newMsgs.length - 1);
            return newMsgs;
          });
        }
        if (data.form_update) handleFormUpdate(data.form_update);
      } catch {
        setMessages(p => {
          const newMsgs = [...p, { role: 'assistant', content: 'Something went wrong. Please try again.', timestamp: new Date().toISOString() }];
          setStreamingIdx(newMsgs.length - 1);
          return newMsgs;
        });
      }
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } };
  const handleLogout = () => { if (inCall) voiceCall.endCall(); logout(); navigate('/auth', { replace: true }); };
  const tapText = TAP_TEXT[language] || TAP_TEXT['en'];
  const completionPercentage = formInfo?.fields_filled && formInfo?.total_fields ? Math.round((formInfo.fields_filled / formInfo.total_fields) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-[#060609] flex flex-col overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(120px)' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.015]"
          style={{ background: 'radial-gradient(circle, #00cc88, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      {/* ═══ TOP HEADER BAR ═══ */}
      <header className="relative z-30 flex items-center justify-between px-5 h-[56px] border-b border-white/[0.04] bg-[#060609]/80 backdrop-blur-xl">
        {/* Left: Hamburger + Account Name */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hover:bg-white/[0.06] transition-all">
              <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute left-0 top-12 z-50 w-52 bg-[#0e0e14] border border-white/[0.06] rounded-xl shadow-2xl p-1.5 animate-fade-in-up">
                  <button onClick={() => { setShowMenu(false); navigate('/profile'); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-white/60 text-xs hover:bg-white/[0.04] hover:text-white transition-all flex items-center gap-2.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Profile Settings
                  </button>
                  <button onClick={() => { setShowMenu(false); navigate('/schemes'); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-white/60 text-xs hover:bg-white/[0.04] hover:text-white transition-all flex items-center gap-2.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Browse Schemes
                  </button>
                  <button onClick={() => { setShowMenu(false); navigate('/applications'); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-white/60 text-xs hover:bg-white/[0.04] hover:text-white transition-all flex items-center gap-2.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    My Applications
                  </button>
                  <div className="h-px bg-white/[0.04] my-1" />
                  <button onClick={() => { setShowMenu(false); handleLogout(); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-red-400/70 text-xs hover:bg-red-500/10 hover:text-red-400 transition-all flex items-center gap-2.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-1.5">
            <span className="text-white font-semibold text-[14px] tracking-tight">{user?.name || 'User'}</span>
          </div>
        </div>

        {/* Center: CivicBridge Logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d4ff] to-[#00cc88] flex items-center justify-center shadow-lg shadow-[#00d4ff]/10">
            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="white"><circle cx="10" cy="10" r="3" /></svg>
          </div>
          <span className="text-white font-bold text-[15px] tracking-tight">CivicBridge</span>
        </div>

        {/* Right: Download App + Icons */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] transition-all">
            <span className="text-white/60 text-xs font-medium hidden sm:block">Download Mobile App</span>
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button onClick={() => navigate('/applications')} className="nav-btn" title="Applications">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden relative z-10">

        {/* ═══ LEFT COLUMN — Live Browser Projection ═══ */}
        <div className="w-[420px] border-r border-white/[0.04] flex flex-col bg-[#060609]/60 backdrop-blur-sm overflow-hidden">

          {/* ── Compact info row (always visible) ── */}
          <div className={`flex gap-2 p-2 border-b border-white/[0.04] shrink-0 ${formScreenshot ? '' : 'p-3'}`}>
            {formScreenshot ? (
              /* When form is active: thin horizontal bar */
              <>
                <button onClick={() => navigate('/profile')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[#00d4ff]/20 transition-all">
                  <svg className="w-3 h-3 text-[#00d4ff]/60 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#00d4ff" strokeWidth="3" strokeDasharray={`${profileCompletion} ${100-profileCompletion}`} strokeLinecap="round" />
                  </svg>
                  <span className="text-[9px] text-white/40">{profileCompletion}%</span>
                </button>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-[#00d4ff] text-[11px] font-bold">{docCount}</span>
                  <span className="text-[9px] text-white/25">docs</span>
                </div>
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.doc" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.06] text-white/30 hover:text-[#00d4ff] hover:border-[#00d4ff]/20 transition-all text-[9px]">
                  {uploading ? '...' : '↑ Upload'}
                </button>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${conversationId ? 'bg-[#00cc88]' : 'bg-white/10'}`} />
                  <span className="text-[9px] text-white/30 truncate max-w-[80px]">{currentAppName}</span>
                </div>
              </>
            ) : (
              /* When no form: full 3 cards (original) */
              <>
                {/* Profile Status Card */}
                <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-2xl p-3.5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-semibold text-white/30 uppercase tracking-widest">Profile Status</span>
                    <button onClick={() => navigate('/profile')} className="text-[9px] text-[#00d4ff]/60 hover:text-[#00d4ff] transition-colors font-medium">→</button>
                  </div>
                  <div className="flex justify-center">
                    <div className="relative">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2.5" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke="url(#pg)" strokeWidth="2.5"
                          strokeDasharray={`${profileCompletion} ${100 - profileCompletion}`} strokeLinecap="round" />
                        <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#00d4ff" /><stop offset="100%" stopColor="#00cc88" />
                        </linearGradient></defs>
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[13px] text-white font-bold">{profileCompletion}%</span>
                    </div>
                  </div>
                </div>

                {/* Documents Card */}
                <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-2xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-semibold text-white/30 uppercase tracking-widest">Documents</span>
                  </div>
                  <div className="text-center mb-2">
                    <span className="text-2xl font-bold text-[#00d4ff]">{docCount}</span>
                    <p className="text-[9px] text-white/20 mt-0.5">Total uploaded</p>
                  </div>
                  <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.doc" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.06] text-white/30 hover:text-[#00d4ff] hover:border-[#00d4ff]/20 transition-all text-[10px] font-medium disabled:opacity-40">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>

                {/* Application Name Card */}
                <div className="flex-1 bg-white/[0.02] border border-white/[0.04] rounded-2xl p-3.5">
                  <span className="text-[9px] font-semibold text-white/30 uppercase tracking-widest block mb-2">Application</span>
                  <p className="text-white/80 text-[13px] font-medium leading-snug">{currentAppName}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${conversationId ? 'bg-[#00cc88]' : 'bg-white/10'}`} />
                    <span className="text-white/20 text-[10px]">{conversationId ? 'Active' : 'Not started'}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Live Form Filling Area — full height landscape browser ── */}
          <div className="flex-1 flex flex-col min-h-0 p-2">
            {formInfo ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white/[0.02] border border-white/[0.04] rounded-2xl overflow-hidden">
                {/* Header: title + progress + status */}
                <div className="shrink-0 px-3 py-2 border-b border-white/[0.04]">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-white/80 font-semibold text-[12px]">Live Form Filling</h3>
                    <div className="flex items-center gap-2">
                      {formInfo.real_portal && (
                        <span className="text-[8px] text-yellow-400/70 bg-yellow-400/5 border border-yellow-400/10 rounded px-1.5 py-0.5">REAL PORTAL</span>
                      )}
                      <span className="text-[#00cc88] text-[10px] flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00cc88] animate-pulse" />Active
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#00d4ff] to-[#00cc88] rounded-full transition-all duration-500"
                        style={{ width: `${completionPercentage}%` }} />
                    </div>
                    <span className="text-[#00d4ff] text-[10px] font-bold shrink-0">{formInfo.fields_filled || 0}/{formInfo.total_fields || 0}</span>
                  </div>
                </div>

                {/* ───── LANDSCAPE BROWSER SCREENSHOT — fills remaining height ───── */}
                <div className="flex-1 flex flex-col min-h-0">
                  {formScreenshot ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      {/* Browser chrome bar */}
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-[#1a1a2e] border-b border-white/[0.04] shrink-0">
                        <div className="w-2 h-2 rounded-full bg-red-400/60" />
                        <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
                        <div className="w-2 h-2 rounded-full bg-green-400/60" />
                        <span className="text-[8px] text-white/20 ml-2 uppercase tracking-wider truncate flex-1">
                          {formInfo.page_name || 'Government Portal'}
                          {formInfo.current_page > 1 && ` — Page ${formInfo.current_page}`}
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00cc88] animate-pulse" />
                          <span className="text-[8px] text-[#00cc88]/80 font-bold">LIVE</span>
                        </div>
                      </div>
                      {/* Screenshot image — takes all available space */}
                      <div className="flex-1 overflow-hidden bg-white/[0.02] relative min-h-0">
                        <img
                          src={`data:image/${formInfo.screenshot_format || 'jpeg'};base64,${formScreenshot}`}
                          alt="Live browser — form filling in progress"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="animate-pulse flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
                        <span className="text-[10px] text-white/20">Loading browser...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ───── Compact filled fields overlay ───── */}
                {formInfo.filled_fields && Object.keys(formInfo.filled_fields).length > 0 && (
                  <div className="shrink-0 max-h-[140px] overflow-y-auto border-t border-white/[0.04] bg-[#060609]/90 scrollbar-thin">
                    <div className="px-2 py-1.5 space-y-1">
                      {Object.entries(formInfo.filled_fields).map(([key, value]) => {
                        const isNew = formInfo.newly_filled?.includes(key);
                        return (
                          <div key={key} className={`flex items-center justify-between rounded px-2 py-1 text-[10px] transition-all duration-300 ${
                            isNew
                              ? 'bg-[#00d4ff]/8 border border-[#00d4ff]/15'
                              : 'bg-white/[0.01]'
                          }`}>
                            <span className="text-white/25 capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className={`font-medium max-w-[55%] truncate ${isNew ? 'text-[#00d4ff]' : 'text-white/50'}`}>{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Empty state — no form in progress ── */
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-5">
                  <svg className="w-9 h-9 text-white/8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-white/25 text-sm font-medium mb-1">Live Browser</p>
                <p className="text-white/10 text-[11px] leading-relaxed max-w-[240px]">
                  When you start applying for a scheme, the AI agent will open the portal here and fill forms in real-time as you speak
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ CENTER - VOICE INTERFACE ═══ */}
        <main className="flex-1 flex flex-col items-center justify-center relative">
          {/* Application Completion % - Phase indicators */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl px-5 py-3 backdrop-blur-sm">
              <p className="text-[10px] text-white/30 uppercase tracking-widest text-center mb-2.5">Application Completion</p>
              <div className="flex items-center gap-1">
                {['Discovery', 'Documents', 'Form Fill', 'Submit'].map((phase, i) => (
                  <div key={phase} className="flex items-center">
                    <div className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all ${
                      i === 0 && (formInfo || conversationId) ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                      : i === 1 && docCount > 0 ? 'bg-[#00cc88]/10 text-[#00cc88] border border-[#00cc88]/20'
                      : i === 2 && formInfo ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20'
                      : 'bg-white/[0.02] text-white/15 border border-white/[0.04]'
                    }`}>{phase}</div>
                    {i < 3 && <div className="w-3 h-px bg-white/[0.06] mx-0.5" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Globe */}
          <div className="relative z-10">
            <Globe status={status} inCall={inCall} volume={micVolume} onClick={handleGlobeClick} tapText={tapText} />
          </div>

          {/* Play/Pause Call control */}
          <div className="mt-8 z-20">
            {inCall ? (
              <button onClick={handleEndCall}
                className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/20 transition-all active:scale-90 group">
                <svg className="w-6 h-6 text-white/40 group-hover:text-red-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              </button>
            ) : (
              <button onClick={handleGlobeClick}
                className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.06] hover:border-[#00d4ff]/20 transition-all active:scale-90 group">
                <svg className="w-6 h-6 text-white/40 group-hover:text-[#00d4ff] transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
          </div>
        </main>

        {/* ═══ RIGHT - AI CHAT PANEL ═══ */}
        <aside className="w-[420px] border-l border-white/[0.04] flex flex-col bg-[#060609]/60 backdrop-blur-sm">
          {/* Chat header */}
          <div className="px-5 h-[52px] flex items-center border-b border-white/[0.04]">
            <div className="flex items-center gap-2.5 flex-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d4ff]/15 to-[#00cc88]/10 flex items-center justify-center border border-white/[0.04]">
                <span className="text-[11px] font-bold text-[#00d4ff]">AI</span>
              </div>
              <div>
                <h3 className="text-white/80 font-semibold text-[13px]">AI Chat</h3>
                <p className="text-white/20 text-[10px]">
                  {status === 'speaking' ? 'Speaking...' : status === 'listening' ? 'Listening...' : status === 'processing' ? 'Thinking...' : 'Ready'}
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00d4ff]/10 to-[#00cc88]/5 border border-[#00d4ff]/10 flex items-center justify-center mb-4 shadow-lg shadow-[#00d4ff]/5">
                  <svg className="w-7 h-7 text-[#00d4ff]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-white/30 text-sm font-semibold">CivicBridge AI</p>
                <p className="text-white/15 text-[11px] mt-1.5 leading-relaxed max-w-[220px]">Ask about scholarships, government schemes, or start a voice conversation</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d4ff]/20 to-[#00cc88]/15 flex items-center justify-center mr-2.5 mt-1 flex-shrink-0 border border-[#00d4ff]/10 shadow-lg shadow-[#00d4ff]/5">
                    <span className="text-[9px] font-bold text-[#00d4ff]">AI</span>
                  </div>
                )}
                <div className={`rounded-2xl text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'max-w-[75%] bg-gradient-to-br from-white/[0.06] to-white/[0.03] text-white/85 border border-white/[0.08] rounded-br-md px-4 py-3'
                    : 'max-w-[88%] text-white/60 py-1'
                }`}>
                  {msg.role === 'user' && (
                    <p className="text-[9px] text-[#00d4ff]/30 font-semibold uppercase tracking-wider mb-1.5">You</p>
                  )}
                  {msg.role === 'assistant' ? (
                    <StreamingMessage
                      content={msg.content}
                      role={msg.role}
                      isNew={i === streamingIdx}
                      onComplete={() => setStreamingIdx(-1)}
                    />
                  ) : (
                    <MarkdownMessage content={msg.content} role={msg.role} />
                  )}
                </div>
              </div>
            ))}
            {/* Thinking indicator */}
            {isThinking && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#00d4ff]/20 to-[#00cc88]/15 flex items-center justify-center mr-2.5 mt-1 flex-shrink-0 border border-[#00d4ff]/10">
                  <span className="text-[9px] font-bold text-[#00d4ff]">AI</span>
                </div>
                <div className="flex items-center gap-1.5 px-4 py-3">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]/50 animate-bounce [animation-delay:0ms]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]/50 animate-bounce [animation-delay:150ms]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]/50 animate-bounce [animation-delay:300ms]"></div>
                  </div>
                  <span className="text-[11px] text-white/20 ml-1">Searching & thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/[0.04]">
            <div className="flex items-end gap-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-2 focus-within:border-[#00d4ff]/20 transition-colors">
              <textarea
                value={textInput}
                onChange={e => { setTextInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
                placeholder="Message CivicBridge..."
                rows={1}
                className="flex-1 bg-transparent text-white text-[13px] placeholder-white/20 outline-none resize-none max-h-[120px] py-1.5 leading-relaxed"
              />
              <button onClick={sendTextMessage} disabled={!textInput.trim()}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00d4ff] to-[#00cc88] flex items-center justify-center disabled:opacity-20 disabled:from-white/10 disabled:to-white/10 hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all active:scale-90 flex-shrink-0 mb-0.5">
                <svg className="w-4 h-4 text-[#060609]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </button>
            </div>
            <p className="text-center text-white/10 text-[10px] mt-2">CivicBridge AI can make mistakes. Verify important information.</p>
          </div>
        </aside>
      </div>

      {/* ═══ FOOTER BAR ═══ */}
      <footer className="relative z-30 flex items-center justify-between px-6 h-[36px] border-t border-white/[0.04] bg-[#060609]/80">
        <div />
        <p className="text-white/10 text-[10px] tracking-widest uppercase font-medium">Powered by AWS AI</p>
        <button onClick={handleLogout} title="Sign Out"
          className="w-7 h-7 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/15 transition-all group">
          <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </footer>

      {/* ═══ OTP / CAPTCHA MODAL ═══ */}
      {interactionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0e0e14] border border-white/[0.08] rounded-2xl p-6 w-[340px] shadow-2xl animate-fade-in-up">
            {interactionPrompt.type === 'otp' ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center text-xl">🔐</div>
                  <div>
                    <h3 className="text-white font-semibold text-[15px]">OTP Required</h3>
                    <p className="text-white/30 text-[11px]">The government portal has sent an OTP to your phone</p>
                  </div>
                </div>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Enter OTP"
                  value={interactionInput}
                  onChange={e => setInteractionInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && submitInteraction()}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-center text-2xl font-bold tracking-[0.3em] outline-none focus:border-[#00d4ff]/30 mb-4"
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#00cc88]/10 border border-[#00cc88]/20 flex items-center justify-center text-xl">🔤</div>
                  <div>
                    <h3 className="text-white font-semibold text-[15px]">CAPTCHA Required</h3>
                    <p className="text-white/30 text-[11px]">Solve the CAPTCHA to continue the form</p>
                  </div>
                </div>
                {interactionPrompt.captchaImageBase64 && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-white/[0.08] bg-white p-2">
                    <img
                      src={`data:image/png;base64,${interactionPrompt.captchaImageBase64}`}
                      alt="CAPTCHA"
                      className="w-full h-auto object-contain max-h-[80px]"
                    />
                  </div>
                )}
                <input
                  autoFocus
                  type="text"
                  placeholder="Type CAPTCHA text"
                  value={interactionInput}
                  onChange={e => setInteractionInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitInteraction()}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-center text-xl font-bold tracking-widest outline-none focus:border-[#00cc88]/30 mb-4"
                />
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setInteractionPrompt(null); setInteractionInput(''); }}
                className="flex-1 py-2.5 rounded-xl border border-white/[0.06] text-white/40 text-[12px] hover:bg-white/[0.03] transition-all">
                Cancel
              </button>
              <button
                onClick={submitInteraction}
                disabled={!interactionInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-[#060609] font-bold text-[12px] disabled:opacity-30 hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
