import React, { useState } from 'react';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';
import ThemeToggle from './shared/ThemeToggle';

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

// Only relevant for tennis when best_of_3 or best_of_5 is chosen
const THIRD_SET_OPTIONS = [
  { value: 'full_set', label: 'Full third set (first to 6)' },
  { value: 'super_tiebreak', label: 'Super tiebreak (first to 10)' },
];

function LeagueSetupStep1({ onNext, initialSettings, onBack }) {
  const [settings, setSettings] = useState(
    initialSettings || {
      leagueName: '',
      sport: 'tennis',
      format: 'best_of_3',
      thirdSetFormat: 'full_set',
      singlesOrDoubles: 'singles',
      rounds: 6,
      challengeSpots: 2,
      autoAdvance: true,
    },
  );

  const selectedSport = SPORTS.find((s) => s.id === settings.sport);
  const isTennis = settings.sport === 'tennis';
  const showThirdSetOption =
    isTennis &&
    (settings.format === 'best_of_3' || settings.format === 'best_of_5');
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

        {/* Third Set / Super Tiebreak option — tennis only */}
        {showThirdSetOption && (
          <div className="field-group">
            <label>Deciding Set Format</label>
            <div className="segment-group">
              {THIRD_SET_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`segment ${settings.thirdSetFormat === o.value ? 'active' : ''}`}
                  onClick={() => set('thirdSetFormat', o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="field-hint">
              {settings.thirdSetFormat === 'super_tiebreak'
                ? '↳ Deciding set is a super tiebreak played to 10 points (win by 2)'
                : '↳ Deciding set is a full set played to 6 games'}
            </div>
          </div>
        )}

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

      <div className={`card-footer ${onBack ? 'card-footer-two' : ''}`}>
        {onBack && (
          <button className="btn-back" onClick={onBack}>
            ← Back
          </button>
        )}
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
