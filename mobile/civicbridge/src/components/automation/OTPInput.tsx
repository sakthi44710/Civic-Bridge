import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { useLocalization } from '@/hooks/useLocalization';

interface OTPInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  onResend?: () => void;
  phone?: string;
  loading?: boolean;
}

export function OTPInput({ length = 6, onComplete, onResend, phone, loading }: OTPInputProps) {
  const { t } = useLocalization();
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const [timer, setTimer] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const handleChange = (i: number, val: string) => {
    const v = val.replace(/\D/, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < length - 1) refs.current[i + 1]?.focus();
    if (next.every((d) => d)) onComplete(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted.length === length) {
      const padded = pasted.split('');
      setDigits(padded);
      refs.current[length - 1]?.focus();
      onComplete(pasted);
    }
  };

  const handleResend = () => {
    setTimer(30);
    setDigits(Array(length).fill(''));
    refs.current[0]?.focus();
    onResend?.();
  };

  return (
    <div className="space-y-6 text-center">
      {phone && (
        <p className="text-sm text-slate-600">
          {t('auto.otp_sent')} <span className="font-bold text-slate-900">{phone}</span>
        </p>
      )}

      {/* OTP boxes */}
      <div className="flex justify-center gap-3" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <motion.input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`h-14 w-12 rounded-xl border-2 text-center text-xl font-bold transition-colors outline-none
              ${d ? 'border-saffron-400 bg-saffron-50 text-saffron-700' : 'border-slate-200 bg-white text-slate-900'}
              focus:border-saffron-400`}
            aria-label={`Digit ${i + 1}`}
            whileFocus={{ scale: 1.05 }}
          />
        ))}
      </div>

      {/* Resend */}
      <div className="text-sm text-slate-500">
        {timer > 0 ? (
          <span>Resend in <span className="font-semibold text-saffron-500">{timer}s</span></span>
        ) : (
          <button onClick={handleResend} className="text-saffron-500 font-semibold hover:underline focus:outline-none">
            {t('auto.resend')}
          </button>
        )}
      </div>

      <Button variant="primary" size="lg" className="w-full" loading={loading} disabled={digits.some(d => !d)}>
        Verify OTP
      </Button>

      <p className="text-xs text-slate-400">Didn't receive? Check spam or <button className="text-saffron-500 underline" onClick={handleResend}>resend</button></p>
    </div>
  );
}
