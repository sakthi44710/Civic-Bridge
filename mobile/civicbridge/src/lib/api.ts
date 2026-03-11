/**
 * API Service Layer — connects to the CivicBridge FastAPI backend
 */

// Base URL: configurable via env, defaults to localhost
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PREFIX = `${API_BASE}/api/v1`;
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const WS_ENDPOINT = `${WS_BASE}/api/v1/ws/voice`;

// ─── Token Management ────────────────────────────────────
let _token: string | null = null;

export function setToken(token: string | null) {
  _token = token;
  if (token) {
    localStorage.setItem('civicbridge-token', token);
  } else {
    localStorage.removeItem('civicbridge-token');
  }
}

export function getToken(): string | null {
  if (_token) return _token;
  _token = localStorage.getItem('civicbridge-token');
  return _token;
}

export function clearToken() {
  _token = null;
  localStorage.removeItem('civicbridge-token');
}

// ─── HTTP Client ─────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    throw new ApiError('Session expired. Please login again.', 401);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(body.detail || body.message || 'Request failed', response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ─── Auth API ────────────────────────────────────────────
export const authApi = {
  sendOtp(phone_number: string) {
    return request<{ message: string; otp_sent: boolean }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    });
  },

  verifyOtp(phone_number: string, otp: string) {
    return request<{ access_token: string; user: UserResponse }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone_number, otp }),
    });
  },

  register(data: { phone_number: string; name: string; preferred_language: string; email?: string }) {
    return request<{ access_token: string; user: UserResponse }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  googleAuth(id_token: string, name?: string, email?: string, preferred_language?: string) {
    return request<{ access_token: string; user: UserResponse }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token, name, email, preferred_language }),
    });
  },
};

