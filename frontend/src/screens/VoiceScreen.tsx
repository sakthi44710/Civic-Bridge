import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, Send, Phone, PhoneOff, FileText, Upload, Trash2,
  CheckCircle, Loader2, MonitorPlay, Eye, Bot, User, FolderOpen,
  MessageSquare, ChevronLeft, ChevronRight, Plus, Clock, Trash,
} from 'lucide-react';
import { useUserStore } from '@/stores/userStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { useVoiceCall, type FormUpdateData } from '@/hooks/useVoiceCall';
import { documentsAPI, chatAPI } from '@/services/api';
import Markdown from 'react-markdown';
import toast from 'react-hot-toast';

/* ── Voice wave bars (8 bars, matching original design) ── */
const VoiceWave: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex items-center justify-center gap-[3px]">
    {Array.from({ length: 8 }).map((_, i) => (
      <motion.div
        key={i}
        className="rounded-full"
        style={{ width: 3, background: active ? '#1a237e' : '#cbd5e1' }}
        animate={active ? { height: [6, 28, 6] } : { height: 6 }}
        transition={active ? { duration: 0.6 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' } : {}}
      />
    ))}
  </div>
);

/* ── Status badge with full state map ── */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string }> = {
    idle:            { label: 'Ready',        color: 'bg-[#e2e8f0] text-[#64748b]' },
    connecting:      { label: 'Connecting…',  color: 'bg-[#3B82F6]/15 text-[#3B82F6]' },
    listening:       { label: 'Listening',    color: 'bg-[#22C55E]/15 text-[#22C55E]' },
    recording:       { label: 'Recording…',   color: 'bg-[#EF4444]/15 text-[#EF4444]' },
    processing:      { label: 'Processing…',  color: 'bg-[#FF9933]/15 text-[#FF9933]' },
    speaking:        { label: 'Speaking…',    color: 'bg-[#1a237e]/10 text-[#1a237e]' },
    filling:         { label: 'Filling form', color: 'bg-[#FF9933]/15 text-[#FF9933]' },
    waiting_otp:     { label: 'OTP needed',   color: 'bg-[#EF4444]/15 text-[#EF4444]' },
    waiting_captcha: { label: 'CAPTCHA',      color: 'bg-[#EF4444]/15 text-[#EF4444]' },
    done:            { label: 'Done!',        color: 'bg-[#22C55E]/15 text-[#22C55E]' },
  };
  const s = map[status] || { label: status, color: 'bg-[#e2e8f0] text-[#64748b]' };
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>;
};

/* ================================================================
   MAIN VOICE SCREEN — 3-panel: Left docs | Center browser | Right chat
   ================================================================ */
