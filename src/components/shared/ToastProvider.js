// src/components/shared/ToastProvider.js
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef(new Map()); // dedup: key → timestamp

  const showToast = useCallback((message, variant = 'success', duration) => {
    const key = `${variant}:${message}`;
    const now = Date.now();
    if ((recentRef.current.get(key) ?? 0) > now - 2000) return;
    recentRef.current.set(key, now);

    const id = now + Math.random();
    const ms = duration ?? (
      variant === 'error'   ? 8000 :
      variant === 'warning' ? 6000 :
      4000
    );

    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const polite = toasts.filter((t) => t.variant !== 'error');
  const urgent  = toasts.filter((t) => t.variant === 'error');

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* polite region: success / warning / neutral */}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {polite.map((t) => (
          <div key={t.id} className={`toast toast-${t.variant}`} role="status">
            <span className="toast-message">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* assertive region: errors only */}
      <div
        className="toast-region toast-region-error"
        aria-live="assertive"
        aria-atomic="true"
      >
        {urgent.map((t) => (
          <div key={t.id} className="toast toast-error" role="alert">
            <span className="toast-message">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
