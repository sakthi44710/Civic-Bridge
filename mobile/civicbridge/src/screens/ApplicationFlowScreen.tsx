import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AutomationProgress } from '@/components/automation/AutomationProgress';
import { OTPInput } from '@/components/automation/OTPInput';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Progress';
import { useSchemeStore } from '@/stores/schemeStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useLocalization } from '@/hooks/useLocalization';
import { useConfetti } from '@/hooks/useConfetti';
import { sleep } from '@/lib/utils';
import { applicationsApi } from '@/lib/api';
import type { AutomationSession, Application } from '@/types';
import toast from 'react-hot-toast';

type FlowStep = 'documents' | 'review' | 'automation' | 'verification' | 'success';

const STEP_LABELS = ['Documents', 'Review', 'Apply', 'Verify', 'Done'];

const MOCK_AUTO_STEPS = [
  { id: '1', name: 'Login to portal', nameHi: 'पोर्टल में लॉगिन', status: 'completed' as const },
  { id: '2', name: 'Fill personal info', nameHi: 'व्यक्तिगत जानकारी भरें', status: 'completed' as const },
  { id: '3', name: 'Upload documents', nameHi: 'दस्तावेज़ अपलोड करें', status: 'current' as const },
  { id: '4', name: 'Submit application', nameHi: 'आवेदन जमा करें', status: 'pending' as const },
  { id: '5', name: 'Get reference no.', nameHi: 'संदर्भ नंबर लें', status: 'pending' as const },
];

