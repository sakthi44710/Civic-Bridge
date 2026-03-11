import { motion } from 'framer-motion';
import { CheckCircle2, Clock, AlertTriangle, XCircle, Eye, Trash2, Download } from 'lucide-react';
import type { ProcessedDocument } from '@/types';
import { DOC_TYPE_CONFIG } from '@/lib/constants';
import { formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useLocalization } from '@/hooks/useLocalization';

interface DocumentCardProps {
  doc: ProcessedDocument;
  onView?:   () => void;
  onDelete?: () => void;
  compact?: boolean;
}

const STATUS_ICON = {
  verified:   { Icon: CheckCircle2, cls: 'text-india-green-500' },
  processing: { Icon: Clock,        cls: 'text-amber-500' },
  expired:    { Icon: AlertTriangle,cls: 'text-orange-500' },
  error:      { Icon: XCircle,      cls: 'text-red-500' },
};

export function DocumentCard({ doc, onView, onDelete, compact }: DocumentCardProps) {
  const { t, language } = useLocalization();
  const cfg = DOC_TYPE_CONFIG[doc.type] ?? DOC_TYPE_CONFIG.other;
  const statusCfg = STATUS_ICON[doc.status];
  const { Icon: StatusIcon } = statusCfg;

  const isExpiringSoon = doc.expiryDate && (doc.expiryDate.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
  const fileSizeKB = doc.fileSize ? Math.round(doc.fileSize / 1024) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Doc icon */}
          <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-2xl">
            {cfg.icon}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {language === 'hi' ? cfg.labelHi : cfg.label}
                </p>
                <p className="text-xs text-slate-500 truncate">{doc.filename}</p>
              </div>
              <StatusIcon className={cn('h-5 w-5 flex-shrink-0', statusCfg.cls)} />
            </div>

            {/* Status badge */}
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className={cn(
                'badge text-xs',
                doc.status === 'verified'   && 'bg-india-green-50 text-india-green-700',
                doc.status === 'processing' && 'bg-amber-50 text-amber-700',
                doc.status === 'expired'    && 'bg-orange-50 text-orange-700',
                doc.status === 'error'      && 'bg-red-50 text-red-700',
              )}>
                {t(`doc.${doc.status}`)}
              </span>

              {fileSizeKB && (
                <span className="text-xs text-slate-400">{fileSizeKB} KB</span>
              )}

              {doc.confidence < 0.85 && doc.status === 'verified' && (
                <span className="badge text-xs bg-amber-50 text-amber-700">
                  {Math.round(doc.confidence * 100)}% {t('doc.confidence')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Extracted data preview */}
        {!compact && Object.keys(doc.extractedData).length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 space-y-1">
            {Object.entries(doc.extractedData).slice(0, 3).map(([key, val]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">{key}</span>
                <span className="text-slate-800 font-semibold truncate max-w-[140px]">{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expiry warning */}
        {isExpiringSoon && doc.expiryDate && (
          <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded-md px-2 py-1">
            <AlertTriangle className="h-3 w-3" />
            <span>{t('doc.expiry_warn')}: {formatDate(doc.expiryDate)}</span>
          </div>
        )}

        {/* Actions */}
        {!compact && (
          <div className="mt-3 flex gap-2">
            {onView && (
              <Button variant="outline" size="sm" icon={<Eye className="h-4 w-4" />} onClick={onView} className="flex-1">
                View
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4 text-red-400" />} onClick={onDelete} className="text-red-400">
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
