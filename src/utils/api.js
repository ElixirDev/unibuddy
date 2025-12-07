import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add session token from localStorage or cookie
api.interceptors.request.use((config) => {
  // First check localStorage (persistent)
  let token = localStorage.getItem('session_token');
  
  // Fallback to cookie
  if (!token) {
    token = document.cookie
      .split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1];
  }
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Handle auth responses - save token to localStorage
api.interceptors.response.use(
  (response) => {
    // If response contains a token in cookie, also save to localStorage
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const tokenMatch = setCookie.find(c => c.startsWith('session_token='));
      if (tokenMatch) {
        const token = tokenMatch.split(';')[0].split('=')[1];
        localStorage.setItem('session_token', token);
      }
    }
    return response;
  },
  (error) => {
    // If 401, clear stored token
    if (error.response?.status === 401) {
      localStorage.removeItem('session_token');
    }
    return Promise.reject(error);
  }
);

// Helper to save token (called after login/signup)
export const saveAuthToken = (token) => {
  if (token) {
    localStorage.setItem('session_token', token);
  }
};

// Helper to clear auth
export const clearAuth = () => {
  localStorage.removeItem('session_token');
};

// Helper to check if user has stored auth
export const hasStoredAuth = () => {
  return !!localStorage.getItem('session_token');
};

export default api;
