import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Check, AlertTriangle, Clock, XCircle, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useLocalization } from '@/hooks/useLocalization';
import { DOCUMENT_TYPES } from '@/lib/constants';
import { cn, formatDate, getConfidenceColor } from '@/lib/utils';
import type { Document } from '@/types';

interface DocumentCardProps {
  document: Document;
  onDelete?: () => void;
  onClick?: () => void;
}

const statusConfig = {
  uploading: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Uploading' },
  processing: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Processing' },
  verified: { icon: Check, color: 'text-green-600', bg: 'bg-green-50', label: 'Verified' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
  expired: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Expired' },
};

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, onDelete, onClick }) => {
  const { isHindi } = useLocalization();
  const docType = DOCUMENT_TYPES[document.type] || DOCUMENT_TYPES.other;
  const status = statusConfig[document.status];
  const StatusIcon = status.icon;

  return (
    <Card
      variant="interactive"
      padding="sm"
      className="overflow-hidden"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Document Icon */}
        <div className={cn('w-12 h-12 rounded-md flex items-center justify-center shrink-0', status.bg)}>
          <FileText size={24} className={status.color} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-text-primary truncate">
            {isHindi ? docType.labelHi : docType.label}
          </h4>
          <p className="text-xs text-text-muted truncate">{document.originalName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('flex items-center gap-0.5 text-xs', status.color)}>
              <StatusIcon size={12} />
              {status.label}
            </span>
            {document.status === 'verified' && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', getConfidenceColor(document.confidence))}>
                {document.confidence}%
              </span>
            )}
            {document.expiresAt && new Date(document.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
              <Badge variant="warning" size="sm">
                Expiring soon
              </Badge>
            )}
          </div>
        </div>

        {/* Delete */}
        {onDelete && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-text-muted hover:text-error transition-colors"
            aria-label="Delete document"
          >
            <Trash2 size={18} />
          </motion.button>
        )}
      </div>
    </Card>
  );
};
