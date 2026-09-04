const configuredApiBase = import.meta.env.VITE_MYTUSKERS_API_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:4100');

const resolveApiBase = () => {
  if (typeof window === 'undefined') return configuredApiBase;
  if (!configuredApiBase) return window.location.origin;

  const browserHost = window.location.hostname;
  const isBrowserOnLocalhost = browserHost === 'localhost' || browserHost === '127.0.0.1';
  const configuredUrl = new URL(configuredApiBase, window.location.origin);
  const configuredIsLocalhost = configuredUrl.hostname === 'localhost' || configuredUrl.hostname === '127.0.0.1';

  if (!isBrowserOnLocalhost && configuredIsLocalhost) {
    // Rewriting the host lets a phone on the LAN reach the dev API on the host
    // machine. In a production bundle the same rewrite would point at a dev
    // port on the real domain, so a leaked build-time value fails loudly as
    // mixed content instead; same-origin is the only correct target there.
    if (import.meta.env.PROD) return window.location.origin;
    configuredUrl.hostname = browserHost;
  }

  return configuredUrl.toString().replace(/\/$/, '');
};

export const API_BASE = resolveApiBase();

export const assetUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_BASE}${path}`;
};

export const money = (minor) => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
}).format((minor || 0) / 100);

export const formatDate = (dateText, options = {}) => new Intl.DateTimeFormat('en-AU', {
  weekday: options.weekday || undefined,
  day: '2-digit',
  month: options.month || 'short',
  hour: options.time ? 'numeric' : undefined,
  minute: options.time ? '2-digit' : undefined,
}).format(new Date(dateText));

export const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(body?.message || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return body;
};

export const statusLabel = {
  AVAILABLE: "You're in",
  UNAVAILABLE: "Can't make it",
  MAYBE: 'Maybe',
  NO_RESPONSE: 'Not answered',
};

export const matchResultOptions = [
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'DRAW', label: 'Draw' },
  { value: 'TIE', label: 'Tie' },
  { value: 'NO_RESULT', label: 'No result' },
];

export const matchResultLabel = Object.fromEntries(matchResultOptions.map((option) => [option.value, option.label]));

/** Maps a result onto the `mini-pill` / `captain-match-status` tone modifiers. */
export const matchResultTone = {
  WON: 'good',
  LOST: 'loss',
  DRAW: 'neutral',
  TIE: 'neutral',
  NO_RESULT: 'neutral',
};
