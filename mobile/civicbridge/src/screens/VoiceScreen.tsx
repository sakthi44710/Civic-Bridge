import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Trash2, Languages, Send } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { TranscriptBubble } from '@/components/voice/TranscriptBubble';
import { useVoice } from '@/hooks/useVoice';
import { useVoiceStore } from '@/stores/voiceStore';
import { useUserStore } from '@/stores/userStore';
import { useLocalization } from '@/hooks/useLocalization';
import { LANGUAGES } from '@/lib/constants';
import type { Language } from '@/types';

const SUGGESTED_CHIPS: { en: string; hi: string; emoji: string }[] = [
  { en: 'Free education scholarship',  hi: 'मुफ़्त शिक्षा छात्रवृत्ति', emoji: '🎓' },
  { en: 'Farmer income support',       hi: 'किसान आय सहायता',           emoji: '🌾' },
  { en: 'Health insurance scheme',     hi: 'स्वास्थ्य बीमा योजना',      emoji: '🏥' },
  { en: 'Housing assistance',          hi: 'आवास सहायता',               emoji: '🏠' },
  { en: 'Women empowerment',           hi: 'महिला सशक्तिकरण',           emoji: '👩' },
];

export function VoiceScreen() {
  const { voiceState, handleOrbTap, transcript, isSupported, sendText } = useVoice();
  const { conversation, clearConversation } = useVoiceStore();
  const { language, setLanguage } = useUserStore();
  const { t } = useLocalization();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const handleChipTap = (text: string) => sendText(text);

  const handleTextSend = () => {
    if (!textInput.trim()) return;
    sendText(textInput.trim());
    setTextInput('');
  };

  return (
    <AppShell
      title="Voice Assistant"
      titleHi="आवाज़ सहायक"
      rightAction={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowLangPicker(true)}
            className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm"
            aria-label="Change language"
          >
            <Globe className="h-4.5 w-4.5 text-slate-500" />
          </button>
          {conversation.length > 0 && (
            <button
              onClick={clearConversation}
              className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm"
              aria-label="Clear conversation"
            >
              <Trash2 className="h-4.5 w-4.5 text-slate-400" />
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-48">
          {conversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-8">
              {/* Orb hero */}
              <div className="relative">
                <div className="absolute inset-0 -m-6 rounded-full bg-saffron-50 opacity-50 blur-2xl" />
                <VoiceOrb state={voiceState} onTap={handleOrbTap} transcript={transcript} size="xl" />
              </div>

              <div className="text-center space-y-1.5">
                <p className="text-lg font-bold text-slate-800">
                  {language === 'hi' ? 'मैं आपकी कैसे सहायता कर सकता हूँ?' : 'How can I help you?'}
                </p>
                <p className="text-sm text-slate-400">
                  {language === 'hi' ? 'बोलें या नीचे से चुनें' : 'Speak or choose from below'}
                </p>
              </div>

              {!isSupported && (
                <div className="rounded-2xl p-4 text-center bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-700 font-medium">Voice not supported. Please use Chrome.</p>
                </div>
              )}

              {/* Suggested chips */}
              <div className="w-full space-y-3">
                <p className="text-xs text-center text-slate-400 font-semibold uppercase tracking-wider">Try asking</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_CHIPS.map((chip, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleChipTap(language === 'hi' ? chip.hi : chip.en)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-50"
                    >
                      <span>{chip.emoji}</span>
                      {language === 'hi' ? chip.hi : chip.en}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {conversation.map((entry) => (
                <TranscriptBubble key={entry.id} entry={entry} />
              ))}

              {voiceState !== 'idle' && (
                <div className="flex justify-center py-3">
                  <VoiceOrb state={voiceState} onTap={handleOrbTap} transcript={transcript} size="md" />
                </div>
              )}

              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Bottom input bar */}
        <div className="fixed bottom-20 left-0 right-0 flex justify-center px-4 pb-2 pointer-events-none">
          <div className="pointer-events-auto bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 p-1.5 flex items-center gap-1.5 max-w-content w-full shadow-lg">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTextSend(); }}
              placeholder={language === 'hi' ? 'यहाँ टाइप करें...' : 'Type a message...'}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none min-w-0"
            />
            {textInput.trim() ? (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleTextSend}
                className="flex-shrink-0 h-11 w-11 rounded-xl bg-saffron-500 flex items-center justify-center text-white shadow-sm"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleOrbTap}
                className={`flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-sm transition-colors ${
                  voiceState === 'listening'  ? 'bg-india-green-500' :
                  voiceState === 'speaking'   ? 'bg-blue-500' :
                  voiceState === 'processing' ? 'bg-navy-800' :
                  'bg-gradient-to-br from-saffron-400 to-saffron-600'
                }`}
                aria-label={t('voice.tap_to_speak')}
              >
                <VoiceOrb state={voiceState} onTap={() => {}} size="sm" className="pointer-events-none" />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Language Picker Modal */}
      <AnimatePresence>
        {showLangPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowLangPicker(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="bg-white w-full rounded-t-3xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-bold text-slate-900 mb-4">Select Language / भाषा चुनें</h3>
              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto mb-4">
                {LANGUAGES.map(({ code, nativeLabel, label }) => (
                  <button
                    key={code}
                    onClick={() => { setLanguage(code as Language); setShowLangPicker(false); }}
                    className={`rounded-2xl border-2 px-4 py-3 text-left flex items-center gap-2.5 transition-all ${
                      language === code ? 'border-saffron-400 bg-saffron-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Languages className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{nativeLabel}</p>
                      <p className="text-xs text-slate-400">{label}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowLangPicker(false)}
                className="w-full h-12 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
