import React from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, Clock } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useLocalization } from '@/hooks/useLocalization';
import type { TimelineEvent } from '@/types';

interface ApplicationTimelineProps {
  events: TimelineEvent[];
}

export const ApplicationTimeline: React.FC<ApplicationTimelineProps> = ({ events }) => {
  const { isHindi } = useLocalization();

  return (
    <div className="relative space-y-0">
      {events.map((event, index) => {
        const isCompleted = event.status === 'completed';
        const isCurrent = event.status === 'current';
        const isLast = index === events.length - 1;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative flex gap-4 pb-6"
          >
            {/* Connecting Line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-[15px] top-8 w-0.5 h-[calc(100%-16px)]',
                  isCompleted ? 'bg-green' : 'bg-gray-200'
                )}
              />
            )}

            {/* Icon */}
            <div className="relative z-10 shrink-0">
              {isCompleted ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-8 h-8 rounded-full bg-green flex items-center justify-center"
                >
                  <Check size={16} className="text-white" />
                </motion.div>
              ) : isCurrent ? (
                <div className="w-8 h-8 rounded-full bg-info flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-3 h-3 rounded-full bg-white"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Circle size={12} className="text-gray-400" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h4
                className={cn(
                  'font-semibold text-sm',
                  isCompleted || isCurrent ? 'text-text-primary' : 'text-text-muted'
                )}
              >
                {isHindi ? event.titleHi : event.title}
              </h4>
              <p
                className={cn(
                  'text-xs mt-0.5',
                  isCompleted || isCurrent ? 'text-text-secondary' : 'text-text-muted'
                )}
              >
                {isHindi ? event.descriptionHi : event.description}
              </p>
              {event.timestamp && (
                <span className="text-xs text-text-muted mt-1 flex items-center gap-1">
                  <Clock size={10} />
                  {formatDate(event.timestamp)}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
