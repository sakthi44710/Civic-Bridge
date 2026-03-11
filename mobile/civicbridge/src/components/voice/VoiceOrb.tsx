import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Loader2, AlertCircle } from 'lucide-react';
import type { VoiceState } from '@/types';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

interface VoiceOrbProps {
  state: VoiceState;
  onTap: () => void;
  transcript?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const ORB_STATE_CONFIG = {
  idle:       { bg: 'from-saffron-400 to-saffron-500', shadow: 'shadow-orb',           icon: Mic,         labelKey: 'voice.tap_to_speak' },
  listening:  { bg: 'from-india-green-400 to-india-green-600', shadow: 'shadow-orb-listening', icon: Mic, labelKey: 'voice.listening'    },
  processing: { bg: 'from-navy-700 to-navy-900',       shadow: 'shadow-orb',           icon: Loader2,     labelKey: 'voice.processing'   },
  speaking:   { bg: 'from-blue-400 to-blue-600',       shadow: 'shadow-orb',           icon: Volume2,     labelKey: 'voice.speaking'     },
  error:      { bg: 'from-red-400 to-red-600',         shadow: 'shadow-none',          icon: AlertCircle, labelKey: 'voice.error'        },
};

const SIZES = {
  sm:  { orb: 'h-12 w-12', icon: 'h-5 w-5',  ring: 'h-16 w-16', label: 'text-xs' },
  md:  { orb: 'h-20 w-20', icon: 'h-8 w-8',  ring: 'h-24 w-24', label: 'text-sm' },
  lg:  { orb: 'h-28 w-28', icon: 'h-10 w-10', ring: 'h-32 w-32', label: 'text-base' },
  xl:  { orb: 'h-36 w-36', icon: 'h-12 w-12', ring: 'h-40 w-40', label: 'text-lg' },
};

export function VoiceOrb({ state, onTap, transcript, size = 'xl', className }: VoiceOrbProps) {
  const { t } = useLocalization();
  const cfg = ORB_STATE_CONFIG[state];
  const s = SIZES[size];
  const Icon = cfg.icon;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Outer ring pulse */}
      <div className="relative flex items-center justify-center">
        {state === 'listening' && (
          <>
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2 border-india-green-400 opacity-40"
                style={{ width: `${(size === 'xl' ? 144 : 112) + i * 28}px`, height: `${(size === 'xl' ? 144 : 112) + i * 28}px` }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.25 }}
              />
            ))}
          </>
        )}

        {state === 'idle' && (
          <motion.div
            className="absolute rounded-full bg-saffron-200 opacity-30"
            style={{ width: `${(size === 'xl' ? 144 : 112) + 20}px`, height: `${(size === 'xl' ? 144 : 112) + 20}px` }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Main Orb */}
        <motion.button
          className={cn(
            'relative flex items-center justify-center rounded-full bg-gradient-to-br text-white select-none',
            cfg.bg, cfg.shadow, s.orb
          )}
          style={{ touchAction: 'manipulation' }}
          onClick={onTap}
          whileTap={{ scale: 0.92 }}
          animate={
            state === 'idle'       ? { scale: [1, 1.04, 1], transition: { duration: 2.5, repeat: Infinity } } :
            state === 'listening'  ? { scale: [1, 1.08, 1], transition: { duration: 0.6, repeat: Infinity } } :
            state === 'processing' ? { rotate: 360,          transition: { duration: 3, repeat: Infinity, ease: 'linear' } } :
            state === 'speaking'   ? { scale: [1, 1.05, 1], transition: { duration: 0.8, repeat: Infinity } } :
            {}
          }
          aria-label={t(cfg.labelKey)}
          aria-pressed={state === 'listening'}
        >
          <Icon className={cn(s.icon, state === 'processing' && 'animate-spin')} strokeWidth={2} />

          {/* Ripple on listening */}
          {state === 'listening' && (
            <motion.span
              className="absolute inset-0 rounded-full bg-white"
              animate={{ scale: [1, 2], opacity: [0.3, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}

          {/* Speaking wave bars */}
          {state === 'speaking' && (
            <div className="absolute inset-0 flex items-center justify-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-white rounded-full"
                  animate={{ scaleY: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                  style={{ height: 20 }}
                />
              ))}
            </div>
          )}
        </motion.button>
      </div>

      {/* State label */}
      <motion.p
        key={state}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('font-semibold text-slate-600 text-center', s.label)}
      >
        {t(cfg.labelKey)}
      </motion.p>

      {/* Transcript */}
      <AnimatePresence>
        {transcript && state === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-[280px] rounded-xl bg-india-green-50 border border-india-green-200 px-4 py-2 text-sm text-india-green-800 text-center"
          >
            "{transcript}"
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
