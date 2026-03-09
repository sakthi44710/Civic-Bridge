import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Loader2, Volume2, AlertCircle } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { useLocalization } from '@/hooks/useLocalization';
import { cn, vibrate } from '@/lib/utils';
import type { VoiceState } from '@/types';

interface VoiceOrbProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const stateLabels: Record<VoiceState, string> = {
  idle: 'voice.tap_to_speak',
  listening: 'voice.listening',
  processing: 'voice.processing',
  speaking: 'voice.speaking',
  error: 'common.retry',
};

const orbSizes = { sm: 'w-16 h-16', md: 'w-20 h-20', lg: 'w-24 h-24' };
const iconSizes = { sm: 24, md: 28, lg: 32 };

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ size = 'lg', className }) => {
  const { state, startListening, stopListening, cancelSpeech } = useVoice();
  const { t } = useLocalization();

  const handlePress = () => {
    vibrate([50, 30, 50]);
    switch (state) {
      case 'idle':
      case 'error':
        startListening();
        break;
      case 'listening':
        stopListening();
        break;
      case 'speaking':
        cancelSpeech();
        break;
      default:
        break;
    }
  };

  const renderIcon = () => {
    switch (state) {
      case 'listening':
        return <WaveformBars />;
      case 'processing':
        return <Loader2 size={iconSizes[size]} className="animate-spin text-white" />;
      case 'speaking':
        return <Volume2 size={iconSizes[size]} className="text-white" />;
      case 'error':
        return <AlertCircle size={iconSizes[size]} className="text-white" />;
      default:
        return <Mic size={iconSizes[size]} className="text-white" />;
    }
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Outer glow rings */}
      <div className="relative">
        {state === 'listening' && (
          <>
            <motion.div
              animate={{ scale: [1, 1.6], opacity: [0.3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-saffron/20"
            />
            <motion.div
              animate={{ scale: [1, 1.4], opacity: [0.2, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
              className="absolute inset-0 rounded-full bg-green/20"
            />
          </>
        )}

        {state === 'speaking' && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.3 + i * 0.15], opacity: [0.4, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                className="absolute inset-0 rounded-full bg-green/15"
              />
            ))}
          </>
        )}

        {/* Main Orb */}
        <motion.button
          onClick={handlePress}
          whileTap={{ scale: 0.9 }}
          animate={
            state === 'idle'
              ? { scale: [1, 1.05, 1] }
              : state === 'listening'
                ? { scale: [1, 1.1, 1] }
                : state === 'processing'
                  ? { rotate: 360 }
                  : {}
          }
          transition={
            state === 'idle'
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
              : state === 'listening'
                ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
                : state === 'processing'
                  ? { duration: 2, repeat: Infinity, ease: 'linear' }
                  : {}
          }
          className={cn(
            orbSizes[size],
            'rounded-full flex items-center justify-center relative',
            'focus:outline-none focus:ring-4 focus:ring-saffron/30',
            state === 'error'
              ? 'bg-gradient-to-r from-error to-red-600 voice-orb-glow'
              : 'bg-gradient-to-r from-saffron to-green',
            state === 'listening' ? 'voice-orb-active' : 'voice-orb-glow'
          )}
          aria-label={t(stateLabels[state])}
        >
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-full animate-gradient-border p-[3px]">
            <div className={cn(
              'w-full h-full rounded-full flex items-center justify-center',
              state === 'error' ? 'bg-error' : 'bg-gradient-to-br from-saffron via-orange-500 to-green'
            )}>
              {renderIcon()}
            </div>
          </div>
        </motion.button>
      </div>

      {/* State Label */}
      <motion.p
        key={state}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'text-base font-medium',
          state === 'error' ? 'text-error' : 'text-text-secondary'
        )}
      >
        {t(stateLabels[state])}
      </motion.p>
    </div>
  );
};

const WaveformBars: React.FC = () => (
  <div className="flex items-center gap-0.5 h-6">
    {Array.from({ length: 7 }).map((_, i) => (
      <div
        key={i}
        className="voice-wave-bar w-0.5 bg-white rounded-full"
        style={{ height: '100%', animationDelay: `${i * 0.1}s` }}
      />
    ))}
  </div>
);
