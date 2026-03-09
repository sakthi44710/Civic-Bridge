// ============================================================
// CivicBridge Type Definitions
// ============================================================

export type Language = 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa';

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  script: string;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  audioUrl?: string;
  timestamp: Date;
  language: Language;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  nameHi?: string;
  language: Language;
  avatar?: string;
  verified: boolean;
  createdAt: Date;
  familyMembers: FamilyMember[];
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number;
  aadhaarLast4?: string;
}

export type SchemeCategory = 'education' | 'health' | 'welfare' | 'agriculture' | 'pension' | 'housing';

export interface Scheme {
  id: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  category: SchemeCategory;
  benefitAmount: number;
  benefitFrequency: 'monthly' | 'yearly' | 'one-time';
  eligibilityScore: number;
  requiredDocuments: string[];
  deadline?: string;
  successRate: number;
  ministry: string;
  applicationUrl: string;
  tags: string[];
}

export type DocumentType = 'aadhaar' | 'pan' | 'voter_id' | 'ration_card' | 'income_cert' | 'caste_cert' | 'domicile' | 'bank_passbook' | 'photo' | 'marksheet' | 'other';

export type DocumentStatus = 'uploading' | 'processing' | 'verified' | 'failed' | 'expired';

export interface Document {
  id: string;
  type: DocumentType;
  name: string;
  originalName: string;
  url: string;
  thumbnailUrl?: string;
  status: DocumentStatus;
  confidence: number;
  extractedData: Record<string, string>;
  uploadedAt: Date;
  expiresAt?: Date;
  fileSize: number;
}

export type ApplicationStatus = 'draft' | 'documents_pending' | 'submitted' | 'processing' | 'verification' | 'approved' | 'rejected' | 'action_required';

export interface Application {
  id: string;
  schemeId: string;
  scheme: Scheme;
  status: ApplicationStatus;
  currentStep: number;
  totalSteps: number;
  submittedAt?: Date;
  updatedAt: Date;
  timeline: TimelineEvent[];
  documents: Document[];
  referenceNumber?: string;
  estimatedCompletion?: Date;
  notes?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  titleHi: string;
  description: string;
  descriptionHi: string;
  status: 'completed' | 'current' | 'pending';
  timestamp?: Date;
  icon?: string;
}

export interface AutomationStep {
  id: string;
  title: string;
  titleHi: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'waiting_input';
  screenshotUrl?: string;
  progress: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
}

export interface OfflineQueueItem {
  id: string;
  type: 'api_call' | 'upload' | 'form_submit';
  data: unknown;
  createdAt: Date;
  retryCount: number;
}