// ─── User API ────────────────────────────────────────────
export const userApi = {
  getProfile() {
    return request<UserResponse>('/users/me');
  },

  updateProfile(data: Partial<ProfileUpdate>) {
    return request<UserResponse>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getDashboard() {
    return request<DashboardResponse>('/users/me/dashboard');
  },

  updateKnownDetail(field_name: string, value: string) {
    return request<{ message: string }>('/users/me/known-details', {
      method: 'PUT',
      body: JSON.stringify({ field_name, value }),
    });
  },
};

// ─── Schemes API ─────────────────────────────────────────
export const schemesApi = {
  search(params?: { query?: string; category?: string; state?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('query', params.query);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.state) searchParams.set('state', params.state);
    const qs = searchParams.toString();
    return request<SchemesResponse>(`/schemes/${qs ? `?${qs}` : ''}`);
  },

  getCategories() {
    return request<{ categories: string[] }>('/schemes/categories');
  },

  getById(schemeId: string) {
    return request<SchemeResponse>(`/schemes/${encodeURIComponent(schemeId)}`);
  },

  match() {
    return request<MatchResponse>('/schemes/match');
  },

  checkEligibility(schemeId: string) {
    return request<EligibilityResponse>(`/schemes/${encodeURIComponent(schemeId)}/eligibility`);
  },
};

// ─── Documents API ───────────────────────────────────────
export const documentsApi = {
  list() {
    return request<DocumentsListResponse>('/documents/');
  },

  upload(file: File, documentType: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    return request<DocumentResponse>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  getById(documentId: string) {
    return request<DocumentResponse>(`/documents/${encodeURIComponent(documentId)}`);
  },

  delete(documentId: string) {
    return request<void>(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  },

  getDownloadUrl(documentId: string) {
    return request<{ url: string }>(`/documents/${encodeURIComponent(documentId)}/download`);
  },

  checkRequirements(requiredDocuments: string[]) {
    return request<DocCheckResponse>('/documents/check-requirements', {
      method: 'POST',
      body: JSON.stringify({ required_documents: requiredDocuments }),
    });
  },
};

// ─── Applications API ────────────────────────────────────
export const applicationsApi = {
  start(schemeId: string) {
    return request<ApplicationResponse>('/applications/start', {
      method: 'POST',
      body: JSON.stringify({ scheme_id: schemeId }),
    });
  },

  list() {
    return request<ApplicationsListResponse>('/applications/');
  },

  getById(applicationId: string) {
    return request<ApplicationResponse>(`/applications/${encodeURIComponent(applicationId)}`);
  },

  automate(applicationId: string) {
    return request<{ message: string; session_id: string }>(`/applications/${encodeURIComponent(applicationId)}/automate`, {
      method: 'POST',
    });
  },

  verify(applicationId: string, approved: boolean, corrections?: Record<string, string>) {
    return request<{ message: string }>(`/applications/${encodeURIComponent(applicationId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ approved, corrections }),
    });
  },

  submitOtp(applicationId: string, otp: string) {
    return request<{ message: string }>(`/applications/${encodeURIComponent(applicationId)}/otp`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
  },

  submitCaptcha(applicationId: string, captchaText: string) {
    return request<{ message: string }>(`/applications/${encodeURIComponent(applicationId)}/captcha`, {
      method: 'POST',
      body: JSON.stringify({ captcha_text: captchaText }),
    });
  },

  submit(applicationId: string) {
    return request<{ message: string }>(`/applications/${encodeURIComponent(applicationId)}/submit`, {
      method: 'POST',
    });
  },

  track(applicationId: string) {
    return request<ApplicationResponse>(`/applications/${encodeURIComponent(applicationId)}/track`);
  },
};

// ─── Chat API ────────────────────────────────────────────
export const chatApi = {
  sendMessage(message: string, conversationId?: string, language?: string) {
    return request<ChatResponse>('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId, language }),
    });
  },

  listConversations() {
    return request<{ conversations: ConversationSummary[] }>('/chat/conversations');
  },

  getConversation(conversationId: string) {
    return request<ConversationResponse>(`/chat/conversations/${encodeURIComponent(conversationId)}`);
  },

  deleteConversation(conversationId: string) {
    return request<void>(`/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
  },
};

// ─── Translation API ─────────────────────────────────────
export const translateApi = {
  text(text: string, targetLanguage: string, sourceLanguage?: string) {
    return request<{ translated_text: string }>('/translate/text', {
      method: 'POST',
      body: JSON.stringify({ text, target_language: targetLanguage, source_language: sourceLanguage }),
    });
  },

  batch(texts: string[], targetLanguage: string, sourceLanguage?: string) {
    return request<{ translations: string[] }>('/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ texts, target_language: targetLanguage, source_language: sourceLanguage }),
    });
  },
};

// ─── WebSocket Voice Service ─────────────────────────────
export function createVoiceWebSocket(token: string): WebSocket {
  const ws = new WebSocket(`${WS_ENDPOINT}?token=${encodeURIComponent(token)}`);
  ws.binaryType = 'arraybuffer';
  return ws;
}

export { API_BASE, API_PREFIX, WS_BASE, WS_ENDPOINT };

// ─── Response Types ──────────────────────────────────────
export interface UserResponse {
  id: string;
  name: string;
  phone_number?: string;
  email?: string;
  preferred_language?: string;
  dob?: string;
  gender?: string;
  category?: string;
  state?: string;
  district?: string;
  pincode?: string;
  address?: string;
  annual_income?: number;
  occupation?: string;
  education_level?: string;
  aadhaar_number?: string;
  pan_number?: string;
  bank_name?: string;
  bank_account?: string;
  ifsc_code?: string;
  known_details?: Record<string, string>;
  created_at?: string;
}

export interface ProfileUpdate {
  name: string;
  email: string;
  dob: string;
  gender: string;
  category: string;
  state: string;
  district: string;
  pincode: string;
  address: string;
  annual_income: number;
  occupation: string;
  education_level: string;
  aadhaar_number: string;
  pan_number: string;
  bank_name: string;
  bank_account: string;
  ifsc_code: string;
  preferred_language: string;
}

export interface DashboardResponse {
  user: UserResponse;
  documents_count: number;
  applications: ApplicationResponse[];
  matched_schemes_count?: number;
}

export interface SchemeResponse {
  id: string;
  name: string;
  category: string;
  description: string;
  benefits: string;
  benefit_amount?: number;
  ministry?: string;
  eligibility_criteria?: Record<string, unknown>;
  required_documents?: string[];
  portal_url?: string;
  application_deadline?: string;
  state?: string;
}

export interface SchemesResponse {
  schemes: SchemeResponse[];
  total: number;
}

export interface MatchResponse {
  schemes: SchemeResponse[];
  match_scores: Record<string, number>;
  missing_documents?: Record<string, string[]>;
  missing_info?: string[];
}

export interface EligibilityResponse {
  eligible: boolean;
  score: number;
  criteria: { name: string; met: boolean; reason: string }[];
  missing_documents: string[];
  missing_info: string[];
}

export interface DocumentResponse {
  id: string;
  user_id: string;
  document_type: string;
  filename: string;
  s3_key: string;
  status: string;
  extracted_data?: Record<string, string>;
  ocr_text?: string;
  confidence?: number;
  content_hash?: string;
  file_size?: number;
  expiry_date?: string;
  uploaded_at: string;
}

export interface DocumentsListResponse {
  documents: DocumentResponse[];
}

export interface DocCheckResponse {
  available: string[];
  missing: string[];
  details: Record<string, { available: boolean; document_id?: string }>;
}

export interface ApplicationResponse {
  id: string;
  user_id: string;
  scheme_id: string;
  scheme_name?: string;
  status: string;
  automation_status?: string;
  portal_url?: string;
  portal_reference?: string;
  acknowledgment_number?: string;
  status_history?: { status: string; timestamp: string; source: string; notes?: string }[];
  screenshots?: string[];
  created_at: string;
  updated_at: string;
}

export interface ApplicationsListResponse {
  applications: ApplicationResponse[];
}

export interface ChatResponse {
  conversation_id: string;
  message: string;
  language: string;
  intent?: string;
  agents_used?: string[];
  form_update?: unknown;
  research_results?: unknown;
}

export interface ConversationSummary {
  id: string;
  title?: string;
  last_message?: string;
  updated_at: string;
}

export interface ConversationResponse {
  id: string;
  messages: { role: string; content: string; timestamp: string; metadata?: unknown }[];
  language?: string;
}
