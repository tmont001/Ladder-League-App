import React, { useState } from 'react';
import Portal from '../shared/Portal';

const FORMAT_LABELS = {
  best_of_1: 'Best of 1',
  best_of_3: 'Best of 3',
  best_of_5: 'Best of 5',
};
const GAMES_OPTS = [
  { value: 4, label: '4 games' },
  { value: 6, label: '6 games (standard)' },
  { value: 8, label: '8 games' },
];
const TIEBREAK_OPTS = [
  { value: 'standard', label: 'Standard (to 7)' },
  { value: 'no_tiebreak', label: 'No tiebreak' },
  { value: 'match_tiebreak', label: 'Match tiebreak (to 10)' },
];
const DECIDING_OPTS = [
  { value: 'full_set', label: 'Full set' },
  { value: 'super_tiebreak', label: 'Super tiebreak (to 10)' },
  { value: 'match_tiebreak', label: 'Match tiebreak (to 10)' },
];
const PB_POINTS = [
  { value: 11, label: '11 pts' },
  { value: 15, label: '15 pts' },
  { value: 21, label: '21 pts' },
];
const TIME_OPTS = [
  { value: 'untimed', label: 'Untimed' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
];
const FORMAT_OPTS = [
  { value: 'best_of_1', label: 'Best of 1' },
  { value: 'best_of_3', label: 'Best of 3' },
  { value: 'best_of_5', label: 'Best of 5' },
];
const CHALLENGE_OPTS = [
  { value: 1, label: '1 spot' },
  { value: 2, label: '2 spots' },
  { value: 3, label: '3 spots' },
  { value: 4, label: '4 spots' },
  { value: 5, label: '5 spots' },
];

function SettingsRow({ label, sub, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsModal({ settings, onSave, onClose }) {
  const [s, setS] = useState({ ...settings });
  const set = (key, val) => setS((p) => ({ ...p, [key]: val }));
  const isTennis = s.sport === 'tennis';
  const isPickleball = s.sport === 'pickleball';
  const isMultiSet = s.format === 'best_of_3' || s.format === 'best_of_5';

  const handleSave = () => {
    onSave(s);
    onClose();
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal modal-lg"
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: '90vh', overflow: 'auto' }}
        >
          <div className="modal-header">
            <div className="modal-title">League Settings</div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            {/* League info */}
            <div className="settings-section">
              <div className="settings-section-title">League</div>
              <div className="field-group">
                <label>League Name</label>
                <input
                  type="text"
                  value={s.leagueName}
                  onChange={(e) => set('leagueName', e.target.value)}
                />
              </div>
            </div>

            {/* Match format */}
            <div className="settings-section">
              <div className="settings-section-title">Match Format</div>

              <SettingsRow label="Sets / Games format">
                <select
                  value={s.format}
                  onChange={(e) => set('format', e.target.value)}
                >
                  {FORMAT_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>

              {isTennis && (
                <>
                  <SettingsRow
                    label="Games per set"
                    sub="Change the length of each set"
                  >
                    <select
                      value={s.gamesPerSet || 6}
                      onChange={(e) =>
                        set('gamesPerSet', Number(e.target.value))
                      }
                    >
                      {GAMES_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>

                  <SettingsRow label="Tiebreak format">
                    <select
                      value={s.tiebreakFormat || 'standard'}
                      onChange={(e) => set('tiebreakFormat', e.target.value)}
                    >
                      {TIEBREAK_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>

                  {isMultiSet && (
                    <SettingsRow label="Deciding set format">
                      <select
                        value={s.thirdSetFormat || 'super_tiebreak'}
                        onChange={(e) => set('thirdSetFormat', e.target.value)}
                      >
                        {DECIDING_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </SettingsRow>
                  )}

                  <SettingsRow
                    label="No-Ad scoring"
                    sub="Deuce points decided by one point"
                  >
                    <label
                      className="toggle"
                      style={{ display: 'inline-block' }}
                    >
                      <input
                        type="checkbox"
                        checked={s.noAd || false}
                        onChange={(e) => set('noAd', e.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </SettingsRow>
                </>
              )}

              {isPickleball && (
                <SettingsRow label="Points to win a game">
                  <select
                    value={s.pickleballPoints || 11}
                    onChange={(e) =>
                      set('pickleballPoints', Number(e.target.value))
                    }
                  >
                    {PB_POINTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
              )}

              <SettingsRow label="Match time limit">
                <select
                  value={s.scoringTime || 'untimed'}
                  onChange={(e) => set('scoringTime', e.target.value)}
                >
                  {TIME_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>
            </div>

            {/* League rules */}
            <div className="settings-section">
              <div className="settings-section-title">League Rules</div>

              <SettingsRow
                label="Challenge window"
                sub="How many spots above a player can be challenged"
              >
                <select
                  value={s.challengeSpots || 2}
                  onChange={(e) =>
                    set('challengeSpots', Number(e.target.value))
                  }
                >
                  {CHALLENGE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>

              <SettingsRow
                label="Auto-advance rounds"
                sub="Generate next round when all matches are done"
              >
                <label className="toggle" style={{ display: 'inline-block' }}>
                  <input
                    type="checkbox"
                    checked={s.autoAdvance !== false}
                    onChange={(e) => set('autoAdvance', e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </SettingsRow>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-back" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-next" onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default SettingsModal;
