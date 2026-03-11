import { motion } from 'framer-motion';
import { CheckCircle2, Circle, AlertCircle, Loader2, Pause, Play, Clock } from 'lucide-react';
import type { AutomationSession } from '@/types';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Progress';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

interface AutomationProgressProps {
  session: AutomationSession;
  onPause:  () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function AutomationProgress({ session, onPause, onResume, onCancel }: AutomationProgressProps) {
  const { t } = useLocalization();
  const progress = (session.currentStep / session.totalSteps) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-saffron-50 flex items-center justify-center">
          <Loader2 className={cn('h-6 w-6 text-saffron-500', session.status === 'filling' && 'animate-spin')} />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">{t('auto.digital_clerk')}</h3>
          <p className="text-sm text-slate-500">
            {session.status === 'filling'    ? t('auto.filling') :
             session.status === 'paused'     ? t('auto.paused') :
             session.status === 'completed'  ? t('auto.completed') :
             t('auto.filling')}
          </p>
        </div>
        {session.estimatedTimeRemaining && (
          <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            ~{session.estimatedTimeRemaining}s left
          </div>
        )}
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={progress}
        color="saffron"
        size="md"
        label={`Step ${session.currentStep} of ${session.totalSteps}`}
        showValue
      />

      {/* Steps list */}
      <div className="space-y-2">
        {session.steps.map((step, i) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-2 rounded-lg bg-slate-50"
          >
            {step.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-india-green-500 flex-shrink-0" />}
            {step.status === 'current'   && (
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                <Loader2 className="h-5 w-5 text-saffron-500 animate-spin flex-shrink-0" />
              </motion.div>
            )}
            {step.status === 'pending'   && <Circle className="h-5 w-5 text-slate-300 flex-shrink-0" />}
            {step.status === 'error'     && <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}

            <span className={cn(
              'text-sm',
              step.status === 'completed' ? 'text-slate-600' :
              step.status === 'current'   ? 'text-slate-900 font-semibold' :
              'text-slate-400'
            )}>
              {step.name}
            </span>
            {step.duration && step.status === 'completed' && (
              <span className="ml-auto text-xs text-slate-400">{step.duration}s</span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Screenshot preview */}
      {session.screenshotUrl && (
        <div className="rounded-lg overflow-hidden border border-slate-200">
          <div className="bg-slate-800 px-3 py-1.5 flex items-center gap-2">
            <div className="flex gap-1">
              {[0,1,2].map(i => <div key={i} className="h-2.5 w-2.5 rounded-full bg-slate-600" />)}
            </div>
            <span className="text-xs text-slate-400 mx-auto">Live Preview</span>
          </div>
          <img src={session.screenshotUrl} alt="Form preview" className="w-full" />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {session.status === 'filling' && (
          <Button variant="outline" size="sm" icon={<Pause className="h-4 w-4" />} onClick={onPause} className="flex-1">
            Pause
          </Button>
        )}
        {session.status === 'paused' && (
          <Button variant="success" size="sm" icon={<Play className="h-4 w-4" />} onClick={onResume} className="flex-1">
            Resume
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-red-400">
          Cancel
        </Button>
      </div>
    </div>
  );
}
