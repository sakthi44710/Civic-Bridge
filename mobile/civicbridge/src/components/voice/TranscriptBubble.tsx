import { motion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import type { TranscriptEntry } from '@/types';
import { timeAgo } from '@/lib/utils';

interface TranscriptBubbleProps {
  entry: TranscriptEntry;
  onPlayAudio?: (url: string) => void;
}

export function TranscriptBubble({ entry, onPlayAudio }: TranscriptBubbleProps) {
  const isUser = entry.type === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}
    >
      {!isUser && (
        <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-saffron-400 to-india-green-500 flex items-center justify-center mt-1 shadow-sm">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}

      <div className={`max-w-[78%] space-y-1`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gradient-to-br from-saffron-400 to-saffron-500 text-white rounded-tr-md'
              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-md shadow-sm'
          }`}
        >
          <p className="text-sm leading-relaxed">{entry.text}</p>
        </div>

        <div className={`flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-slate-400">{timeAgo(entry.timestamp)}</span>
          {entry.audioUrl && (
            <button
              onClick={() => onPlayAudio?.(entry.audioUrl!)}
              className="text-xs text-slate-400 hover:text-saffron-500 flex items-center gap-0.5"
              aria-label="Play audio"
            >
              <Volume2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-saffron-100 flex items-center justify-center mt-1">
          <span className="text-saffron-600 text-xs font-bold">You</span>
        </div>
      )}
    </motion.div>
  );
}
