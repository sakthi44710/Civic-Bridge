import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  sendOTP: (phone_number, email) => api.post('/auth/send-otp', { phone_number, email }),
  verifyOTP: (phone_number, otp) => api.post('/auth/verify-otp', { phone_number, otp }),
  register: (data) => api.post('/auth/register', data),
  googleAuth: (data) => api.post('/auth/google', data),
};

// User API
export const userAPI = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data) => api.put('/users/me', data),
  getDashboard: () => api.get('/users/me/dashboard'),
};

// Chat API
export const chatAPI = {
  sendMessage: (message, conversation_id, language) =>
    api.post('/chat/message', { message, conversation_id, language }),
  getConversations: () => api.get('/chat/conversations'),
  getConversation: (id) => api.get(`/chat/conversations/${id}`),
  deleteConversation: (id) => api.delete(`/chat/conversations/${id}`),
};

// Documents API
export const documentsAPI = {
  upload: (file, document_type) => {
    const formData = new FormData();
    formData.append('file', file);
    if (document_type) formData.append('document_type', document_type);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: () => api.get('/documents/'),
  get: (id) => api.get(`/documents/${id}`),
  delete: (id) => api.delete(`/documents/${id}`),
  download: (id) => api.get(`/documents/${id}/download`),
};

// Schemes API
export const schemesAPI = {
  list: (params) => api.get('/schemes/', { params }),
  getCategories: () => api.get('/schemes/categories'),
  get: (id) => api.get(`/schemes/${id}`),
  match: () => api.get('/schemes/match'),
  checkEligibility: (id) => api.get(`/schemes/${id}/eligibility`),
};

// Applications API
export const applicationsAPI = {
  start: (scheme_id) => api.post('/applications/start', { scheme_id }),
  list: () => api.get('/applications/'),
  get: (id) => api.get(`/applications/${id}`),
  startAutomation: (id) => api.post(`/applications/${id}/automate`),
  verifyPage: (id, data) => api.post(`/applications/${id}/verify`, data),
  submitOTP: (id, otp) => api.post(`/applications/${id}/otp`, { otp }),
  submitCaptcha: (id, captcha_text) => api.post(`/applications/${id}/captcha`, { captcha_text }),
  finalSubmit: (id) => api.post(`/applications/${id}/submit`),
  track: (id) => api.get(`/applications/${id}/track`),
};

// DigiLocker API
export const digilockerAPI = {
  initiate: (document_type) => api.post('/digilocker/initiate', { document_type }),
  listTypes: () => api.get('/digilocker/documents'),
};

// Translation API
export const translateAPI = {
  translate: (text, source_language, target_language) =>
    api.post('/translate/text', { text, source_language, target_language }),
  getLanguages: () => api.get('/translate/languages'),
};

export default api;
