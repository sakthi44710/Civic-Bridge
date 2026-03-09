import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CONFETTI_COLORS = ['#FF9933', '#138808', '#000080', '#22C55E', '#F59E0B', '#3B82F6'];

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  size: number;
}

interface ConfettiProps {
  trigger: boolean;
  duration?: number;
}

export const Confetti: React.FC<ConfettiProps> = ({ trigger, duration = 3000 }) => {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (trigger) {
      const newPieces = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.5,
        rotation: Math.random() * 360,
        size: 6 + Math.random() * 8,
      }));
      setPieces(newPieces);
      const timer = setTimeout(() => setPieces([]), duration);
      return () => clearTimeout(timer);
    }
  }, [trigger, duration]);

  return (
    <AnimatePresence>
      {pieces.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {pieces.map((piece) => (
            <motion.div
              key={piece.id}
              initial={{ y: -20, x: `${piece.x}vw`, rotate: 0, opacity: 1 }}
              animate={{ y: '100vh', rotate: piece.rotation + 720, opacity: 0 }}
              transition={{ duration: 2 + Math.random(), delay: piece.delay, ease: 'easeIn' }}
              style={{
                position: 'absolute',
                width: piece.size,
                height: piece.size,
                backgroundColor: piece.color,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
};
