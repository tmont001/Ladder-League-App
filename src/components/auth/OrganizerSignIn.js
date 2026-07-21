import React, { useState } from 'react';
import ThemeToggle from '../shared/ThemeToggle';
import { requestMagicLink } from '../../lib/auth';

// State machine:
//   idle     -> user has not yet submitted
//   sending  -> awaiting requestMagicLink()
//   sent     -> magic link email dispatched
//   error    -> requestMagicLink() rejected

function OrganizerSignIn({ onBack, linkExpired, sessionExpired }) {
  const [uiState, setUiState] = useState('idle');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const SEND_ERROR =
    "We couldn't send a sign-in link. Check the email address and try again.";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setUiState('sending');
    setErrorMsg('');
    try {
      await requestMagicLink(email);
      setUiState('sent');
    } catch (err) {
      // Single neutral message for every failure reason — distinguishing
      // "email not found" from "network error" would reveal whether an
      // address exists in auth.users, which is not appropriate here.
      // Raw Supabase error text is never surfaced to the user.
      console.warn('[OrganizerSignIn] magic link error:', err?.message);
      setErrorMsg(SEND_ERROR);
      setUiState('error');
    }
  };

  const handleResend = () => {
    setUiState('idle');
    setErrorMsg('');
  };

  return (
    <div className="wizard-card">
      <div className="card-accent" />

      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Organizer Sign In</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card-body">
        {sessionExpired && (
          <div className="picker-error" role="alert" style={{ marginBottom: 16 }}>
            {sessionExpired}
          </div>
        )}
        {linkExpired && !sessionExpired && (
          <div className="picker-error" role="alert" style={{ marginBottom: 16 }}>
            Your sign-in link has expired or is no longer valid. Enter your
            email below to receive a new one.
          </div>
        )}

        {uiState === 'sent' ? (
          <div className="info-box">
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Check your email
              </div>
              <div>
                We sent a sign-in link to <strong>{email}</strong>. Click the
                link in the email to continue. The link expires in 60 minutes.
              </div>
              <div style={{ marginTop: 12 }}>
                {"Didn't receive it? "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={handleResend}
                >
                  Resend link
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="organizer-email">
                Organizer email address
              </label>
              <input
                id="organizer-email"
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={uiState === 'sending'}
                autoComplete="email"
                required
              />
            </div>

            {uiState === 'error' && errorMsg && (
              <div className="picker-error" role="alert">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="btn-next"
              disabled={uiState === 'sending' || !email.trim()}
              style={{ marginTop: 8 }}
            >
              {uiState === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>

      <div className="card-footer">
        <button className="btn-back" onClick={onBack} type="button">
          {'←'} Back
        </button>
      </div>
    </div>
  );
}

export default OrganizerSignIn;
