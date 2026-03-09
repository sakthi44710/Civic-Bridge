import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Eye, Bot, CheckCircle, Send, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DocumentUploader } from '@/components/documents/DocumentUploader';
import { AutomationProgress } from '@/components/automation/AutomationProgress';
import { Confetti } from '@/components/ui/Confetti';
import { useSchemeStore } from '@/stores/schemeStore';
import { useAutomation } from '@/hooks/useAutomation';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'documents', labelEn: 'Documents', labelHi: 'दस्तावेज़', icon: FileText },
  { id: 'review', labelEn: 'Review', labelHi: 'समीक्षा', icon: Eye },
  { id: 'automation', labelEn: 'Auto-Fill', labelHi: 'ऑटो-फिल', icon: Bot },
  { id: 'verification', labelEn: 'Verify', labelHi: 'सत्यापन', icon: CheckCircle },
  { id: 'submit', labelEn: 'Submit', labelHi: 'जमा करें', icon: Send },
];

export const ApplicationFlowScreen: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schemes } = useSchemeStore();
  const { bilingual } = useLocalization();
  const { steps: autoSteps, isRunning, isPaused, estimatedTime, startAutomation, pauseAutomation, resumeAutomation, currentStep: autoCurrentStep } = useAutomation();
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const scheme = schemes.find((s) => s.id === id);

  const handleNext = () => {
    if (currentStep === 2) {
      // Start automation demo
      startAutomation([
        { id: '1', title: 'Opening government portal', titleHi: 'सरकारी पोर्टल खोल रहे हैं', status: 'pending', progress: 0 },
        { id: '2', title: 'Filling personal details', titleHi: 'व्यक्तिगत विवरण भर रहे हैं', status: 'pending', progress: 0 },
        { id: '3', title: 'Uploading documents', titleHi: 'दस्तावेज़ अपलोड कर रहे हैं', status: 'pending', progress: 0 },
        { id: '4', title: 'Submitting application', titleHi: 'आवेदन जमा कर रहे हैं', status: 'pending', progress: 0 },
      ]);
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setShowConfetti(true);
      setTimeout(() => navigate('/tracking'), 3000);
    }
  };

  return (
    <div className="px-4 py-4 pb-28 max-w-md mx-auto space-y-6">
      <Confetti trigger={showConfetti} />

      {/* Progress Stepper */}
      <div>
        <ProgressBar value={(currentStep / (STEPS.length - 1)) * 100} variant="gradient" size="sm" />
        <div className="flex justify-between mt-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center gap-1">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm',
                  isDone ? 'bg-green text-white' : isActive ? 'bg-saffron text-white' : 'bg-gray-200 text-gray-400'
                )}>
                  {isDone ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className={cn('text-xs', isActive ? 'text-saffron font-semibold' : 'text-text-muted')}>
                  {bilingual(step.labelEn, step.labelHi)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-text-primary">
                {bilingual('Upload Required Documents', 'आवश्यक दस्तावेज़ अपलोड करें')}
              </h2>
              <DocumentUploader documentType="aadhaar" />
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-text-primary">
                {bilingual('Review Your Information', 'अपनी जानकारी की समीक्षा करें')}
              </h2>
              <Card variant="default" padding="md" className="space-y-3">
                {[
                  { label: bilingual('Name', 'नाम'), value: 'Demo User' },
                  { label: bilingual('Phone', 'फोन'), value: '+91 98765 43210' },
                  { label: bilingual('Aadhaar', 'आधार'), value: 'XXXX-XXXX-4321' },
                  { label: bilingual('Scheme', 'योजना'), value: scheme?.name || 'N/A' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-text-muted">{item.label}</span>
                    <span className="text-sm font-medium text-text-primary">{item.value}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-text-primary">
                {bilingual('Digital Clerk Auto-Fill', 'डिजिटल क्लर्क ऑटो-फिल')}
              </h2>
              <p className="text-sm text-text-secondary">
                {bilingual(
                  'Our AI will automatically fill your application form on the government portal.',
                  'हमारा AI स्वचालित रूप से सरकारी पोर्टल पर आपका आवेदन पत्र भरेगा।'
                )}
              </p>
              {autoSteps.length > 0 && (
                <AutomationProgress
                  steps={autoSteps}
                  currentStep={autoCurrentStep}
                  isPaused={isPaused}
                  estimatedTime={estimatedTime}
                  onPause={pauseAutomation}
                  onResume={resumeAutomation}
                />
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-text-primary">
                {bilingual('Verify Submission', 'प्रस्तुति सत्यापित करें')}
              </h2>
              <Card variant="elevated" padding="lg" className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-light mx-auto flex items-center justify-center">
                  <CheckCircle size={32} className="text-green" />
                </div>
                <p className="font-semibold text-text-primary">
                  {bilingual('Form filled successfully!', 'फॉर्म सफलतापूर्वक भरा गया!')}
                </p>
                <p className="text-sm text-text-secondary">
                  {bilingual('Please verify all information is correct before final submission.', 'अंतिम सबमिशन से पहले सभी जानकारी सही है यह सत्यापित करें।')}
                </p>
              </Card>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4 text-center">
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.6 }}
                className="w-20 h-20 rounded-full bg-green-light mx-auto flex items-center justify-center"
              >
                <Send size={36} className="text-green" />
              </motion.div>
              <h2 className="text-xl font-extrabold text-text-primary">
                {bilingual('Ready to Submit!', 'जमा करने के लिए तैयार!')}
              </h2>
              <p className="text-sm text-text-secondary max-w-xs mx-auto">
                {bilingual(
                  'Your application for ' + (scheme?.name || '') + ' will be submitted to the government portal.',
                  (scheme?.nameHi || '') + ' के लिए आपका आवेदन सरकारी पोर्टल पर जमा किया जाएगा।'
                )}
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent">
        <div className="max-w-md mx-auto flex gap-3">
          {currentStep > 0 && (
            <Button
              variant="outline"
              size="lg"
              icon={<ArrowLeft size={18} />}
              onClick={() => setCurrentStep((s) => s - 1)}
            >
              {bilingual('Back', 'पीछे')}
            </Button>
          )}
          <Button
            size="lg"
            fullWidth
            icon={currentStep === STEPS.length - 1 ? <Send size={18} /> : <ArrowRight size={18} />}
            onClick={handleNext}
            variant={currentStep === STEPS.length - 1 ? 'success' : 'primary'}
          >
            {currentStep === STEPS.length - 1
              ? bilingual('Submit Application', 'आवेदन जमा करें')
              : bilingual('Continue', 'जारी रखें')}
          </Button>
        </div>
      </div>
    </div>
  );
};
