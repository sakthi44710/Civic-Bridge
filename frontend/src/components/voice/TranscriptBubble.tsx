import React from 'react';
import { motion } from 'framer-motion';
import { Play, User, Bot } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { VoiceMessage } from '@/types';

interface TranscriptBubbleProps {
  message: VoiceMessage;
  onPlayAudio?: () => void;
}

export const TranscriptBubble: React.FC<TranscriptBubbleProps> = ({ message, onPlayAudio }) => {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-2 max-w-[85%]', isUser ? 'ml-auto flex-row-reverse' : 'mr-auto')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-saffron-light' : 'bg-green-light'
        )}
      >
        {isUser ? (
          <User size={16} className="text-saffron-dark" />
        ) : (
          <Bot size={16} className="text-green-dark" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'rounded-lg px-4 py-3 space-y-1',
          isUser
            ? 'bg-saffron-light border border-saffron/20 rounded-tr-none'
            : 'bg-green-light border border-green/20 rounded-tl-none'
        )}
      >
        <p className="text-base text-text-primary leading-relaxed">{message.text}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{formatRelativeTime(message.timestamp)}</span>
          {message.audioUrl && (
            <button
              onClick={onPlayAudio}
              className="touch-target p-1 rounded-full hover:bg-black/5"
              aria-label="Play audio"
            >
              <Play size={14} className="text-text-muted" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
