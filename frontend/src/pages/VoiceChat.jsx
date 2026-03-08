// VoiceChat.jsx -- Main page
//
// Layout:
//   Left  1/3  -- Sarvam voice widget (push-to-talk) + transcript + form progress
//   Right 2/3  -- noVNC iframe (live browser) OR idle placeholder
//
// Voice pipeline: MediaRecorder → WebSocket binary → Sarvam STT → Claude Haiku 4.5 → Sarvam TTS → audio
// Language: auto-detected by Sarvam; responses are in the same language
//
// OTP and CAPTCHA modals float over the noVNC iframe.
// No ElevenLabs dependency — fully replaced by Sarvam AI + Claude Haiku 4.5.

import { useState, useRef, useCallback } from "react";
import { useElevenLabsCall } from "../hooks/useElevenLabsCall";
import { useAuthStore } from "../store";

const NOVNC_BASE = import.meta.env.VITE_NOVNC_URL || "http://localhost:6080";
const NOVNC_URL  = `${NOVNC_BASE}/vnc.html?autoconnect=true&resize=scale&show_dot=false&bell=false`;

export default function VoiceChat() {
  const { token } = useAuthStore();

  const [showBrowser, setShowBrowser]               = useState(false);
  const [formInfo, setFormInfo]                     = useState(null);
  const [waitingForOtp, setWaitingForOtp]           = useState(false);
  const [waitingForCaptcha, setWaitingForCaptcha]   = useState(false);
  const [otpValue, setOtpValue]                     = useState("");
  const [captchaValue, setCaptchaValue]             = useState("");
  const [messages, setMessages]                     = useState([]);
  const [textInput, setTextInput]                   = useState("");
  const transcriptRef                               = useRef(null);

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
      setTimeout(() => transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight, behavior: "smooth"
      }), 100);
    },
  });

  const handleOtpSubmit = useCallback(async () => {
    if (!otpValue.trim()) return;
    await submitOtp(otpValue.trim());
    setOtpValue("");
    setWaitingForOtp(false);
  }, [otpValue, submitOtp]);

  const handleCaptchaSubmit = useCallback(async () => {
    if (!captchaValue.trim()) return;
    await submitCaptcha(captchaValue.trim());
    setCaptchaValue("");
    setWaitingForCaptcha(false);
  }, [captchaValue, submitCaptcha]);

  const handleSendText = useCallback(() => {
    if (!textInput.trim() || !inCall) return;
    sendTextMessage(textInput.trim());
    setTextInput("");
  }, [textInput, inCall, sendTextMessage]);

  const statusLabel = {
    idle: "Ready", connecting: "Connecting...", listening: "Listening",
    recording: "Recording...", processing: "Processing...", speaking: "Speaking...",
    filling: "Filling form...", waiting_otp: "Waiting for OTP",
    waiting_captcha: "Waiting for CAPTCHA", done: "Done!",
  }[status] || status;

  const micBtnClass = isRecording
    ? "bg-red-600 hover:bg-red-700 animate-pulse"
    : status === "processing" || status === "speaking"
      ? "bg-gray-600 cursor-not-allowed"
      : "bg-cyan-600 hover:bg-cyan-700";

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* LEFT -- Voice chat panel */}
      <div className="w-1/3 min-w-[300px] flex flex-col border-r border-gray-800">

        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${inCall ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
          <span className="font-semibold text-lg">CivicBridge</span>
          <span className="ml-auto text-xs text-gray-400">{statusLabel}</span>
        </div>

        {/* Transcript */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-5xl mb-3">🎙️</p>
              <p className="text-sm">Start a session and speak in any Indian language</p>
              <p className="text-xs mt-2 text-gray-600">Powered by Sarvam AI + Claude Haiku</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === "user" ? "bg-cyan-700 text-white" : "bg-gray-800 text-gray-100"
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Form progress bar */}
        {formInfo && formInfo.total_fields > 0 && (
          <div className="px-4 py-2 bg-gray-900 border-t border-gray-800">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Form progress</span>
              <span>{formInfo.fields_filled || 0} / {formInfo.total_fields} fields</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${((formInfo.fields_filled||0)/formInfo.total_fields)*100}%` }}
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="p-4 border-t border-gray-800 space-y-2">
          {!inCall ? (
            <button
              onClick={startCall}
              className="w-full py-3 rounded-xl font-semibold bg-cyan-600 hover:bg-cyan-700 transition-all"
            >
              📞 Start Session
            </button>
          ) : (
            <>
              {/* Push-to-talk mic button */}
              <button
                onClick={toggleRecording}
                disabled={status === "processing" || status === "speaking"}
                className={`w-full py-3 rounded-xl font-semibold transition-all ${micBtnClass}`}
              >
                {isRecording ? "⏹ Stop Recording" : "🎙 Tap to Speak"}
              </button>

              {/* Text input row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendText()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleSendText}
                  disabled={!textInput.trim()}
                  className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 rounded-xl text-sm transition-all"
                >
                  ↑
                </button>
              </div>

              <button
                onClick={endCall}
                className="w-full py-2 rounded-xl font-semibold bg-red-700 hover:bg-red-600 transition-all text-sm"
              >
                ⏹ End Session
              </button>
            </>
          )}
        </div>
      </div>

      {/* RIGHT -- Live browser panel */}
      <div className="flex-1 relative">

        {showBrowser ? (
          <>
            {/* noVNC iframe -- live Playwright browser */}
            <iframe
              src={NOVNC_URL}
              className="w-full h-full border-0"
              title="Live Government Portal"
              allow="clipboard-read; clipboard-write"
            />

            {/* Status chip */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="bg-black/70 backdrop-blur text-cyan-400 text-xs px-4 py-1.5 rounded-full border border-cyan-500/40 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                {statusLabel}
                {formInfo?.page_name && <span className="text-gray-400">— {formInfo.page_name}</span>}
              </div>
            </div>

            {/* OTP modal */}
            {waitingForOtp && (
              <div className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-gray-900 border border-cyan-500/50 rounded-2xl p-6 w-80 shadow-2xl">
                  <div className="text-center mb-4">
                    <span className="text-3xl">📱</span>
                    <h3 className="font-semibold mt-2">Enter OTP</h3>
                    <p className="text-sm text-gray-400 mt-1">Enter the OTP sent to your registered mobile</p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpValue}
                    onChange={e => setOtpValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleOtpSubmit()}
                    placeholder="123456"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                  <button
                    onClick={handleOtpSubmit}
                    disabled={!otpValue.trim()}
                    className="w-full mt-3 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all"
                  >
                    Submit OTP
                  </button>
                </div>
              </div>
            )}

            {/* CAPTCHA modal */}
            {waitingForCaptcha && (
              <div className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-gray-900 border border-yellow-500/50 rounded-2xl p-6 w-80 shadow-2xl">
                  <div className="text-center mb-4">
                    <span className="text-3xl">🔐</span>
                    <h3 className="font-semibold mt-2">Solve CAPTCHA</h3>
                    <p className="text-sm text-gray-400 mt-1">Look at the live browser above and type what you see</p>
                  </div>
                  <input
                    type="text"
                    value={captchaValue}
                    onChange={e => setCaptchaValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCaptchaSubmit()}
                    placeholder="Type CAPTCHA text"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center text-lg focus:outline-none focus:border-yellow-500"
                    autoFocus
                  />
                  <button
                    onClick={handleCaptchaSubmit}
                    disabled={!captchaValue.trim()}
                    className="w-full mt-3 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all"
                  >
                    Submit CAPTCHA
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (

          /* Idle state */
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
            <div className="text-6xl">🏛️</div>
            <p className="text-lg font-medium text-gray-400">Live Form View</p>
            <p className="text-sm text-center max-w-xs leading-relaxed">
              When the AI opens a government portal, you will watch it fill
              the form here in real time — like screen sharing.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-gray-600">
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">🎙️</div>Speak in any language</div>
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">👁️</div>Watch live</div>
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">✅</div>Confirm done</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

  const [showBrowser, setShowBrowser]               = useState(false);
  const [formInfo, setFormInfo]                     = useState(null);
  const [waitingForOtp, setWaitingForOtp]           = useState(false);
  const [waitingForCaptcha, setWaitingForCaptcha]   = useState(false);
  const [otpValue, setOtpValue]                     = useState("");
  const [captchaValue, setCaptchaValue]             = useState("");
  const [messages, setMessages]                     = useState([]);
  const transcriptRef                               = useRef(null);

  const {
    inCall, status, startCall, endCall, submitOtp, submitCaptcha,
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
      setTimeout(() => transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight, behavior: "smooth"
      }), 100);
    },
  });

  const handleOtpSubmit = useCallback(async () => {
    if (!otpValue.trim()) return;
    await submitOtp(otpValue.trim());
    setOtpValue("");
    setWaitingForOtp(false);
  }, [otpValue, submitOtp]);

  const handleCaptchaSubmit = useCallback(async () => {
    if (!captchaValue.trim()) return;
    await submitCaptcha(captchaValue.trim());
    setCaptchaValue("");
    setWaitingForCaptcha(false);
  }, [captchaValue, submitCaptcha]);

  const statusLabel = {
    idle: "Ready", connecting: "Connecting...", listening: "Listening...",
    processing: "Processing...", speaking: "Speaking...",
    filling: "Filling form...", waiting_otp: "Waiting for OTP",
    waiting_captcha: "Waiting for CAPTCHA", done: "Done!",
  }[status] || status;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* LEFT -- Voice chat panel */}
      <div className="w-1/3 min-w-[300px] flex flex-col border-r border-gray-800">

        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${inCall ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
          <span className="font-semibold text-lg">CivicBridge</span>
          <span className="ml-auto text-xs text-gray-400">{statusLabel}</span>
        </div>

        {/* Transcript */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-5xl mb-3">🎙️</p>
              <p className="text-sm">Start a call and ask about government schemes</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === "user" ? "bg-cyan-700 text-white" : "bg-gray-800 text-gray-100"
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Form progress bar */}
        {formInfo && formInfo.total_fields > 0 && (
          <div className="px-4 py-2 bg-gray-900 border-t border-gray-800">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Form progress</span>
              <span>{formInfo.fields_filled || 0} / {formInfo.total_fields} fields</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${((formInfo.fields_filled||0)/formInfo.total_fields)*100}%` }}
              />
            </div>
          </div>
        )}

        {/* Call button */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={inCall ? endCall : startCall}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              inCall ? "bg-red-600 hover:bg-red-700" : "bg-cyan-600 hover:bg-cyan-700"
            }`}
          >
            {inCall ? "⏹ End Call" : "📞 Start Call"}
          </button>
        </div>
      </div>

      {/* RIGHT -- Live browser panel */}
      <div className="flex-1 relative">

        {showBrowser ? (
          <>
            {/* noVNC iframe -- this IS the live browser, no screenshots */}
            <iframe
              src={NOVNC_URL}
              className="w-full h-full border-0"
              title="Live Government Portal"
              allow="clipboard-read; clipboard-write"
            />

            {/* Status chip over the browser */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <div className="bg-black/70 backdrop-blur text-cyan-400 text-xs px-4 py-1.5 rounded-full border border-cyan-500/40 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                {statusLabel}
                {formInfo?.page_name && <span className="text-gray-400">— {formInfo.page_name}</span>}
              </div>
            </div>

            {/* OTP modal -- overlays live browser */}
            {waitingForOtp && (
              <div className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-gray-900 border border-cyan-500/50 rounded-2xl p-6 w-80 shadow-2xl">
                  <div className="text-center mb-4">
                    <span className="text-3xl">📱</span>
                    <h3 className="font-semibold mt-2">Enter OTP</h3>
                    <p className="text-sm text-gray-400 mt-1">Enter the OTP sent to your registered mobile</p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpValue}
                    onChange={e => setOtpValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleOtpSubmit()}
                    placeholder="123456"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                  <button
                    onClick={handleOtpSubmit}
                    disabled={!otpValue.trim()}
                    className="w-full mt-3 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all"
                  >
                    Submit OTP
                  </button>
                </div>
              </div>
            )}

            {/* CAPTCHA modal -- overlays live browser */}
            {waitingForCaptcha && (
              <div className="absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-gray-900 border border-yellow-500/50 rounded-2xl p-6 w-80 shadow-2xl">
                  <div className="text-center mb-4">
                    <span className="text-3xl">🔐</span>
                    <h3 className="font-semibold mt-2">Solve CAPTCHA</h3>
                    <p className="text-sm text-gray-400 mt-1">Look at the live browser above and type what you see</p>
                  </div>
                  <input
                    type="text"
                    value={captchaValue}
                    onChange={e => setCaptchaValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCaptchaSubmit()}
                    placeholder="Type CAPTCHA text"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center text-lg focus:outline-none focus:border-yellow-500"
                    autoFocus
                  />
                  <button
                    onClick={handleCaptchaSubmit}
                    disabled={!captchaValue.trim()}
                    className="w-full mt-3 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all"
                  >
                    Submit CAPTCHA
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (

          /* Idle state -- shown before any form starts */
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
            <div className="text-6xl">🏛️</div>
            <p className="text-lg font-medium text-gray-400">Live Form View</p>
            <p className="text-sm text-center max-w-xs leading-relaxed">
              When the AI opens a government portal, you will watch it fill
              the form here in real time — like screen sharing.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-gray-600">
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">🎙️</div>Speak to AI</div>
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">👁️</div>Watch live</div>
              <div className="bg-gray-900 rounded-xl p-3"><div className="text-2xl mb-1">✅</div>Confirm done</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
