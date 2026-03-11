import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import type { TimelineStage } from '@/types';
import { formatDate } from '@/lib/utils';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

interface ApplicationTimelineProps {
  stages: TimelineStage[];
  estimatedCompletion?: Date;
}

export function ApplicationTimeline({ stages, estimatedCompletion }: ApplicationTimelineProps) {
  const { language } = useLocalization();

  return (
    <div className="relative space-y-0">
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;

        return (
          <div key={i} className="flex gap-4 pb-6 last:pb-0">
            {/* Line + dot */}
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 z-10',
                  stage.status === 'completed' ? 'bg-india-green-500'   :
                  stage.status === 'current'   ? 'bg-saffron-400'       :
                  'bg-slate-200'
                )}
              >
                {stage.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-white" />}
                {stage.status === 'current'   && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="h-3 w-3 rounded-full bg-white"
                  />
                )}
                {stage.status === 'pending'   && <Circle className="h-5 w-5 text-slate-400" />}
              </motion.div>

              {!isLast && (
                <div className={cn(
                  'w-0.5 flex-1 mt-1 min-h-[24px]',
                  stage.status === 'completed' ? 'bg-india-green-300' : 'bg-slate-200'
                )} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-start justify-between gap-2">
                <p className={cn(
                  'font-semibold text-sm',
                  stage.status === 'current' ? 'text-saffron-600' : stage.status === 'completed' ? 'text-slate-700' : 'text-slate-400'
                )}>
                  {language === 'hi' ? stage.nameHi : stage.name}
                </p>
                {stage.date && (
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(stage.date)}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'hi' ? stage.descriptionHi : stage.description}
              </p>
            </div>
          </div>
        );
      })}

      {estimatedCompletion && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="text-xs text-blue-700">
            Estimated completion: <strong>{formatDate(estimatedCompletion)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
