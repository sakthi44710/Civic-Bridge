// ─── Language ────────────────────────────────────────────
export type Language = 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr' | 'gu' | 'kn' | 'ml' | 'pa';

export interface LanguageOption {
  code: Language;
  label: string;
  nativeLabel: string;
  nativeName: string;
  name: string;
  flag: string;
}

// ─── User & Auth ─────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  nameHi?: string;
  phone: string;
  aadhaarNum?: string;
  state?: string;
  district?: string;
  category?: string;
  language: Language;
  avatar?: string;
  createdAt: Date;
  familyMembers?: FamilyMember[];
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: 'spouse' | 'child' | 'parent' | 'sibling' | 'other';
  aadhaarNum?: string;
  age: number;
}

// ─── Schemes ─────────────────────────────────────────────
export type SchemeCategory = 'education' | 'healthcare' | 'welfare' | 'agriculture' | 'housing' | 'employment' | 'women';
export type ApplicationStatus = 'eligible' | 'applied' | 'processing' | 'under_review' | 'approved' | 'rejected' | 'action_required';

export interface Scheme {
  id: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  category: SchemeCategory;
  ministry: string;
  benefitAmount?: number;
  benefitType: 'cash' | 'scholarship' | 'subsidy' | 'service' | 'goods';
  deadline?: Date;
  eligibilityMatch: number;           // 0-100
  requiredDocs: DocumentType[];
  eligibilityCriteria: EligibilityCriterion[];
  applicationUrl?: string;
  applicationCount?: number;
  approvalRate?: number;
  avgApprovalDays?: number;
}

export interface EligibilityCriterion {
  label: string;
  labelHi: string;
  met: boolean;
  value?: string;
}

// ─── Applications ─────────────────────────────────────────
export interface Application {
  id: string;
  schemeId: string;
  scheme: Scheme;
  status: ApplicationStatus;
  submittedAt?: Date;
  updatedAt: Date;
  acknowledgementNo?: string;
  nextAction?: string;
  nextActionDeadline?: Date;
  timeline: TimelineStage[];
  documents: ProcessedDocument[];
}

export interface TimelineStage {
  name: string;
  nameHi: string;
  status: 'completed' | 'current' | 'pending';
  date?: Date;
  description: string;
  descriptionHi: string;
}

// ─── Documents ────────────────────────────────────────────
export type DocumentType =
  | 'aadhaar'
  | 'pan'
  | 'voter_id'
  | 'passport'
  | 'driving_license'
  | 'ration_card'
  | 'income_certificate'
  | 'caste_certificate'
  | 'marksheet'
  | 'birth_certificate'
  | 'bank_passbook'
  | 'other';

export interface ProcessedDocument {
  id: string;
  type: DocumentType;
  filename: string;
  thumbnail?: string;
  extractedData: Record<string, string>;
  confidence: number;       // 0-1
  expiryDate?: Date;
  status: 'processing' | 'verified' | 'expired' | 'error';
  uploadedAt: Date;
  fileUrl?: string;
  fileSize?: number;
}

// ─── Voice ────────────────────────────────────────────────
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface TranscriptEntry {
  id: string;
  type: 'user' | 'ai';
  text: string;
  textHi?: string;
  audioUrl?: string;
  timestamp: Date;
  language: Language;
}

// ─── Automation ───────────────────────────────────────────
export type AutomationStatus = 'filling' | 'paused' | 'verifying' | 'completed' | 'error';

export interface AutomationStep {
  id: string;
  name: string;
  nameHi: string;
  status: 'completed' | 'current' | 'pending' | 'error';
  screenshot?: string;
  duration?: number;
}

export interface AutomationSession {
  id: string;
  schemeId: string;
  status: AutomationStatus;
  currentStep: number;
  totalSteps: number;
  steps: AutomationStep[];
  screenshotUrl?: string;
  requiresAction?: 'otp' | 'captcha' | 'verification';
  estimatedTimeRemaining?: number;
  startedAt: Date;
}

// ─── Notifications ────────────────────────────────────────
export interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  body: string;
  applicationId?: string;
  read: boolean;
  createdAt: Date;
}
