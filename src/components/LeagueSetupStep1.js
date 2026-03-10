import React, { useState } from 'react';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';
import { useTheme } from '../context/ThemeContext';

const SPORTS = [
  {
    id: 'tennis',
    label: 'Tennis',
    Icon: TennisRacquetIcon,
    formatLabel: 'Sets to win match',
    formatOptions: [
      { value: 'best_of_1', label: 'Best of 1 set' },
      { value: 'best_of_3', label: 'Best of 3 sets' },
      { value: 'best_of_5', label: 'Best of 5 sets' },
    ],
    scoreNote: 'Sets scored to 6 games (tiebreak at 6-6)',
  },
  {
    id: 'pickleball',
    label: 'Pickleball',
    Icon: PickleballPaddleIcon,
    formatLabel: 'Games to win match',
    formatOptions: [
      { value: 'best_of_1', label: 'Best of 1 game' },
      { value: 'best_of_3', label: 'Best of 3 games' },
    ],
    scoreNote: 'Games scored to 11 points (win by 2)',
  },
];

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  );
}

function LeagueSetupStep1({ onNext }) {
  const [settings, setSettings] = useState({
    leagueName: '',
    sport: 'tennis',
    format: 'best_of_3',
    singlesOrDoubles: 'singles',
    rounds: 6,
    challengeSpots: 2,
    autoAdvance: true,
  });

  const selectedSport = SPORTS.find((s) => s.id === settings.sport);
  const isValid = settings.leagueName.trim().length > 0;

  const set = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }));

  const handleSportChange = (sportId) => {
    const sport = SPORTS.find((s) => s.id === sportId);
    setSettings((prev) => ({
      ...prev,
      sport: sportId,
      format: sport.formatOptions[1]?.value || sport.formatOptions[0].value,
    }));
  };

  return (
    <div className="wizard-card">
      <div className="card-accent" />

      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Step 1 of 3 — League Setup</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot active" />
          <div className="dot idle" />
          <div className="dot idle" />
        </div>
      </div>

      <div className="card-body">
        {/* Sport Selector */}
        <div className="field-group">
          <label>Sport</label>
          <div className="sport-tabs">
            {SPORTS.map((s) => (
              <button
                key={s.id}
                className={`sport-tab ${settings.sport === s.id ? 'active' : ''}`}
                onClick={() => handleSportChange(s.id)}
              >
                <span className="sport-tab-icon">
                  <s.Icon size={24} color="currentColor" />
                </span>
                <span className="sport-tab-text">
                  <span className="sport-tab-label">{s.label}</span>
                  <span className="sport-tab-note">{s.scoreNote}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* League Name */}
        <div className="field-group">
          <label>League Name</label>
          <input
            type="text"
            placeholder="e.g. Mineola Tennis Club Fall League"
            value={settings.leagueName}
            onChange={(e) => set('leagueName', e.target.value)}
          />
        </div>

        {/* Singles / Doubles + Match Format */}
        <div className="grid-2">
          <div className="field-group">
            <label>Format</label>
            <div className="segment-group">
              {['singles', 'doubles'].map((v) => (
                <button
                  key={v}
                  className={`segment ${settings.singlesOrDoubles === v ? 'active' : ''}`}
                  onClick={() => set('singlesOrDoubles', v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label>{selectedSport.formatLabel}</label>
            <select
              value={settings.format}
              onChange={(e) => set('format', e.target.value)}
            >
              {selectedSport.formatOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Number of Rounds */}
        <div className="field-group">
          <label>Number of Rounds</label>
          <div className="slider-row">
            <input
              type="range"
              min={2}
              max={16}
              value={settings.rounds}
              onChange={(e) => set('rounds', Number(e.target.value))}
            />
            <div className="slider-val">{settings.rounds}</div>
          </div>
        </div>

        {/* Challenge Window */}
        <div className="field-group">
          <label>Challenge Window (spots above)</label>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={5}
              value={settings.challengeSpots}
              onChange={(e) => set('challengeSpots', Number(e.target.value))}
            />
            <div className="slider-val">{settings.challengeSpots}</div>
          </div>
        </div>

        {/* Auto-advance Toggle */}
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Auto-advance rounds</div>
            <div className="toggle-sub">
              Automatically generate next round when all matches are complete
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoAdvance}
              onChange={(e) => set('autoAdvance', e.target.checked)}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      <div className="card-footer">
        <button
          className="btn-next"
          disabled={!isValid}
          onClick={() => onNext?.(settings)}
        >
          Continue to Players →
        </button>
      </div>
    </div>
  );
}

export default LeagueSetupStep1;
