import React, { useState, useRef, useEffect } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';

function genId() {
  return Math.random().toString(36).substr(2, 9);
}

function fmtTime(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(d).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}

function fmtEventDate(date, time) {
  if (!date) return '';
  const iso = time ? `${date}T${time}` : date;
  return new Date(iso).toLocaleString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const LEAGUE_THREAD = {
  id: '__league__',
  name: '🏆 League Chat',
  isLeague: true,
};

function MessengerTab() {
  const { participants, addScheduledMatch } = useLeague();
  const { currentPlayer } = usePlayerIdentity();

  // threads stored as { id, name, isLeague, participantIds[], messages[] }
  const [threads, setThreads] = useState([
    {
      ...LEAGUE_THREAD,
      participantIds: [],
      messages: [
        {
          id: genId(),
          senderId: '__system__',
          senderName: 'System',
          text: 'Welcome to League Chat! Use this to coordinate matches and share news 🎾',
          timestamp: new Date(Date.now() - 3600000),
          type: 'text',
        },
      ],
    },
  ]);
  const [activeId, setActiveId] = useState('__league__');
  const [msgText, setMsgText] = useState('');
  const [showNewDM, setShowNewDM] = useState(false);
  const [newDMSearch, setNewDMSearch] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: 'Match Proposal',
    date: '',
    time: '',
    location: '',
    note: '',
  });
  const [scheduleError, setScheduleError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, threads]);

  const active = threads.find((t) => t.id === activeId) || threads[0];

  // ── Create / open DM ────────────────────────────────────────
  const openDM = (participant) => {
    const dmId = `dm_${[currentPlayer?.id, participant.id].sort().join('_')}`;
    const exists = threads.find((t) => t.id === dmId);
    if (!exists) {
      setThreads((prev) => [
        ...prev,
        {
          id: dmId,
          name: participant.name,
          isLeague: false,
          participantIds: [currentPlayer?.id, participant.id],
          messages: [],
        },
      ]);
    }
    setActiveId(dmId);
    setShowNewDM(false);
    setNewDMSearch('');
  };

  // ── Send text ────────────────────────────────────────────────
  const sendText = () => {
    if (!msgText.trim() || !currentPlayer) return;
    const msg = {
      id: genId(),
      senderId: currentPlayer.id,
      senderName: currentPlayer.name,
      text: msgText.trim(),
      timestamp: new Date(),
      type: 'text',
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId ? { ...t, messages: [...t.messages, msg] } : t,
      ),
    );
    setMsgText('');
  };

  // ── Send event proposal ──────────────────────────────────────
  const sendEvent = async () => {
    if (!eventForm.date || !currentPlayer) return;
    setScheduleError('');

    // Figure out the other participant for a DM (for schedule integration)
    const otherParticipantId = active.isLeague
      ? null
      : active.participantIds?.find((id) => id !== currentPlayer.id);

    const msg = {
      id: genId(),
      senderId: currentPlayer.id,
      senderName: currentPlayer.name,
      text: '',
      timestamp: new Date(),
      type: 'event',
      event: {
        id: genId(),
        ...eventForm,
        status: 'pending',
        p1Id: currentPlayer.id,
        p2Id: otherParticipantId || null,
      },
    };

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId ? { ...t, messages: [...t.messages, msg] } : t,
      ),
    );
    setEventForm({
      title: 'Match Proposal',
      date: '',
      time: '',
      location: '',
      note: '',
    });
    setShowEventForm(false);
  };

  // ── Respond to event (accept / decline) ──────────────────────
  const respondToEvent = async (msgId, response) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        return {
          ...t,
          messages: t.messages.map((m) => {
            if (m.id !== msgId || m.type !== 'event') return m;
            const updated = {
              ...m,
              event: {
                ...m.event,
                status: response,
                respondedBy: currentPlayer?.name,
              },
            };
            // On accept: add to schedule
            if (response === 'accepted' && addScheduledMatch) {
              const p1 =
                participants.find((p) => p.id === m.event.p1Id) || null;
              const p2 =
                participants.find((p) => p.id === m.event.p2Id) || null;
              if (p1 && p2) {
                const dateStr =
                  m.event.date && m.event.time
                    ? `${m.event.date}T${m.event.time}`
                    : m.event.date;
                addScheduledMatch(p1, p2, dateStr);
              }
            }
            return updated;
          }),
        };
      }),
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const isSelf = (msg) => msg.senderId === currentPlayer?.id;
  const isSystem = (msg) => msg.senderId === '__system__';

  const preview = (t) => {
    const last = t.messages[t.messages.length - 1];
    if (!last) return 'No messages yet';
    if (last.type === 'event')
      return `📅 ${last.event?.title || 'Match proposal'}`;
    return last.text.slice(0, 38) + (last.text.length > 38 ? '…' : '');
  };

  // DM-searchable participants (exclude self)
  const dmCandidates = participants.filter(
    (p) =>
      p.id !== currentPlayer?.id &&
      p.name.toLowerCase().includes(newDMSearch.toLowerCase()),
  );

  return (
    <div className="messenger-layout">
      {/* ── Sidebar ── */}
      <div className="messenger-sidebar">
        <div className="messenger-sidebar-header">
          <span>Chats</span>
          <button
            className="messenger-new-dm-btn"
            onClick={() => setShowNewDM((v) => !v)}
            title="New message"
          >
            ＋
          </button>
        </div>

        {/* New DM picker */}
        {showNewDM && (
          <div className="messenger-dm-picker">
            <input
              className="messenger-dm-search"
              type="text"
              placeholder="Search players…"
              value={newDMSearch}
              onChange={(e) => setNewDMSearch(e.target.value)}
              autoFocus
            />
            <div className="messenger-dm-list">
              {dmCandidates.length === 0 ? (
                <div className="messenger-dm-empty">No players found</div>
              ) : (
                dmCandidates.map((p) => (
                  <button
                    key={p.id}
                    className="messenger-dm-item"
                    onClick={() => openDM(p)}
                  >
                    <div
                      className="msg-avatar"
                      style={{ width: 22, height: 22, fontSize: '0.65rem' }}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="messenger-dm-item-name">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="messenger-thread-list">
          {threads.map((t) => (
            <div
              key={t.id}
              className={`messenger-thread ${t.id === activeId ? 'active' : ''}`}
              onClick={() => {
                setActiveId(t.id);
                setShowNewDM(false);
              }}
            >
              <div className="messenger-thread-row">
                <div className="messenger-thread-meta">
                  <div className="messenger-thread-name">{t.name}</div>
                  <div className="messenger-thread-preview">{preview(t)}</div>
                </div>
                {t.messages.length > 0 && (
                  <div className="messenger-thread-time">
                    {fmtTime(t.messages[t.messages.length - 1].timestamp)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main pane ── */}
      <div className="messenger-main">
        {active ? (
          <>
            <div className="messenger-chat-header">
              <div className="messenger-chat-name">{active.name}</div>
              {active.isLeague && (
                <span className="messenger-chat-sub">
                  {participants.length} players
                </span>
              )}
            </div>

            <div className="messenger-messages">
              {active.messages.map((msg) => {
                if (isSystem(msg))
                  return (
                    <div key={msg.id} className="msg-system">
                      {msg.text}
                    </div>
                  );

                if (msg.type === 'event') {
                  const ev = msg.event;
                  const canRespond = !isSelf(msg) && ev.status === 'pending';
                  return (
                    <div
                      key={msg.id}
                      className={`messenger-msg ${isSelf(msg) ? 'messenger-msg-self' : 'messenger-msg-other'}`}
                    >
                      {!isSelf(msg) && (
                        <div className="msg-avatar">
                          {msg.senderName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="msg-bubble-wrap">
                        {!isSelf(msg) && (
                          <div className="msg-sender">{msg.senderName}</div>
                        )}
                        <div className="msg-event-card">
                          <div className="msg-event-header">
                            <span className="msg-event-icon">📅</span>
                            <span className="msg-event-title">{ev.title}</span>
                          </div>
                          <div className="msg-event-detail">
                            {ev.date && (
                              <div>🗓 {fmtEventDate(ev.date, ev.time)}</div>
                            )}
                            {ev.location && <div>📍 {ev.location}</div>}
                            {ev.note && (
                              <div
                                style={{ marginTop: 4, fontStyle: 'italic' }}
                              >
                                {ev.note}
                              </div>
                            )}
                          </div>
                          <div className="msg-event-actions">
                            {canRespond ? (
                              <>
                                <button
                                  className="msg-event-accept"
                                  onClick={() =>
                                    respondToEvent(msg.id, 'accepted')
                                  }
                                >
                                  ✓ Accept
                                </button>
                                <button
                                  className="msg-event-decline"
                                  onClick={() =>
                                    respondToEvent(msg.id, 'declined')
                                  }
                                >
                                  Decline
                                </button>
                              </>
                            ) : ev.status !== 'pending' ? (
                              <span
                                className={`msg-event-badge ${ev.status === 'accepted' ? 'msg-event-accepted' : 'msg-event-declined'}`}
                              >
                                {ev.status === 'accepted'
                                  ? '✓ Accepted'
                                  : '✕ Declined'}
                                {ev.respondedBy && ` by ${ev.respondedBy}`}
                                {ev.status === 'accepted' &&
                                  ' · Added to Schedule'}
                              </span>
                            ) : (
                              <span className="msg-event-badge msg-event-pending">
                                Awaiting response
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="msg-time">{fmtTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`messenger-msg ${isSelf(msg) ? 'messenger-msg-self' : 'messenger-msg-other'}`}
                  >
                    {!isSelf(msg) && (
                      <div className="msg-avatar">
                        {msg.senderName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="msg-bubble-wrap">
                      {!isSelf(msg) && (
                        <div className="msg-sender">{msg.senderName}</div>
                      )}
                      <div
                        className={`msg-bubble ${isSelf(msg) ? 'msg-bubble-self' : 'msg-bubble-other'}`}
                      >
                        {msg.text}
                      </div>
                      <div className="msg-time">{fmtTime(msg.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input area ── */}
            <div className="messenger-input-area">
              {/* Event proposal form */}
              {showEventForm && (
                <div className="event-form">
                  <div className="event-form-title">
                    📅 Propose a Match Time
                  </div>
                  <div className="event-form-grid">
                    <div className="field-group">
                      <label>Title</label>
                      <input
                        type="text"
                        value={eventForm.title}
                        onChange={(e) =>
                          setEventForm((p) => ({ ...p, title: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label>Location</label>
                      <input
                        type="text"
                        value={eventForm.location}
                        onChange={(e) =>
                          setEventForm((p) => ({
                            ...p,
                            location: e.target.value,
                          }))
                        }
                        placeholder="e.g. Court 3"
                      />
                    </div>
                    <div className="field-group">
                      <label>Date</label>
                      <input
                        type="date"
                        value={eventForm.date}
                        onChange={(e) =>
                          setEventForm((p) => ({ ...p, date: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label>Time</label>
                      <input
                        type="time"
                        value={eventForm.time}
                        onChange={(e) =>
                          setEventForm((p) => ({ ...p, time: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Note (optional)</label>
                    <input
                      type="text"
                      value={eventForm.note}
                      onChange={(e) =>
                        setEventForm((p) => ({ ...p, note: e.target.value }))
                      }
                      placeholder="e.g. 1-hour match, bring yellow balls"
                    />
                  </div>
                  {!active.isLeague &&
                    active.participantIds?.find(
                      (id) => id !== currentPlayer?.id,
                    ) &&
                    (() => {
                      const otherId = active.participantIds.find(
                        (id) => id !== currentPlayer?.id,
                      );
                      const other = participants.find((p) => p.id === otherId);
                      return other ? (
                        <div className="event-form-notice">
                          When accepted, this will add a match between you and{' '}
                          <strong>{other.name}</strong> to the Schedule.
                        </div>
                      ) : null;
                    })()}
                  {scheduleError && (
                    <div className="modal-error">{scheduleError}</div>
                  )}
                  <div className="event-form-actions">
                    <button
                      className="btn-back"
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                      onClick={() => setShowEventForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-outline"
                      style={{ padding: '0.4rem 0.85rem' }}
                      onClick={sendEvent}
                      disabled={!eventForm.date}
                    >
                      Send Proposal
                    </button>
                  </div>
                </div>
              )}

              <div className="messenger-toolbar">
                <button
                  className={`messenger-toolbar-btn ${showEventForm ? 'active' : ''}`}
                  onClick={() => setShowEventForm((v) => !v)}
                >
                  📅 Match Proposal
                </button>
              </div>

              <div className="messenger-compose">
                <textarea
                  className="messenger-textarea"
                  placeholder={`Message ${active.isLeague ? 'the league' : active.name}…`}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="messenger-send"
                  disabled={!msgText.trim()}
                  onClick={sendText}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="messenger-empty">
            <div className="messenger-empty-icon">💬</div>
            <div>Select a conversation</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessengerTab;
