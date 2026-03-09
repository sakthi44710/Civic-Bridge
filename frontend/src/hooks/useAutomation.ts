import { useState, useCallback } from 'react';
import type { AutomationStep } from '@/types';

export function useAutomation() {
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState(0);

  const startAutomation = useCallback((automationSteps: AutomationStep[]) => {
    setSteps(automationSteps);
    setCurrentStep(0);
    setIsRunning(true);
    setIsPaused(false);
    setEstimatedTime(automationSteps.length * 15); // ~15s per step

    // Simulate automation progress
    let step = 0;
    const timer = setInterval(() => {
      if (step >= automationSteps.length) {
        clearInterval(timer);
        setIsRunning(false);
        return;
      }

      setSteps((prev) =>
        prev.map((s, i) => {
          if (i < step) return { ...s, status: 'completed', progress: 100 };
          if (i === step) return { ...s, status: 'in_progress', progress: 50 };
          return s;
        })
      );

      setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) => {
            if (i <= step) return { ...s, status: 'completed', progress: 100 };
            return s;
          })
        );
        step++;
        setCurrentStep(step);
        setEstimatedTime((prev) => Math.max(0, prev - 15));
      }, 2000);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const pauseAutomation = useCallback(() => setIsPaused(true), []);
  const resumeAutomation = useCallback(() => setIsPaused(false), []);

  return {
    steps,
    currentStep,
    isRunning,
    isPaused,
    estimatedTime,
    startAutomation,
    pauseAutomation,
    resumeAutomation,
  };
}
