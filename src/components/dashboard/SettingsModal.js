import React, { useState } from 'react';
import Portal from '../shared/Portal';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

const FORMAT_OPTS = [
  { value: 'best_of_1', label: 'Best of 1' },
  { value: 'best_of_3', label: 'Best of 3' },
  { value: 'best_of_5', label: 'Best of 5' },
];
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
  { value: 11, label: '11 pts (standard)' },
  { value: 15, label: '15 pts' },
  { value: 21, label: '21 pts' },
];
const TIME_OPTS = [
  { value: 'untimed', label: 'Untimed' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
];
const CHALLENGE_OPTS = [
  { value: 1, label: '1 spot' },
  { value: 2, label: '2 spots' },
  { value: 3, label: '3 spots' },
  { value: 4, label: '4 spots' },
  { value: 5, label: '5 spots' },
];

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      <label className="toggle" style={{ display: 'inline-block' }}>
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

function SelectRow({ label, sub, value, onChange, options }) {
  return (
    <div className="settings-row">
      <div className="settings-row-left">
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsModal({ settings, onSave, onClose, saving = false, saveError = null }) {
  const [s, setS] = useState({ ...settings });
  const set = (key, val) => setS((p) => ({ ...p, [key]: val }));
  const isTennis = s.sport === 'tennis';
  const isPickleball = s.sport === 'pickleball';
  const isMultiSet = s.format === 'best_of_3' || s.format === 'best_of_5';
  const dialogRef = useAccessibleDialog(true, onClose, { disableEscape: saving });

  return (
    <Portal>
      <div className="modal-overlay" onClick={!saving ? onClose : undefined}>
        <div
          className="modal modal-lg"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div className="modal-header">
            <div className="modal-title" id="settings-modal-title">League Settings</div>
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

              <SelectRow
                label="Sets / Games"
                value={s.format}
                onChange={(v) => set('format', v)}
                options={FORMAT_OPTS}
              />

              {isTennis && (
                <>
                  <SelectRow
                    label="Games per set"
                    sub="Length of each set"
                    value={s.gamesPerSet || 6}
                    onChange={(v) => set('gamesPerSet', Number(v))}
                    options={GAMES_OPTS}
                  />
                  <SelectRow
                    label="Tiebreak format"
                    value={s.tiebreakFormat || 'standard'}
                    onChange={(v) => set('tiebreakFormat', v)}
                    options={TIEBREAK_OPTS}
                  />
                  {isMultiSet && (
                    <SelectRow
                      label="Deciding set format"
                      value={s.thirdSetFormat || 'super_tiebreak'}
                      onChange={(v) => set('thirdSetFormat', v)}
                      options={DECIDING_OPTS}
                    />
                  )}
                  <ToggleRow
                    label="No-Ad scoring"
                    sub="Deuce decided by one point — speeds up play"
                    checked={s.noAd || false}
                    onChange={(v) => set('noAd', v)}
                  />
                </>
              )}

              {isPickleball && (
                <SelectRow
                  label="Points to win a game"
                  value={s.pickleballPoints || 11}
                  onChange={(v) => set('pickleballPoints', Number(v))}
                  options={PB_POINTS}
                />
              )}

              <SelectRow
                label="Match time limit"
                value={s.scoringTime || 'untimed'}
                onChange={(v) => set('scoringTime', v)}
                options={TIME_OPTS}
              />
            </div>

            {/* League rules */}
            <div className="settings-section">
              <div className="settings-section-title">League Rules</div>

              <ToggleRow
                label="Enable challenges"
                sub="Allow players to challenge opponents within the challenge window"
                checked={s.challengesEnabled !== false}
                onChange={(v) => set('challengesEnabled', v)}
              />

              {s.challengesEnabled !== false && (
                <SelectRow
                  label="Challenge window"
                  sub="How many spots above a player can challenge"
                  value={s.challengeSpots || 2}
                  onChange={(v) => set('challengeSpots', Number(v))}
                  options={CHALLENGE_OPTS}
                />
              )}

              <ToggleRow
                label="Auto-advance rounds"
                sub="Generate next round when all matches are done"
                checked={s.autoAdvance !== false}
                onChange={(v) => set('autoAdvance', v)}
              />
            </div>
          </div>

          <div className="modal-footer">
            {saveError && (
              <div
                className="picker-error"
                role="alert"
                style={{ marginRight: 'auto', maxWidth: '60%' }}
              >
                {saveError}
              </div>
            )}
            <button className="btn-back" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn-next"
              onClick={() => onSave(s)}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default SettingsModal;
