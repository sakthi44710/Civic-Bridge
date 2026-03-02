import { useState, useEffect, useRef } from 'react';
import MarkdownMessage from './MarkdownMessage';

/**
 * ChatGPT-style streaming text component.
 * Reveals the AI message character-by-character with a blinking cursor.
 */
export default function StreamingMessage({ content, role, isNew = false, onComplete }) {
  const [displayed, setDisplayed] = useState(isNew ? '' : content);
  const [isStreaming, setIsStreaming] = useState(isNew);
  const idxRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isNew) {
      setDisplayed(content);
      setIsStreaming(false);
      return;
    }

    idxRef.current = 0;
    setDisplayed('');
    setIsStreaming(true);

    const stream = () => {
      timerRef.current = setInterval(() => {
        idxRef.current += getChunkSize(content, idxRef.current);
        if (idxRef.current >= content.length) {
          idxRef.current = content.length;
          setDisplayed(content);
          setIsStreaming(false);
          clearInterval(timerRef.current);
          onComplete?.();
        } else {
          setDisplayed(content.slice(0, idxRef.current));
        }
      }, 12);
    };

    stream();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [content, isNew]);

  return (
    <div className="relative">
      <MarkdownMessage content={displayed} role={role} />
      {isStreaming && (
        <span className="inline-block w-[2px] h-[14px] bg-[#00d4ff]/70 ml-0.5 animate-pulse align-text-bottom" />
      )}
    </div>
  );
}

/**
 * Adaptive chunk size — skip faster through whitespace and
 * markdown formatting, slower on actual content words.
 */
function getChunkSize(text, idx) {
  const remaining = text.length - idx;
  if (remaining <= 0) return 1;

  const char = text[idx];
  // Fast-forward through whitespace, newlines, markdown symbols
  if (char === '\n' || char === '\r') return 1;
  if (char === ' ' && text[idx + 1] === ' ') return 2;
  if ('*#|-_>[]()'.includes(char)) return 1;

  // For long content, increase speed proportionally
  if (remaining > 2000) return 4;
  if (remaining > 1000) return 3;
  if (remaining > 500) return 2;
  return 1;
}