export const VoiceScreen: React.FC = () => {
  const { token } = useUserStore();
  const { chatMessages: messages, addChatMessage, clearChatMessages, conversationId, setConversationId } = useVoiceStore();
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when returning to this tab with existing messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'instant' as ScrollBehavior }), 50);
    }
  }, []);

  const [showBrowser, setShowBrowser] = useState(false);
  const [formInfo, setFormInfo] = useState<FormUpdateData | null>(null);
  const [browserScreenshot, setBrowserScreenshot] = useState<string | null>(null);
  const [waitingForOtp, setWaitingForOtp] = useState(false);
  const [waitingForCaptcha, setWaitingForCaptcha] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [textInput, setTextInput] = useState('');
  const pendingTextRef = useRef<string | null>(null);

  // ── Conversation history state ──
  interface ConvSummary { conversation_id: string; created_at?: string; message_count: number; last_message: string; }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await chatAPI.getConversations();
      setConversations(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ } finally { setHistoryLoading(false); }
  }, []);

  // Fetch on mount + when panel opens
  useEffect(() => { if (historyOpen) fetchConversations(); }, [historyOpen, fetchConversations]);

  // ── Documents state ──
  interface DocItem { document_id: string; original_filename: string; ai_generated_name?: string; document_type: string; status: string; file_size?: number; upload_date?: string; extracted_data?: Record<string, string>; view_url?: string; }
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await documentsAPI.list();
      setDocs(res.data.documents || []);
    } catch { /* silently fail */ } finally { setDocsLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await documentsAPI.upload(file);
      if (res.data.status === 'duplicate') toast('This document was already uploaded', { icon: '📄' });
      else toast.success(`${res.data.ai_generated_name || file.name} uploaded`);
      await fetchDocs();
    } catch { toast.error('Upload failed'); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDoc = async (doc: DocItem) => {
    if (!window.confirm(`Delete "${doc.ai_generated_name || doc.original_filename}"?`)) return;
    try {
      await documentsAPI.delete(doc.document_id);
      setDocs(prev => prev.filter(d => d.document_id !== doc.document_id));
      toast.success('Document deleted');
    } catch { toast.error('Failed to delete'); }
  };

  // Merge all extracted_data from documents into a single map
  const extractedData: Record<string, string> = {};
  docs.forEach(d => {
    if (d.extracted_data) Object.entries(d.extracted_data).forEach(([k, v]) => {
      if (!v) return;
      if (typeof v === 'object') {
        Object.entries(v as Record<string, unknown>).forEach(([sk, sv]) => {
          if (sv && typeof sv !== 'object') extractedData[sk] = String(sv);
        });
      } else {
        extractedData[k] = String(v);
      }
    });
  });

  const {
    inCall, voiceMode, status, isRecording,
    startCall, startTextSession, endCall,
    enableVoice, disableVoice,
    sendTextMessage,
    submitOtp, submitCaptcha,
  } = useVoiceCall({
    token,
    conversationId,
    onFormUpdate: (data: FormUpdateData) => {
      setFormInfo(data);
      if (data.status === 'waiting_otp')       setWaitingForOtp(true);
      if (data.status === 'otp_submitted')     setWaitingForOtp(false);
      if (data.status === 'waiting_captcha')   setWaitingForCaptcha(true);
      if (data.status === 'captcha_submitted') setWaitingForCaptcha(false);
    },
    onFormStarted: () => setShowBrowser(true),
    onFormStopped: () => { setShowBrowser(false); setFormInfo(null); setBrowserScreenshot(null); },
    onScreenshot: (dataUrl: string) => setBrowserScreenshot(dataUrl),
    onTranscript: ({ role, text }: { role: string; text: string }) => {
      addChatMessage({ role, text, id: Date.now() });
      setTimeout(() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' }), 100);
      // Refresh documents when AI responds (may have updated extracted data)
      if (role === 'assistant') fetchDocs();
    },
    onSessionStarted: ({ conversation_id }: { conversation_id: string }) => {
      if (conversation_id) setConversationId(conversation_id);
    },
  });

  // ── Conversation history handlers (must be after useVoiceCall) ──
  const handleResumeConversation = useCallback(async (conv: ConvSummary) => {
    if (inCall) endCall();
    try {
      const res = await chatAPI.getConversation(conv.conversation_id);
      const msgs = res.data?.messages || [];
      clearChatMessages();
      for (const m of msgs) {
        addChatMessage({ id: Date.now() + Math.random(), role: m.role, text: m.content || '' });
      }
      setConversationId(conv.conversation_id);
      setHistoryOpen(false);
      toast.success('Conversation loaded');
    } catch { toast.error('Failed to load conversation'); }
  }, [inCall, endCall, clearChatMessages, addChatMessage, setConversationId]);

  const handleNewConversation = useCallback(() => {
    if (inCall) endCall();
    clearChatMessages();
    setConversationId(null);
    setHistoryOpen(false);
  }, [inCall, endCall, clearChatMessages, setConversationId]);

  const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await chatAPI.deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.conversation_id !== convId));
      if (conversationId === convId) { clearChatMessages(); setConversationId(null); }
    } catch { toast.error('Failed to delete'); }
  }, [conversationId, clearChatMessages, setConversationId]);

  const handleOtpSubmit = useCallback(() => {
    if (!otpValue.trim()) return;
    submitOtp(otpValue.trim());
    setOtpValue('');
    setWaitingForOtp(false);
  }, [otpValue, submitOtp]);

  const handleCaptchaSubmit = useCallback(() => {
    if (!captchaValue.trim()) return;
    submitCaptcha(captchaValue.trim());
    setCaptchaValue('');
    setWaitingForCaptcha(false);
  }, [captchaValue, submitCaptcha]);

  const handleSendText = useCallback(() => {
    if (!textInput.trim()) return;
    if (!inCall) {
      // Text-only session — connect WS without enabling mic/auto-listen
      pendingTextRef.current = textInput.trim();
      setTextInput('');
      startTextSession();
      return;
    }
    sendTextMessage(textInput.trim());
    setTextInput('');
  }, [textInput, inCall, startTextSession, sendTextMessage]);

  useEffect(() => {
    if (status === 'listening' && pendingTextRef.current) {
      const msg = pendingTextRef.current;
      pendingTextRef.current = null;
      sendTextMessage(msg);
    }
  }, [status, sendTextMessage]);

  const isBusy = status === 'processing' || status === 'speaking';
  const formPct = formInfo?.total_fields && formInfo.total_fields > 0
    ? Math.round(((formInfo.fields_filled || 0) / formInfo.total_fields) * 100)
    : 0;

  const FIELD_LABELS: Record<string, string> = {
    full_name: 'Full Name', name: 'Name', date_of_birth: 'Date of Birth', dob: 'DOB',
    gender: 'Gender', father_name: "Father's Name", mother_name: "Mother's Name",
    aadhaar_number: 'Aadhaar No.', pan_number: 'PAN No.', voter_id: 'Voter ID',
    phone: 'Phone', mobile: 'Mobile', email: 'Email', address: 'Address',
    state: 'State', district: 'District', pincode: 'PIN Code',
    bank_account: 'Bank A/C', ifsc: 'IFSC', income: 'Income', caste: 'Caste',
    category: 'Category', occupation: 'Occupation', qualification: 'Qualification',
  };

  return (
    <div
      className="flex overflow-hidden rounded-2xl border border-[#e2e8f0] shadow-sm w-full"
      style={{ height: 'calc(100dvh - 100px)', fontFamily: "'Noto Sans', system-ui, sans-serif" }}
    >

      {/* ══════════════════════════════════════════════════════
          LEFT PANEL — Documents + Extracted Data
          ══════════════════════════════════════════════════════ */}
      <div className="w-[280px] min-w-[240px] flex flex-col border-r border-[#e2e8f0] bg-white">

        {/* ── Top: Uploaded Documents ── */}
        <div className="flex flex-col h-1/2 border-b border-[#e2e8f0]">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-[#f0f0f0]" style={{ background: 'linear-gradient(135deg,#EEF2FF,#F8FAFC)' }}>
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-[#1a237e]" />
              <span className="text-xs font-bold text-[#1a237e] uppercase tracking-wider">Documents</span>
            </div>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a237e] text-white text-[10px] font-semibold hover:bg-[#283593] transition-colors disabled:opacity-50 cursor-pointer">
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {uploading ? '…' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.jpg,.jpeg,.png" onChange={handleUpload} />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {docsLoading ? (
              <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[#1a237e]" /></div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <FolderOpen size={28} className="text-[#cbd5e1] mb-2" />
                <p className="text-[11px] text-[#94a3b8]">No documents uploaded</p>
                <button onClick={() => fileInputRef.current?.click()} className="text-[11px] text-[#1a237e] font-semibold mt-1 hover:underline cursor-pointer">Upload now</button>
              </div>
            ) : (
              docs.map((doc) => (
                <div key={doc.document_id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[#f8fafc] group transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-[#1a237e]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#1e293b] truncate">{doc.ai_generated_name || doc.original_filename}</p>
                    <p className="text-[9px] text-[#94a3b8]">{doc.document_type?.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${doc.status === 'processed' || doc.status === 'verified' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <button onClick={() => handleDeleteDoc(doc)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-[#cbd5e1] hover:text-red-400 transition-all cursor-pointer">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Bottom: Extracted/Known Data ── */}
        <div className="flex flex-col h-1/2">
          <div className="shrink-0 px-4 py-3 border-b border-[#f0f0f0]" style={{ background: 'linear-gradient(135deg,#F0FDF4,#F8FAFC)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle size={15} className="text-[#138808]" />
              <span className="text-xs font-bold text-[#138808] uppercase tracking-wider">Known Details</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {Object.keys(extractedData).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-3">
                <p className="text-[11px] text-[#94a3b8] leading-relaxed">Upload documents to auto-extract your details (Aadhaar, PAN, etc.)</p>
              </div>
            ) : (
              <div className="space-y-1">
                {Object.entries(extractedData).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[#f8fafc]">
                    <span className="text-[10px] text-[#94a3b8] w-[72px] shrink-0 pt-0.5 truncate" title={key}>{FIELD_LABELS[key] || key.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] font-medium text-[#1e293b] flex-1 break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CENTER PANEL — Live Form Filling (noVNC)
          ══════════════════════════════════════════════════════ */}
      <div className="flex-1 relative overflow-hidden flex flex-col" style={{ background: '#f0f4f8' }}>

        {/* Form progress bar (top) */}
        <AnimatePresence>
          {formInfo && formInfo.total_fields && formInfo.total_fields > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="shrink-0 px-4 py-2.5 border-b border-[#e2e8f0] bg-white"
            >
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#1a237e] flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Filling form…
                </span>
                <span className="text-[#64748b]">{formInfo.fields_filled || 0} / {formInfo.total_fields} fields ({formPct}%)</span>
              </div>
              <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#FF9933,#1a237e)' }}
                  animate={{ width: `${formPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              </div>
              {formInfo.page_name && <p className="text-[10px] text-[#94a3b8] mt-1">{formInfo.page_name}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Browser / Idle state */}
        <div className="flex-1 relative overflow-hidden">
          {showBrowser ? (
            <>
              {/* Live screenshot stream from headless Playwright */}
              <div className="w-full h-full bg-[#1a1a2e] flex items-center justify-center">
                {browserScreenshot ? (
                  <img
                    src={browserScreenshot}
                    alt="Live browser"
                    className="max-w-full max-h-full object-contain"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-white/70">
                    <Loader2 size={40} className="animate-spin" />
                    <p className="text-sm font-medium">Launching browser…</p>
                    <p className="text-xs text-white/40">The live view will appear here</p>
                  </div>
                )}
              </div>

              {/* Status overlay */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-lg"
                  style={{ background: 'rgba(26,35,126,0.92)', color: 'white', backdropFilter: 'blur(8px)' }}>
                  <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                  {formInfo?.status === 'done' ? 'Form Filling Complete' :
                   formInfo?.status === 'waiting_otp' ? 'Waiting for OTP…' :
                   formInfo?.status === 'waiting_captcha' ? 'Waiting for CAPTCHA…' :
                   'Live Browser — AI Filling Form'}
                  {formInfo?.page_name && <span className="text-white/60 ml-1">— {formInfo.page_name}</span>}
                </div>
              </div>

              {/* Bottom progress bar overlay */}
              {formInfo && (formInfo.total_fields ?? 0) > 0 && (
                <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none px-4 pb-3">
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-[#e2e8f0]">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-[#1a237e] flex items-center gap-1">
                        {formInfo.status === 'done'
                          ? <><CheckCircle size={11} className="text-[#22C55E]" /> Complete</>
                          : <><Loader2 size={11} className="animate-spin" /> Filling…</>}
                      </span>
                      <span className="text-[#64748b]">{formInfo.fields_filled || 0} / {formInfo.total_fields} fields ({formPct}%)</span>
                    </div>
                    <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#FF9933,#138808)' }}
                        animate={{ width: `${formPct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* OTP modal */}
              <AnimatePresence>
                {waitingForOtp && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                      className="bg-white rounded-2xl p-6 w-80 shadow-2xl border border-[#e2e8f0]">
                      <div className="h-1 rounded-t-2xl -mx-6 -mt-6 mb-5" style={{ background: 'linear-gradient(90deg,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%)' }} />
                      <div className="text-center mb-5">
                        <div className="w-14 h-14 rounded-full bg-[#EEF2FF] flex items-center justify-center mx-auto mb-3"><span className="text-2xl">📱</span></div>
                        <h3 className="font-bold text-[#1e293b] text-lg">Enter OTP</h3>
                        <p className="text-sm text-[#64748b] mt-1">OTP sent to your registered mobile</p>
                      </div>
                      <input type="text" inputMode="numeric" maxLength={6} value={otpValue} onChange={e => setOtpValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleOtpSubmit()} placeholder="• • • • • •" autoFocus
                        className="w-full rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold outline-none border-2 mb-3 transition-colors"
                        style={{ borderColor: otpValue ? '#1a237e' : '#e2e8f0', color: '#1a237e' }} />
                      <button onClick={handleOtpSubmit} disabled={!otpValue.trim()}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer"
                        style={{ background: otpValue.trim() ? '#1a237e' : '#e2e8f0', color: otpValue.trim() ? 'white' : '#94a3b8' }}>
                        <CheckCircle size={16} className="inline mr-2" /> Submit OTP
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CAPTCHA modal */}
              <AnimatePresence>
                {waitingForCaptcha && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                      className="bg-white rounded-2xl p-6 shadow-2xl border border-[#e2e8f0]" style={{ width: browserScreenshot ? 480 : 320, maxWidth: '95vw' }}>
                      <div className="h-1 rounded-t-2xl -mx-6 -mt-6 mb-5" style={{ background: 'linear-gradient(90deg,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%)' }} />
                      <div className="text-center mb-4">
                        <div className="w-14 h-14 rounded-full bg-[#FFF7ED] flex items-center justify-center mx-auto mb-3"><span className="text-2xl">🔐</span></div>
                        <h3 className="font-bold text-[#1e293b] text-lg">Solve CAPTCHA</h3>
                        <p className="text-sm text-[#64748b] mt-1">Type the characters shown below</p>
                      </div>
                      {browserScreenshot && (
                        <div className="mb-4 rounded-xl overflow-hidden border-2 border-[#e2e8f0] bg-[#f8fafc]">
                          <img src={browserScreenshot} alt="Browser view showing CAPTCHA" className="w-full rounded-xl" />
                        </div>
                      )}
                      <input type="text" value={captchaValue} onChange={e => setCaptchaValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCaptchaSubmit()} placeholder="Type CAPTCHA here…" autoFocus
                        className="w-full rounded-xl px-4 py-3 text-center text-lg font-mono outline-none border-2 mb-3 transition-colors"
                        style={{ borderColor: captchaValue ? '#FF9933' : '#e2e8f0', color: '#1e293b' }} />
                      <button onClick={handleCaptchaSubmit} disabled={!captchaValue.trim()}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer"
                        style={{ background: captchaValue.trim() ? '#FF9933' : '#e2e8f0', color: captchaValue.trim() ? 'white' : '#94a3b8' }}>
                        Submit CAPTCHA
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            /* ── Idle state ── */
            <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}
                className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: 'linear-gradient(135deg,#1a237e,#3949ab)' }}>
                <MonitorPlay size={40} color="white" />
              </motion.div>
              <div className="text-center">
                <p className="text-xl font-bold text-[#1e293b] mb-2">Live Form View</p>
                <p className="text-sm text-[#64748b] max-w-xs leading-relaxed">
                  When the AI starts filling a form, you will see the live progress here — fields being filled one by one.
                </p>
                <p className="text-xs text-[#94a3b8] mt-2">जब AI फॉर्म भरना शुरू करे, यहाँ लाइव दिखेगा</p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                {[
                  { icon: <Mic size={20} color="#1a237e" />, bg: '#EEF2FF', label: 'Speak in any language', sub: 'कोई भी भाषा' },
                  { icon: <Eye size={20} color="#FF9933" />, bg: '#FFF7ED', label: 'Watch live', sub: 'लाइव देखें' },
                  { icon: <CheckCircle size={20} color="#138808" />, bg: '#F0FDF4', label: 'Confirm & submit', sub: 'पुष्टि करें' },
                ].map((item, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1 }}
                    className="rounded-2xl p-4 text-center border border-[#e2e8f0] bg-white shadow-sm">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: item.bg }}>{item.icon}</div>
                    <p className="text-xs font-semibold text-[#1e293b]">{item.label}</p>
                    <p className="text-[10px] text-[#94a3b8] mt-0.5">{item.sub}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT PANEL — Chat (ChatGPT-style)
          ══════════════════════════════════════════════════════ */}
      <div className="w-[360px] min-w-[300px] flex flex-col border-l border-[#e2e8f0] bg-white relative overflow-hidden">

        {/* ── Chat header ── */}
        <div style={{ background: 'linear-gradient(135deg, #1a237e 0%, #283593 40%, #3949ab 100%)' }} className="shrink-0 z-10">
          <div className="h-1" style={{ background: 'linear-gradient(90deg,#FF9933 0%,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%,#138808 100%)' }} />
          <div className="px-4 pt-3 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setHistoryOpen(!historyOpen)} title="Chat history"
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors cursor-pointer">
                {historyOpen ? <ChevronRight size={16} color="white" /> : <MessageSquare size={14} color="white" />}
              </button>
              <div>
                <p className="text-white font-bold text-sm leading-tight">CivicBridge AI</p>
                <p className="text-white/60 text-[10px]">सरकारी योजना सहायक</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              <button onClick={handleNewConversation} title="New conversation"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer">
                <Plus size={13} color="white" />
              </button>
              {inCall && (
                <button onClick={endCall} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer">
                  <PhoneOff size={13} color="#EF4444" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Sliding history panel (overlay) ── */}
        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="absolute inset-0 top-[52px] z-20 bg-white flex flex-col border-r border-[#e2e8f0]"
            >
              <div className="shrink-0 px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#EEF2FF,#F8FAFC)' }}>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-[#1a237e]" />
                  <span className="text-xs font-bold text-[#1a237e] uppercase tracking-wider">History</span>
                </div>
                <button onClick={() => setHistoryOpen(false)} className="w-6 h-6 rounded-full hover:bg-[#e2e8f0] flex items-center justify-center transition-colors cursor-pointer">
                  <ChevronLeft size={14} className="text-[#64748b]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {historyLoading ? (
                  <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-[#1a237e]" /></div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                    <MessageSquare size={24} className="text-[#cbd5e1] mb-2" />
                    <p className="text-[11px] text-[#94a3b8]">No conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button key={conv.conversation_id} onClick={() => handleResumeConversation(conv)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all cursor-pointer group ${
                        conversationId === conv.conversation_id ? 'bg-[#EEF2FF] border border-[#1a237e]/20' : 'hover:bg-[#f8fafc]'
                      }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-[#1e293b] truncate">{conv.last_message || 'New conversation'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-[#94a3b8]">
                              {conv.created_at ? new Date(conv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            <span className="text-[9px] text-[#94a3b8]">{conv.message_count} msgs</span>
                          </div>
                        </div>
                        <button onClick={(e) => handleDeleteConversation(conv.conversation_id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-[#cbd5e1] hover:text-red-400 transition-all cursor-pointer shrink-0">
                          <Trash size={11} />
                        </button>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="shrink-0 p-2 border-t border-[#e2e8f0]">
                <button onClick={handleNewConversation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1a237e] text-white text-[11px] font-semibold hover:bg-[#283593] transition-colors cursor-pointer">
                  <Plus size={13} /> New Conversation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Voice orb (compact) ── */}
        <div className="shrink-0 px-4 py-3 border-b border-[#e2e8f0]" style={{ background: 'linear-gradient(135deg,#EEF2FF,#F8FAFC)' }}>
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.92 }} onClick={
              !inCall ? startCall : voiceMode ? disableVoice : enableVoice
            }
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 transition-all shadow-md cursor-pointer"
              style={
                !voiceMode
                  ? { background: '#1a237e', borderColor: '#1a237e', boxShadow: '0 3px 12px rgba(26,35,126,0.35)' }
                  : isRecording
                  ? { background: '#FEF2F2', borderColor: '#EF4444', boxShadow: '0 0 0 4px rgba(239,68,68,0.15)' }
                  : isBusy
                  ? { background: '#FFF7ED', borderColor: '#FF9933', boxShadow: '0 0 0 4px rgba(255,153,51,0.12)' }
                  : { background: '#F0FDF4', borderColor: '#138808', boxShadow: '0 0 0 4px rgba(19,136,8,0.12)' }
              }>
              {!voiceMode ? <Phone size={18} color="white" /> : isRecording ? <Mic size={20} color="#EF4444" />
                : isBusy ? <Loader2 size={18} color="#FF9933" className="animate-spin" /> : <Mic size={20} color="#138808" />}
            </motion.button>
            <div className="flex-1 min-w-0">
              <p className="text-[#1e293b] font-semibold text-[13px]">
                {!voiceMode ? 'Tap to start voice' : isRecording ? 'Listening…' : isBusy ? 'AI thinking…' : 'Listening…'}
              </p>
              <div className="h-[22px] mt-1 flex items-center">
                {voiceMode && <VoiceWave active={isRecording} />}
              </div>
            </div>
            {inCall && (
              <button onClick={endCall} className="w-8 h-8 rounded-full bg-[#FEF2F2] hover:bg-[#FEE2E2] flex items-center justify-center transition-colors cursor-pointer border border-red-200" title="End session">
                <PhoneOff size={14} color="#EF4444" />
              </button>
            )}
          </div>
        </div>

        {/* ── Messages (ChatGPT-style) ── */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto min-h-0" style={{ background: '#ffffff' }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-[#1a237e] flex items-center justify-center mb-3">
                <Bot size={22} color="white" />
              </div>
              <p className="text-[#1e293b] font-semibold text-sm mb-1">CivicBridge AI</p>
              <p className="text-[#64748b] text-xs max-w-[220px] leading-relaxed">
                Ask about government schemes, check eligibility, or get help filling forms
              </p>
              <div className="flex gap-1.5 mt-3 flex-wrap justify-center">
                {['Search schemes', 'Check eligibility', 'Fill a form'].map((s) => (
                  <span key={s} className="text-[10px] px-2.5 py-1 rounded-full bg-[#f0f4f8] text-[#64748b] border border-[#e2e8f0]">{s}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                  className="px-4 py-4" style={{ background: msg.role === 'user' ? '#ffffff' : '#f7f7f8' }}>
                  <div className="flex gap-2.5 max-w-full">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.role === 'user' ? 'bg-[#1a237e]' : 'bg-gradient-to-br from-[#1a237e] to-[#3949ab]'}`}>
                      {msg.role === 'user' ? <User size={12} color="white" /> : <Bot size={12} color="white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-[#1e293b] mb-1">{msg.role === 'user' ? 'You' : 'CivicBridge AI'}</p>
                      {msg.role === 'user' ? (
                        <p className="text-[13px] leading-relaxed text-[#1e293b]">{msg.text}</p>
                      ) : (
                        <div className="text-[13px] leading-relaxed text-[#374151] prose prose-sm max-w-none prose-p:my-1 prose-strong:text-[#1e293b] prose-ul:my-1 prose-li:my-0">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {status === 'processing' && (
                <div className="px-4 py-4" style={{ background: '#f7f7f8' }}>
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1a237e] to-[#3949ab] flex items-center justify-center shrink-0">
                      <Bot size={12} color="white" />
                    </div>
                    <div className="flex items-center gap-1.5 pt-2">
                      {[0, 1, 2].map((i) => (
                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]"
                          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Text input ── */}
        <div className="shrink-0 px-3 py-3 border-t border-[#e8e8e8] bg-white">
          <div className="flex items-center gap-2 rounded-2xl border border-[#d9d9e3] bg-[#f9f9f9] px-3 py-1 focus-within:border-[#1a237e] focus-within:shadow-[0_0_0_2px_rgba(26,35,126,0.1)] transition-all">
            <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
              placeholder="Type your question..."
              className="flex-1 bg-transparent text-[13px] outline-none text-[#1e293b] placeholder:text-[#9ca3af] py-2" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleSendText} disabled={!textInput.trim()}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer"
              style={{ background: textInput.trim() ? '#1a237e' : 'transparent', color: textInput.trim() ? 'white' : '#c5c5d2' }}>
              <Send size={14} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};
