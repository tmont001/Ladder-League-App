import { useEffect, useRef } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// useAccessibleDialog(isOpen, onClose, options?)
//
// options.disableEscape — set true while an async mutation is in flight so
//   pressing Escape cannot abort an in-progress save/delete.
//
// Returns a ref that must be attached to the .modal element (not the overlay).
// The caller is responsible for role="dialog", aria-modal, and aria-labelledby.
export function useAccessibleDialog(isOpen, onClose, { disableEscape = false } = {}) {
  const dialogRef  = useRef(null);
  const triggerRef = useRef(null);

  // Capture the element that had focus before the dialog opened.
  useEffect(() => {
    if (isOpen) triggerRef.current = document.activeElement;
  }, [isOpen]);

  // Move focus into the dialog on open.
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const first = dialogRef.current.querySelector(FOCUSABLE);
    if (first) first.focus();
  }, [isOpen]);

  // Return focus when isOpen becomes false (controlled-close path).
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Return focus on unmount (handles the always-isOpen=true pattern where
  // the parent removes the component from the tree instead of toggling isOpen).
  useEffect(() => {
    return () => {
      const el = triggerRef.current;
      if (el) {
        triggerRef.current = null;
        requestAnimationFrame(() => {
          if (document.body.contains(el)) el.focus();
        });
      }
    };
  }, []);

  // Focus trap + Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (!disableEscape) onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last  = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, disableEscape]);

  useBodyScrollLock(isOpen);

  return dialogRef;
}
