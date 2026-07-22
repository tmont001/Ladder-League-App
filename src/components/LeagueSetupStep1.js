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
  },
  {
    id: 'pickleball',
    label: 'Pickleball',
    Icon: PickleballPaddleIcon,
    formatLabel: 'Games to win match',
    formatOptions: [
      { value: 'best_of_1', label: 'Best of 1 game' },
      { value: 'best_of_3', label: 'Best of 3 games' },
      { value: 'best_of_5', label: 'Best of 5 games' },
    ],
  },
];

const GAMES_PER_SET = [
  { value: 4, label: '4 games (short sets)' },
  { value: 6, label: '6 games (standard)' },
  { value: 8, label: '8 games (pro set)' },
];
const TIEBREAK_OPTS = [
  { value: 'standard', label: 'Standard (first to 7)' },
  { value: 'no_tiebreak', label: 'No tiebreak (play out)' },
  { value: 'match_tiebreak', label: 'Match tiebreak (to 10)' },
];
const DECIDING_OPTS = [
  { value: 'full_set', label: 'Full set' },
  { value: 'super_tiebreak', label: 'Super tiebreak (to 10)' },
  { value: 'match_tiebreak', label: 'Match tiebreak (to 10)' },
];
const PB_POINTS = [
  { value: 11, label: '11 pts (standard)' },
  { value: 15, label: '15 pts' },
  { value: 21, label: '21 pts' },
];
const TIME_OPTS = [
  { value: 'untimed', label: 'Untimed' },
  { value: '60', label: '60 min limit' },
  { value: '90', label: '90 min limit' },
  { value: '120', label: '120 min limit' },
];

