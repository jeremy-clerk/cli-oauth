import chalk from 'chalk';
import { loadToken } from './auth-storage';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function apiRequest(endpoint: string, options: ApiOptions = {}) {
  const token = await loadToken();
  
  if (!token) {
    throw new Error('Not authenticated. Please run "clerk-tasks login" first.');
  }
  
  const url = `${API_BASE_URL}/api${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token.access_token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${error}`);
  }
  
  return response.json();
}

export const api = {
  tasks: {
    list: () => apiRequest('/tasks'),
    get: (id: string) => apiRequest(`/tasks/${id}`),
    create: (data: { title: string; description?: string }) => 
      apiRequest('/tasks', { method: 'POST', body: data }),
    update: (id: string, data: { title?: string; description?: string; completed?: boolean }) =>
      apiRequest(`/tasks/${id}`, { method: 'PATCH', body: data }),
    delete: (id: string) => apiRequest(`/tasks/${id}`, { method: 'DELETE' }),
  },
};