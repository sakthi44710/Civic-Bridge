import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — add JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('civicbridge-user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  },
);

// Auth API
export const authAPI = {
  sendOTP: (phone_number: string, email?: string) =>
    api.post('/auth/send-otp', { phone_number, email }),
  verifyOTP: (phone_number: string, otp: string) =>
    api.post('/auth/verify-otp', { phone_number, otp }),
  register: (data: Record<string, unknown>) => api.post('/auth/register', data),
  googleAuth: (data: Record<string, unknown>) => api.post('/auth/google', data),
};

// User API
export const userAPI = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: Record<string, unknown>) => api.put('/users/me', data),
  getDashboard: () => api.get('/users/me/dashboard'),
  updateKnownDetail: (field_name: string, value: string) =>
    api.put('/users/me/known-details', { field_name, value }),
  deleteKnownDetail: (field_name: string) =>
    api.delete(`/users/me/known-details/${encodeURIComponent(field_name)}`),
};

// Chat API
export const chatAPI = {
  sendMessage: (message: string, conversation_id?: string, language?: string) =>
    api.post('/chat/message', { message, conversation_id, language }),
  getConversations: () => api.get('/chat/conversations'),
  getConversation: (id: string) => api.get(`/chat/conversations/${id}`),
  deleteConversation: (id: string) => api.delete(`/chat/conversations/${id}`),
};

// Documents API
export const documentsAPI = {
  upload: (file: File, document_type?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (document_type) formData.append('document_type', document_type);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: () => api.get('/documents/'),
  get: (id: string) => api.get(`/documents/${id}`),
  delete: (id: string) => api.delete(`/documents/${id}`),
  download: (id: string) => api.get(`/documents/${id}/download`),
};

// Schemes API
export const schemesAPI = {
  list: (params?: Record<string, string>) => api.get('/schemes/', { params }),
  getCategories: () => api.get('/schemes/categories'),
  get: (id: string) => api.get(`/schemes/${id}`),
  match: () => api.get('/schemes/match'),
  checkEligibility: (id: string) => api.get(`/schemes/${id}/eligibility`),
};

// Applications API
export const applicationsAPI = {
  start: (scheme_id: string) => api.post('/applications/start', { scheme_id }),
  list: () => api.get('/applications/'),
  get: (id: string) => api.get(`/applications/${id}`),
  startAutomation: (id: string) => api.post(`/applications/${id}/automate`),
  verifyPage: (id: string, data: Record<string, unknown>) =>
    api.post(`/applications/${id}/verify`, data),
  submitOTP: (id: string, otp: string) => api.post(`/applications/${id}/otp`, { otp }),
  submitCaptcha: (id: string, captcha_text: string) =>
    api.post(`/applications/${id}/captcha`, { captcha_text }),
  finalSubmit: (id: string) => api.post(`/applications/${id}/submit`),
  track: (id: string) => api.get(`/applications/${id}/track`),
};

// Translation API
export const translateAPI = {
  translate: (text: string, source_language: string, target_language: string) =>
    api.post('/translate/text', { text, source_language, target_language }),
  getLanguages: () => api.get('/translate/languages'),
};

export default api;
