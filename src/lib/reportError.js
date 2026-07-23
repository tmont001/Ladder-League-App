// src/lib/reportError.js
const ENDPOINT = process.env.REACT_APP_ERROR_REPORTING_ENDPOINT;
const VERSION  = process.env.REACT_APP_VERSION || 'unknown';

const BLOCKED_KEYS = new Set([
  'session_token', 'access_token', 'refresh_token', 'token', 'password',
  'authorization', 'key', 'secret', 'email', 'p_token', 'anon_key',
  'sessiontoken',
]);

// JWT: starts with eyJ (base64 header `{`)
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}/;
// URLs or strings that carry sensitive query params
const SENSITIVE_PARAM = /[?&#](token|access_token|refresh_token|session_token|key|secret|password)=/i;

function isSuspiciousString(s) {
  return JWT_PATTERN.test(s) || SENSITIVE_PARAM.test(s);
}

function sanitize(obj, depth = 0) {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj !== 'string') return obj;
    if (obj.length > 500) return '[truncated]';
    if (isSuspiciousString(obj)) return '[redacted]';
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map((item) => sanitize(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !BLOCKED_KEYS.has(k.toLowerCase()))
      .map(([k, v]) => [k, sanitize(v, depth + 1)]),
  );
}

export function reportClientError(error, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    version:   VERSION,
    message:   error?.message || String(error),
    stack:     error?.stack?.split('\n').slice(0, 6).join('\n'),
    context:   sanitize(context),
  };

  console.error('[ClientError]', payload);

  if (ENDPOINT) {
    fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(() => {});
  }
}

let _handlersRegistered = false;

export function registerGlobalErrorHandlers() {
  if (_handlersRegistered) return;
  _handlersRegistered = true;

  window.addEventListener('error', (event) => {
    reportClientError(event.error || new Error(event.message), {
      source: event.filename,
      line:   event.lineno,
      col:    event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    reportClientError(err, { source: 'unhandledrejection' });
  });
}
