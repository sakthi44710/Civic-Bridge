import React from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Clock, Pause, Play } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { AutomationStep } from '@/types';

interface AutomationProgressProps {
  steps: AutomationStep[];
  currentStep: number;
  isPaused: boolean;
  estimatedTime: number;
  onPause: () => void;
  onResume: () => void;
}

export const AutomationProgress: React.FC<AutomationProgressProps> = ({
  steps,
  currentStep,
  isPaused,
  estimatedTime,
  onPause,
  onResume,
}) => {
  const totalProgress = steps.length > 0
    ? (steps.filter((s) => s.status === 'completed').length / steps.length) * 100
    : 0;

  return (
    <Card variant="elevated" padding="lg" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg text-text-primary flex items-center gap-2">
            <motion.div
              animate={{ rotate: isPaused ? 0 : 360 }}
              transition={{ duration: 2, repeat: isPaused ? 0 : Infinity, ease: 'linear' }}
              className="w-6 h-6 rounded-full border-2 border-saffron border-t-transparent"
            />
            Digital Clerk Working
          </h3>
          <p className="text-sm text-text-muted mt-1">
            {isPaused ? 'Paused' : `~${Math.ceil(estimatedTime / 60)} min remaining`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={isPaused ? <Play size={16} /> : <Pause size={16} />}
          onClick={isPaused ? onResume : onPause}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {/* Overall Progress */}
      <ProgressBar value={totalProgress} variant="gradient" size="lg" showLabel />

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const StepIcon = step.status === 'completed'
            ? Check
            : step.status === 'in_progress'
              ? Loader2
              : Clock;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-md transition-colors',
                step.status === 'completed' && 'bg-green-50',
                step.status === 'in_progress' && 'bg-saffron-light border border-saffron/20',
                step.status === 'pending' && 'bg-gray-50'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  step.status === 'completed' && 'bg-green text-white',
                  step.status === 'in_progress' && 'bg-saffron text-white',
                  step.status === 'pending' && 'bg-gray-200 text-gray-400'
                )}
              >
                <StepIcon size={16} className={step.status === 'in_progress' ? 'animate-spin' : ''} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  step.status === 'pending' ? 'text-text-muted' : 'text-text-primary'
                )}>
                  {step.title}
                </p>
                {step.status === 'in_progress' && (
                  <ProgressBar value={step.progress} variant="saffron" size="sm" className="mt-1" />
                )}
              </div>
              <span className="text-xs text-text-muted">
                Step {index + 1}/{steps.length}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Screenshot Preview */}
      {steps[currentStep]?.screenshotUrl && (
        <div className="rounded-md overflow-hidden border border-border">
          <div className="bg-gray-100 px-3 py-1.5 text-xs text-text-muted border-b border-border">
            Live Preview
          </div>
          <img
            src={steps[currentStep].screenshotUrl}
            alt="Form filling preview"
            className="w-full h-48 object-cover"
          />
        </div>
      )}
    </Card>
  );
};
