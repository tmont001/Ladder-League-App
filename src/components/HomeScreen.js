// src/components/HomeScreen.js
import React from 'react';
import ThemeToggle from './shared/ThemeToggle';
import { TennisRacquetIcon, PickleballPaddleIcon, PadelRacquetIcon } from './SportIcons';

function HomeScreen({ onCreateLeague, onJoinLeague }) {
  return (
    <div className="wizard-card">
      <div className="card-accent" />

      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Racquet Sports League Manager</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card-body">
        <div className="home-sport-icons">
          <TennisRacquetIcon size={32} color="var(--accent)" />
          <PickleballPaddleIcon size={32} color="var(--accent)" />
          <PadelRacquetIcon size={32} color="var(--accent)" />
        </div>

        <div className="home-tagline">
          Run a ladder or round-robin league for tennis, pickleball, or padel.
          Track matches, standings, and challenges — all in one place.
        </div>

        <div className="home-options">
          <button
            className="home-option-btn home-option-primary"
            onClick={onCreateLeague}
          >
            <div className="home-option-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="home-option-text">
              <div className="home-option-title">Create a League</div>
              <div className="home-option-desc">
                Organizer: set up a new league, add players, and share access codes
              </div>
            </div>
          </button>

          <span className="home-sep-or" aria-hidden="true">or</span>

          <button
            className="home-option-btn home-option-secondary"
            onClick={onJoinLeague}
          >
            <div className="home-option-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
            <div className="home-option-text">
              <div className="home-option-title">Join a League</div>
              <div className="home-option-desc">
                Player: enter your access code to log results and view standings
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
