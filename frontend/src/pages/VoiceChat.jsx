/**
 * VoiceChat.jsx — CivicBridge AI Voice Chat (UMANG Design System)
 *
 * Layout  (desktop):  Left 1/3 — voice panel + chat  |  Right 2/3 — noVNC live browser
 * Layout  (mobile):   Full-screen chat; noVNC slides in when form starts
 *
 * Voice pipeline:  MediaRecorder → WS binary → Sarvam STT → Claude Haiku 4.5 → Sarvam TTS
 * Language:        Auto-detected by Sarvam STT; response spoken in same language
 * Form filling:    Playwright (headful) → noVNC iframe, OTP/CAPTCHA modals overlay
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, PhoneOff, Phone, MonitorPlay, CheckCircle, Loader2, Eye } from "lucide-react";
import { useElevenLabsCall } from "../hooks/useElevenLabsCall";
import { useAuthStore } from "../store";

const NOVNC_BASE = import.meta.env.VITE_NOVNC_URL || "http://localhost:6080";
const NOVNC_URL  = `${NOVNC_BASE}/vnc.html?autoconnect=true&resize=scale&show_dot=false&bell=false`;

/* ── Voice wave bars (from teammate's design) ──────────────── */
function VoiceWave({ active }) {
  return (
    <div className="flex items-center justify-center gap-[3px]">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{ width: 3, background: active ? "#1a237e" : "#cbd5e1" }}
          animate={active ? { height: [6, 28, 6] } : { height: 6 }}
          transition={active ? { duration: 0.6 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" } : {}}
        />
      ))}
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    idle:             { label: "Ready",         color: "bg-[#e2e8f0] text-[#64748b]" },
    connecting:       { label: "Connecting…",   color: "bg-[#3B82F6]/15 text-[#3B82F6]" },
    listening:        { label: "Listening",     color: "bg-[#22C55E]/15 text-[#22C55E]" },
    recording:        { label: "Recording…",    color: "bg-[#EF4444]/15 text-[#EF4444]" },
    processing:       { label: "Processing…",   color: "bg-[#FF9933]/15 text-[#FF9933]" },
    speaking:         { label: "Speaking…",     color: "bg-[#1a237e]/10 text-[#1a237e]" },
    filling:          { label: "Filling form",  color: "bg-[#FF9933]/15 text-[#FF9933]" },
    waiting_otp:      { label: "OTP needed",    color: "bg-[#EF4444]/15 text-[#EF4444]" },
    waiting_captcha:  { label: "CAPTCHA",       color: "bg-[#EF4444]/15 text-[#EF4444]" },
    done:             { label: "Done!",          color: "bg-[#22C55E]/15 text-[#22C55E]" },
  };
  const s = map[status] || { label: status, color: "bg-[#e2e8f0] text-[#64748b]" };
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function VoiceChat() {
  const { token } = useAuthStore();

  const [showBrowser, setShowBrowser]             = useState(false);
  const [formInfo, setFormInfo]                   = useState(null);
  const [waitingForOtp, setWaitingForOtp]         = useState(false);
  const [waitingForCaptcha, setWaitingForCaptcha] = useState(false);
  const [otpValue, setOtpValue]                   = useState("");
  const [captchaValue, setCaptchaValue]           = useState("");
  const [messages, setMessages]                   = useState([]);
  const [textInput, setTextInput]                 = useState("");
  const transcriptRef                             = useRef(null);

  const {
    inCall, status, isRecording,
    startCall, endCall,
    toggleRecording,
    sendTextMessage,
    submitOtp, submitCaptcha,
  } = useElevenLabsCall({
    token,
    onFormUpdate: (data) => {
      setFormInfo(data);
      if (data.status === "waiting_otp")       setWaitingForOtp(true);
      if (data.status === "otp_submitted")     setWaitingForOtp(false);
      if (data.status === "waiting_captcha")   setWaitingForCaptcha(true);
      if (data.status === "captcha_submitted") setWaitingForCaptcha(false);
    },
    onFormStarted: () => setShowBrowser(true),
    onFormStopped: () => { setShowBrowser(false); setFormInfo(null); },
    onTranscript: ({ role, text }) => {
      setMessages(prev => [...prev, { role, text, id: Date.now() }]);
      setTimeout(() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }), 100);
    },
  });

  const handleOtpSubmit = useCallback(async () => {
    if (!otpValue.trim()) return;
    await submitOtp(otpValue.trim());
    setOtpValue(""); setWaitingForOtp(false);
  }, [otpValue, submitOtp]);

  const handleCaptchaSubmit = useCallback(async () => {
    if (!captchaValue.trim()) return;
    await submitCaptcha(captchaValue.trim());
    setCaptchaValue(""); setWaitingForCaptcha(false);
  }, [captchaValue, submitCaptcha]);

  const handleSendText = useCallback(() => {
    if (!textInput.trim() || !inCall) return;
    sendTextMessage(textInput.trim());
    setTextInput("");
  }, [textInput, inCall, sendTextMessage]);

  const isActive = status === "listening" || status === "recording";
  const isBusy   = status === "processing" || status === "speaking";
  const formPct  = formInfo?.total_fields > 0
    ? Math.round(((formInfo.fields_filled || 0) / formInfo.total_fields) * 100)
    : 0;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f4f8", fontFamily: "'Noto Sans', system-ui, sans-serif" }}>

      {/* ══════════════════════════════════════════════
          LEFT PANEL — Voice chat (UMANG design)
          ══════════════════════════════════════════════ */}
      <div className="w-[380px] min-w-[320px] flex flex-col border-r border-[#e2e8f0] bg-white shadow-sm">

        {/* ── Header (navy gradient, tricolor strip) ── */}
        <div style={{ background: "linear-gradient(135deg, #1a237e 0%, #283593 40%, #3949ab 100%)" }} className="shrink-0">
          {/* tricolor strip */}
          <div className="h-1" style={{ background: "linear-gradient(90deg,#FF9933 0%,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%,#138808 100%)" }} />
          <div className="px-5 pt-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white font-bold text-sm">CB</span>
              </div>
              <div>
                <p className="text-white font-bold text-base leading-tight">CivicBridge AI</p>
                <p className="text-white/60 text-[11px]">सरकारी योजना सहायक</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </div>

        {/* ── Voice orb + wave ── */}
        <div className="shrink-0 px-5 py-4 border-b border-[#e2e8f0]" style={{ background: "linear-gradient(135deg,#EEF2FF,#F8FAFC)" }}>
          <div className="flex items-center gap-4">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={inCall ? toggleRecording : startCall}
              disabled={isBusy}
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 border-2 transition-all shadow-lg"
              style={
                isRecording
                  ? { background: "#FEF2F2", borderColor: "#EF4444", boxShadow: "0 0 0 6px rgba(239,68,68,0.15)" }
                  : isBusy
                  ? { background: "#f1f5f9", borderColor: "#cbd5e1", cursor: "not-allowed" }
                  : { background: "#1a237e", borderColor: "#1a237e", boxShadow: "0 4px 16px rgba(26,35,126,0.35)" }
              }
            >
              {isRecording
                ? <MicOff size={24} color="#EF4444" />
                : isBusy
                ? <Loader2 size={22} color="#94a3b8" className="animate-spin" />
                : inCall
                ? <Mic size={24} color="white" />
                : <Phone size={22} color="white" />
              }
            </motion.button>

            <div className="flex-1">
              <p className="text-[#1e293b] font-bold text-sm">
                {!inCall ? "Tap to start session" : isRecording ? "Listening… / सुन रहा हूँ…" : isBusy ? "Processing…" : "Tap mic to speak"}
              </p>
              <p className="text-[#64748b] text-[11px] mt-0.5">
                {!inCall ? "बातचीत शुरू करने के लिए टैप करें" : "Any Indian language supported"}
              </p>
              {isActive && <div className="mt-2"><VoiceWave active={isRecording} /></div>}
            </div>

            {inCall && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={endCall}
                className="w-10 h-10 rounded-full bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center hover:bg-[#EF4444]/20 transition-all"
              >
                <PhoneOff size={16} color="#EF4444" />
              </motion.button>
            )}
          </div>
        </div>

        {/* ── Transcript ── */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ background: "#f8fafc" }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="w-16 h-16 rounded-full bg-[#EEF2FF] flex items-center justify-center mb-4">
                <Mic size={28} color="#1a237e" />
              </div>
              <p className="text-[#1e293b] font-semibold mb-1">Voice AI Assistant</p>
              <p className="text-[#64748b] text-sm max-w-[220px] leading-relaxed">
                Start a session and speak in Hindi, Tamil, Telugu, Bengali or any Indian language
              </p>
              <p className="text-[11px] text-[#94a3b8] mt-3">Powered by Sarvam AI + Claude Haiku 4.5</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i === messages.length - 1 ? 0 : 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? { background: "#1a237e", color: "white", borderBottomRightRadius: 4 }
                      : { background: "white", color: "#1e293b", border: "1px solid #e2e8f0", borderBottomLeftRadius: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }
                  }
                >
                  {msg.role === "ai" && (
                    <span className="block text-[10px] font-bold text-[#1a237e] mb-1">CivicBridge AI</span>
                  )}
                  {msg.text}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* ── Form progress bar ── */}
        <AnimatePresence>
          {formInfo && formInfo.total_fields > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="shrink-0 px-4 py-3 border-t border-[#e2e8f0] bg-white"
            >
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-semibold text-[#1a237e] flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Filling form…
                </span>
                <span className="text-[#64748b]">{formInfo.fields_filled || 0} / {formInfo.total_fields} fields ({formPct}%)</span>
              </div>
              <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg,#FF9933,#1a237e)" }}
                  animate={{ width: `${formPct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              {formInfo.page_name && (
                <p className="text-[10px] text-[#94a3b8] mt-1">{formInfo.page_name}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Text input ── */}
        <div className="shrink-0 p-3 border-t border-[#e2e8f0] bg-white">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleRecording}
              disabled={!inCall || isBusy}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all border"
              style={
                isRecording
                  ? { background: "#FEF2F2", borderColor: "#EF4444", color: "#EF4444" }
                  : { background: "#FFF7ED", borderColor: "#FF9933", color: "#FF9933", opacity: !inCall ? 0.5 : 1 }
              }
            >
              <Mic size={16} />
            </motion.button>

            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendText()}
              placeholder="Type or speak your question… / अपना सवाल पूछें…"
              disabled={!inCall}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none border transition-colors"
              style={{
                background: "#f8fafc",
                borderColor: "#e2e8f0",
                color: "#1e293b",
              }}
              onFocus={e => e.target.style.borderColor = "#1a237e"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSendText}
              disabled={!textInput.trim() || !inCall}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
              style={{
                background: textInput.trim() && inCall ? "#1a237e" : "#e2e8f0",
                color: textInput.trim() && inCall ? "white" : "#94a3b8",
              }}
            >
              <Send size={15} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          RIGHT PANEL — noVNC live browser
          ══════════════════════════════════════════════ */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "#f0f4f8" }}>

        {showBrowser ? (
          <>
            {/* noVNC iframe — live Playwright browser */}
            <iframe
              src={NOVNC_URL}
              className="w-full h-full border-0"
              title="Live Government Portal"
              allow="clipboard-read; clipboard-write"
            />

            {/* Status chip */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-lg"
                style={{ background: "rgba(26,35,126,0.92)", color: "white", backdropFilter: "blur(8px)" }}>
                <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                Live Browser
                {formInfo?.page_name && <span className="text-white/60 ml-1">— {formInfo.page_name}</span>}
              </div>
            </div>

            {/* OTP modal ────────────────────────────── */}
            <AnimatePresence>
              {waitingForOtp && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-white rounded-2xl p-6 w-80 shadow-2xl border border-[#e2e8f0]"
                  >
                    {/* tricolor strip */}
                    <div className="h-1 rounded-t-2xl -mx-6 -mt-6 mb-5" style={{ background: "linear-gradient(90deg,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%)" }} />
                    <div className="text-center mb-5">
                      <div className="w-14 h-14 rounded-full bg-[#EEF2FF] flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">📱</span>
                      </div>
                      <h3 className="font-bold text-[#1e293b] text-lg">Enter OTP</h3>
                      <p className="text-sm text-[#64748b] mt-1">OTP sent to your registered mobile / आपके मोबाइल पर OTP भेजा गया</p>
                    </div>
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      value={otpValue}
                      onChange={e => setOtpValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleOtpSubmit()}
                      placeholder="• • • • • •"
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold outline-none border-2 mb-3 transition-colors"
                      style={{ borderColor: otpValue ? "#1a237e" : "#e2e8f0", color: "#1a237e" }}
                    />
                    <button
                      onClick={handleOtpSubmit}
                      disabled={!otpValue.trim()}
                      className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                      style={{
                        background: otpValue.trim() ? "#1a237e" : "#e2e8f0",
                        color: otpValue.trim() ? "white" : "#94a3b8",
                      }}
                    >
                      <CheckCircle size={16} className="inline mr-2" />
                      Submit OTP / सबमिट करें
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CAPTCHA modal ──────────────────────── */}
            <AnimatePresence>
              {waitingForCaptcha && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="bg-white rounded-2xl p-6 w-80 shadow-2xl border border-[#e2e8f0]"
                  >
                    <div className="h-1 rounded-t-2xl -mx-6 -mt-6 mb-5" style={{ background: "linear-gradient(90deg,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%)" }} />
                    <div className="text-center mb-5">
                      <div className="w-14 h-14 rounded-full bg-[#FFF7ED] flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">🔐</span>
                      </div>
                      <h3 className="font-bold text-[#1e293b] text-lg">Solve CAPTCHA</h3>
                      <p className="text-sm text-[#64748b] mt-1">Look at the live browser and type what you see / स्क्रीन पर दिखे कैप्चा टाइप करें</p>
                    </div>
                    <input
                      type="text"
                      value={captchaValue}
                      onChange={e => setCaptchaValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCaptchaSubmit()}
                      placeholder="Type CAPTCHA here…"
                      autoFocus
                      className="w-full rounded-xl px-4 py-3 text-center text-lg font-mono outline-none border-2 mb-3 transition-colors"
                      style={{ borderColor: captchaValue ? "#FF9933" : "#e2e8f0", color: "#1e293b" }}
                    />
                    <button
                      onClick={handleCaptchaSubmit}
                      disabled={!captchaValue.trim()}
                      className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                      style={{
                        background: captchaValue.trim() ? "#FF9933" : "#e2e8f0",
                        color: captchaValue.trim() ? "white" : "#94a3b8",
                      }}
                    >
                      Submit CAPTCHA / सबमिट करें
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (

          /* ── Idle state ── */
          <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg,#1a237e,#3949ab)" }}
            >
              <MonitorPlay size={40} color="white" />
            </motion.div>

            <div className="text-center">
              <p className="text-xl font-bold text-[#1e293b] mb-2">Live Form View</p>
              <p className="text-sm text-[#64748b] max-w-xs leading-relaxed">
                When the AI opens a government portal, you will watch it fill the form here in real time — like screen sharing.
              </p>
              <p className="text-xs text-[#94a3b8] mt-2">जब AI सरकारी फॉर्म भरना शुरू करे, यहाँ लाइव दिखेगा</p>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
              {[
                { icon: <Mic size={20} color="#1a237e" />, bg: "#EEF2FF", label: "Speak in any language", sub: "कोई भी भाषा" },
                { icon: <Eye size={20} color="#FF9933" />, bg: "#FFF7ED", label: "Watch live", sub: "लाइव देखें" },
                { icon: <CheckCircle size={20} color="#138808" />, bg: "#F0FDF4", label: "Confirm & submit", sub: "पुष्टि करें" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className="rounded-2xl p-4 text-center border border-[#e2e8f0] bg-white shadow-sm"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: item.bg }}>
                    {item.icon}
                  </div>
                  <p className="text-xs font-semibold text-[#1e293b]">{item.label}</p>
                  <p className="text-[10px] text-[#94a3b8] mt-0.5">{item.sub}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
