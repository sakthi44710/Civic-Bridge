import React, { useState } from 'react';
import { RefreshCw, Volume2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useLocalization } from '@/hooks/useLocalization';

interface CaptchaSolverProps {
  imageUrl?: string;
  onSubmit: (value: string) => void;
  onRefresh: () => void;
}

export const CaptchaSolver: React.FC<CaptchaSolverProps> = ({ imageUrl, onSubmit, onRefresh }) => {
  const [value, setValue] = useState('');
  const { t } = useLocalization();

  // Demo captcha image (fallback)
  const captchaSrc = imageUrl || 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect fill="%23f0f0f0" width="200" height="60"/><text x="50%" y="55%" font-family="monospace" font-size="28" font-weight="bold" text-anchor="middle" fill="%23333" transform="rotate(-5 100 30)">A7K9M2</text><line x1="10" y1="20" x2="190" y2="40" stroke="%23ccc" stroke-width="1"/><line x1="20" y1="45" x2="180" y2="15" stroke="%23ddd" stroke-width="1"/></svg>'
  );

  return (
    <Card variant="elevated" padding="lg" className="space-y-4">
      <h3 className="font-bold text-lg text-text-primary">Enter CAPTCHA</h3>
      <p className="text-sm text-text-muted">Type the characters shown in the image below</p>

      {/* CAPTCHA Image */}
      <div className="bg-gray-100 rounded-md p-4 flex items-center justify-center">
        <img src={captchaSrc} alt="CAPTCHA" className="max-w-full h-16 object-contain" />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button onClick={onRefresh} className="touch-target p-2 rounded-md hover:bg-gray-100" aria-label="Refresh CAPTCHA">
          <RefreshCw size={20} className="text-text-secondary" />
        </button>
        <button className="touch-target p-2 rounded-md hover:bg-gray-100" aria-label="Audio CAPTCHA">
          <Volume2 size={20} className="text-text-secondary" />
        </button>
        <button className="touch-target p-2 rounded-md hover:bg-gray-100" aria-label="Help">
          <HelpCircle size={20} className="text-text-secondary" />
        </button>
      </div>

      {/* Input */}
      <Input
        placeholder="Enter CAPTCHA text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        className="text-center text-xl tracking-widest"
      />

      <Button
        fullWidth
        size="lg"
        disabled={!value}
        onClick={() => onSubmit(value)}
      >
        {t('common.continue')}
      </Button>
    </Card>
  );
};