export function ApplicationFlowScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { schemes, addApplication } = useSchemeStore();
  const { documents } = useDocumentStore();
  const { t, language } = useLocalization();
  const { fire: fireConfetti } = useConfetti();

  const scheme = schemes.find(s => s.id === id);
  const [step, setStep] = useState<FlowStep>('documents');
  const [automationRunning, setAutomationRunning] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [ackNo, setAckNo] = useState('');

  const autoSession: AutomationSession = {
    id: 'session-1',
    schemeId: id!,
    status: automationRunning ? 'filling' : 'paused',
    currentStep: Math.ceil(autoProgress / 20),
    totalSteps: 5,
    steps: MOCK_AUTO_STEPS,
    estimatedTimeRemaining: 45,
    startedAt: new Date(),
  };

  const startAutomation = async () => {
    setAutomationRunning(true);
    try {
      // Try real API: start the application then automate
      const app = await useSchemeStore.getState().startApplication(id!);
      if (app) {
        await applicationsApi.automate(app.id);
      }
    } catch {
      // Fallback to mock progress
    }
    for (let i = 0; i <= 60; i += 10) {
      setAutoProgress(i);
      await sleep(800);
    }
    setAutomationRunning(false);
    setStep('verification');
  };

  const handleOTPVerified = async (otp: string) => {
    toast.loading('Submitting application...');
    await sleep(2000);
    toast.dismiss();
    const no = 'CB' + Date.now().toString().slice(-8);
    setAckNo(no);

    const newApp: Application = {
      id: 'app-' + Date.now(),
      schemeId: scheme!.id,
      scheme: scheme!,
      status: 'applied',
      submittedAt: new Date(),
      updatedAt: new Date(),
      acknowledgementNo: no,
      timeline: [
        { name: 'Submitted', nameHi: 'जमा किया', status: 'completed', date: new Date(), description: 'Application submitted', descriptionHi: 'आवेदन जमा किया गया' },
        { name: 'Under Review', nameHi: 'समीक्षा में', status: 'pending', description: 'Awaiting review', descriptionHi: 'समीक्षा की प्रतीक्षा' },
        { name: 'Approval', nameHi: 'अनुमोदन', status: 'pending', description: 'Awaiting approval', descriptionHi: 'अनुमोदन की प्रतीक्षा' },
      ],
      documents: [],
    };
    addApplication(newApp);
    setStep('success');
    fireConfetti();
  };

  if (!scheme) return null;
  const stepIndex = ['documents', 'review', 'automation', 'verification', 'success'].indexOf(step);
  const schemeName = language === 'hi' ? scheme.nameHi : scheme.name;

  return (
    <AppShell title={schemeName} showBack>
      <div className="page-container pt-4 space-y-6">
        {/* Step indicator */}
        <div className="space-y-2">
          <ProgressBar value={(stepIndex + 1) * 20} color="saffron" size="md" />
          <div className="flex justify-between">
            {STEP_LABELS.map((lbl, i) => (
              <span key={lbl} className={`text-xs font-medium ${i <= stepIndex ? 'text-saffron-500' : 'text-slate-300'}`}>{lbl}</span>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* DOCUMENTS */}
          {step === 'documents' && (
            <motion.div key="docs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="section-title">Required Documents</h2>
              <p className="text-sm text-slate-500">We found these documents in your vault:</p>
              <div className="space-y-3">
                {scheme.requiredDocs.map((docType) => {
                  const found = documents.find(d => d.type === docType && d.status === 'verified');
                  return (
                    <div key={docType}>
                      {found ? (
                        <DocumentCard doc={found} compact />
                      ) : (
                        <div className="card p-4 flex items-center gap-3 border-dashed border-2 border-slate-200">
                          <span className="text-2xl">📎</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-700">{docType.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-red-500">Not found – Upload required</p>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => navigate('/documents')}>Upload</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button variant="primary" size="lg" className="w-full" onClick={() => setStep('review')}>
                Looks Good, Continue
              </Button>
            </motion.div>
          )}

          {/* REVIEW */}
          {step === 'review' && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="section-title">Review Your Details</h2>
              <p className="text-sm text-slate-500">Auto-filled from your documents:</p>
              <div className="card divide-y divide-slate-100">
                {[['Full Name', 'Ramesh Kumar'], ['Father\'s Name', 'Mohan Kumar'], ['Date of Birth', '15/08/1990'],['Annual Income', '₹72,000'], ['State', 'Uttar Pradesh'], ['District', 'Lucknow'], ['Aadhaar No', '1234 **** **** 9012'], ['Bank Account', 'SBI – XXXX1234']].map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-slate-500">{key}</span>
                    <span className="text-sm font-semibold text-slate-900">{val}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 text-center">Data extracted from your Aadhaar & documents. Tap to edit any field.</p>
              <Button variant="primary" size="lg" className="w-full" onClick={() => setStep('automation')}>
                ✅ Confirm & Start Applying
              </Button>
              <Button variant="ghost" size="md" className="w-full" onClick={() => setStep('documents')}>Back</Button>
            </motion.div>
          )}

          {/* AUTOMATION */}
          {step === 'automation' && (
            <motion.div key="auto" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="section-title">{t('auto.digital_clerk')}</h2>
              <p className="text-sm text-slate-500">Our AI is filling the form on your behalf</p>
              <AutomationProgress
                session={autoSession}
                onPause={() => setAutomationRunning(false)}
                onResume={() => startAutomation()}
                onCancel={() => navigate(-1)}
              />
              {!automationRunning && autoProgress === 0 && (
                <Button variant="primary" size="lg" className="w-full" onClick={startAutomation}>
                  🤖 Start Digital Clerk
                </Button>
              )}
            </motion.div>
          )}

          {/* VERIFICATION */}
          {step === 'verification' && (
            <motion.div key="verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <h2 className="section-title text-center">{t('auto.otp_title')}</h2>
              <p className="text-sm text-center text-slate-500">The portal sent an OTP to verify your identity</p>
              <OTPInput onComplete={handleOTPVerified} phone="+91 98765 43210" onResend={() => toast.success('OTP resent!')} />
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 text-center py-8"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                transition={{ duration: 0.8 }}
                className="text-7xl"
              >
                🎉
              </motion.div>
              <div>
                <CheckCircle2 className="h-12 w-12 text-india-green-500 mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-slate-900">Application Submitted!</h2>
                <p className="text-xl font-semibold text-india-green-600">आवेदन जमा हो गया!</p>
              </div>
              <div className="card p-4 space-y-2 text-left">
                <p className="text-xs text-slate-500">Acknowledgement Number</p>
                <p className="text-lg font-bold text-saffron-600 font-mono tracking-wide">{ackNo}</p>
                <p className="text-xs text-slate-400">Save this for future reference</p>
              </div>
              <div className="space-y-3">
                <Button variant="primary" size="lg" className="w-full" onClick={() => navigate('/tracking')}>
                  Track Application
                </Button>
                <Button variant="outline" size="md" className="w-full" onClick={() => navigate('/')}>
                  Go to Home
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