function LeagueSetupStep1({ onNext, initialSettings, onBack, onSportChange }) {
  const [s, setS] = useState(
    initialSettings || {
      leagueName: '',
      sport: 'tennis',
      mode: 'round_robin',
      format: 'best_of_3',
      singlesOrDoubles: 'singles',
      rounds: 6,
      challengeSpots: 2,
      autoAdvance: true,
      gamesPerSet: 6,
      tiebreakFormat: 'standard',
      thirdSetFormat: 'super_tiebreak',
      pickleballPoints: 11,
      scoringTime: 'untimed',
      noAd: false,
    },
  );

  const set = (key, val) => setS((prev) => ({ ...prev, [key]: val }));
  const isTennis = s.sport === 'tennis';
  const isLadder = s.mode === 'ladder';
  const isPickleball = s.sport === 'pickleball';
  const isMultiSet = s.format === 'best_of_3' || s.format === 'best_of_5';
  const isValid = s.leagueName.trim().length > 0;
  const sport = SPORTS.find((x) => x.id === s.sport);

  const handleSportChange = (id) => {
    const sp = SPORTS.find((x) => x.id === id);
    setS((prev) => ({
      ...prev,
      sport: id,
      format: sp.formatOptions[1]?.value || sp.formatOptions[0].value,
    }));
    if (onSportChange) onSportChange(id);
  };

  return (
    <div className="wizard-card wizard-card-step1">
      <div className="card-accent" />
      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Step 1 of 2 — League Setup</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot active" />
          <div className="dot idle" />
        </div>
      </div>

      <div className="card-body card-body-sections">

        {/* ── Section 1: League identity ── */}
        <div className="wizard-section">
          <div className="wizard-section-title">League</div>

          <div className="field-group">
            <label>Sport</label>
            <div className="sport-tabs">
              {SPORTS.map((sp) => (
                <button
                  key={sp.id}
                  className={`sport-tab ${s.sport === sp.id ? 'active' : ''}`}
                  onClick={() => handleSportChange(sp.id)}
                >
                  <span className="sport-tab-icon">
                    <sp.Icon size={22} color="currentColor" />
                  </span>
                  <span className="sport-tab-text">
                    <span className="sport-tab-label">{sp.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label>League Name</label>
            <input
              type="text"
              placeholder="e.g. My Local Tennis Club Fall League"
              value={s.leagueName}
              onChange={(e) => set('leagueName', e.target.value)}
            />
          </div>

          <div className="field-group">
            <label>Competition Mode</label>
            <div className="segment-group">
              <button
                className={`segment ${s.mode === 'round_robin' ? 'active' : ''}`}
                onClick={() => set('mode', 'round_robin')}
              >
                Round Robin
              </button>
              <button
                className={`segment ${s.mode === 'ladder' ? 'active' : ''}`}
                onClick={() => set('mode', 'ladder')}
              >
                Ladder
              </button>
            </div>
            <div className="field-hint">
              {isLadder
                ? 'Players are ranked and may challenge eligible players above them.'
                : 'Everyone plays a scheduled set of opponents.'}
            </div>
          </div>
        </div>

        {/* ── Section 2: Match format ── */}
        <div className="wizard-section">
          <div className="wizard-section-title">Match Format</div>

          <div className="grid-2">
            <div className="field-group">
              <label>Singles / Doubles</label>
              <div className="segment-group">
                {['singles', 'doubles'].map((v) => (
                  <button
                    key={v}
                    className={`segment ${s.singlesOrDoubles === v ? 'active' : ''}`}
                    onClick={() => set('singlesOrDoubles', v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group">
              <label>{sport.formatLabel}</label>
              <select
                value={s.format}
                onChange={(e) => set('format', e.target.value)}
              >
                {sport.formatOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isTennis && (
            <>
              <div className="grid-2">
                <div className="field-group">
                  <label>Games per set</label>
                  <select
                    value={s.gamesPerSet}
                    onChange={(e) => set('gamesPerSet', Number(e.target.value))}
                  >
                    {GAMES_PER_SET.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label>Tiebreak format</label>
                  <select
                    value={s.tiebreakFormat}
                    onChange={(e) => set('tiebreakFormat', e.target.value)}
                  >
                    {TIEBREAK_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isMultiSet && (
                <div className="field-group">
                  <label>Deciding set format</label>
                  <div className="segment-group">
                    {DECIDING_OPTS.map((o) => (
                      <button
                        key={o.value}
                        className={`segment ${s.thirdSetFormat === o.value ? 'active' : ''}`}
                        onClick={() => set('thirdSetFormat', o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="field-hint">
                    ↳ Applied to set {s.format === 'best_of_3' ? '3' : '5'} only
                  </div>
                </div>
              )}

              <div className="toggle-row">
                <div>
                  <div className="toggle-label">No-Ad scoring</div>
                  <div className="toggle-sub">
                    Deuce points decided by one point — speeds up play
                  </div>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={s.noAd}
                    onChange={(e) => set('noAd', e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>
            </>
          )}

          {isPickleball && (
            <div className="field-group">
              <label>Points to win a game</label>
              <div className="segment-group">
                {PB_POINTS.map((o) => (
                  <button
                    key={o.value}
                    className={`segment ${s.pickleballPoints === o.value ? 'active' : ''}`}
                    onClick={() => set('pickleballPoints', o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Section 3: League rules ── */}
        <div className="wizard-section">
          <div className="wizard-section-title">League Rules</div>

          <div className="grid-2">
            <div className="field-group">
              <label>Match time limit</label>
              <select
                value={s.scoringTime}
                onChange={(e) => set('scoringTime', e.target.value)}
              >
                {TIME_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label>Number of rounds</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={2}
                  max={16}
                  value={s.rounds}
                  onChange={(e) => set('rounds', Number(e.target.value))}
                />
                <div className="slider-val">{s.rounds}</div>
              </div>
            </div>
          </div>

          {isLadder && (
            <div className="field-group">
              <label>Challenge window (spots above)</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={s.challengeSpots}
                  onChange={(e) => set('challengeSpots', Number(e.target.value))}
                />
                <div className="slider-val">{s.challengeSpots}</div>
              </div>
            </div>
          )}

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Auto-advance rounds</div>
              <div className="toggle-sub">
                Automatically generate the next round when all matches are
                complete
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.autoAdvance}
                onChange={(e) => set('autoAdvance', e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>
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
          onClick={() => onNext?.(s)}
        >
          Continue to Players →
        </button>
      </div>
    </div>
  );
}

export default LeagueSetupStep1;
