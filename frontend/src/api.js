export const API_URL = import.meta.env.VITE_API_URL || '/api';

export const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchJson = async (path, options = {}) => {
  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || 'API request failed');
  }
  return body;
};
