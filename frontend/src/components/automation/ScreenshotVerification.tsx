import React from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, Check, X, Edit3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLocalization } from '@/hooks/useLocalization';

interface ScreenshotVerificationProps {
  screenshotUrl: string;
  extractedData: Record<string, string>;
  onApprove: () => void;
  onReject: () => void;
  onEdit?: (field: string) => void;
}

export const ScreenshotVerification: React.FC<ScreenshotVerificationProps> = ({
  screenshotUrl,
  extractedData,
  onApprove,
  onReject,
  onEdit,
}) => {
  const { bilingual } = useLocalization();

  return (
    <Card variant="elevated" padding="lg" className="space-y-4">
      <h3 className="font-bold text-lg text-text-primary">
        {bilingual('Is this correct?', 'क्या यह सही है?')}
      </h3>

      {/* Screenshot */}
      <div className="relative rounded-md overflow-hidden border border-border group">
        <img
          src={screenshotUrl}
          alt="Form screenshot"
          className="w-full h-auto"
        />
        <button className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn size={16} />
        </button>
      </div>

      {/* Extracted Data Comparison */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm text-text-secondary">Filled Information:</h4>
        {Object.entries(extractedData).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
            <div>
              <span className="text-xs text-text-muted capitalize">{key.replace(/_/g, ' ')}</span>
              <p className="text-sm font-medium text-text-primary">{value}</p>
            </div>
            {onEdit && (
              <button
                onClick={() => onEdit(key)}
                className="p-1.5 hover:bg-gray-200 rounded"
                aria-label={`Edit ${key}`}
              >
                <Edit3 size={14} className="text-text-muted" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="danger"
          size="lg"
          fullWidth
          icon={<X size={20} />}
          onClick={onReject}
        >
          {bilingual('Incorrect', 'गलत है')}
        </Button>
        <Button
          variant="success"
          size="lg"
          fullWidth
          icon={<Check size={20} />}
          onClick={onApprove}
        >
          {bilingual('Correct', 'सही है')}
        </Button>
      </div>
    </Card>
  );
};
