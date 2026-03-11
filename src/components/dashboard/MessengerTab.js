import React, { useState, useRef, useEffect } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
function fmtTime(d) {
  const now = new Date(),
    diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const LEAGUE_THREAD_ID = '__league__';

function MessengerTab() {
  const { participants } = useLeague();
  const { currentPlayer, isAdmin } = usePlayerIdentity();

  // threads: { id, name, isLeague, messages: [{id,senderId,senderName,text,timestamp,type,event}] }
  const [threads, setThreads] = useState(() => {
    const initial = [
      {
        id: LEAGUE_THREAD_ID,
        name: '🏆 League Chat',
        isLeague: true,
        messages: [
          {
            id: generateId(),
            senderId: '__system__',
            senderName: 'System',
            text: 'Welcome to the league chat! Use this to coordinate matches, share results, and celebrate wins 🎾',
            timestamp: new Date(Date.now() - 3600000),
            type: 'text',
          },
        ],
      },
    ];
    // Add direct threads between current player and each other player
    return initial;
  });

  const [activeThreadId, setActiveThreadId] = useState(LEAGUE_THREAD_ID);
  const [msgText, setMsgText] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: 'Match Proposal',
    date: '',
    time: '',
    location: '',
    note: '',
  });
  const messagesEndRef = useRef(null);

  // Ensure DM threads exist for all participants
  useEffect(() => {
    if (!currentPlayer || !participants.length) return;
    setThreads((prev) => {
      const existing = new Set(prev.map((t) => t.id));
      const newThreads = participants
        .filter((p) => p.id !== currentPlayer.id)
        .map((p) => ({
          id: `dm_${[currentPlayer.id, p.id].sort().join('_')}`,
          name: p.name,
          isLeague: false,
          participantId: p.id,
          messages: [],
        }))
        .filter((t) => !existing.has(t.id));
      return newThreads.length ? [...prev, ...newThreads] : prev;
    });
  }, [participants, currentPlayer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThreadId, threads]);

  const activeThread =
    threads.find((t) => t.id === activeThreadId) || threads[0];

  const sendMessage = () => {
    if (!msgText.trim() || !currentPlayer) return;
    const msg = {
      id: generateId(),
      senderId: currentPlayer.id,
      senderName: currentPlayer.name,
      text: msgText.trim(),
      timestamp: new Date(),
      type: 'text',
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId ? { ...t, messages: [...t.messages, msg] } : t,
      ),
    );
    setMsgText('');
  };

  const sendEvent = () => {
    if (!eventForm.date || !currentPlayer) return;
    const msg = {
      id: generateId(),
      senderId: currentPlayer.id,
      senderName: currentPlayer.name,
      text: '',
      timestamp: new Date(),
      type: 'event',
      event: { ...eventForm, id: generateId(), status: 'pending' },
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId ? { ...t, messages: [...t.messages, msg] } : t,
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

  const respondToEvent = (msgId, response) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== activeThreadId) return t;
        return {
          ...t,
          messages: t.messages.map((m) => {
            if (m.id !== msgId || m.type !== 'event') return m;
            return {
              ...m,
              event: {
                ...m.event,
                status: response,
                respondedBy: currentPlayer?.name,
              },
            };
          }),
        };
      }),
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isSelf = (msg) => msg.senderId === currentPlayer?.id;
  const isSystem = (msg) => msg.senderId === '__system__';

  // Compute unread count per thread (simplified: 0 for now)
  const getPreview = (t) => {
    const last = t.messages[t.messages.length - 1];
    if (!last) return 'No messages yet';
    if (last.type === 'event')
      return `📅 ${last.event?.title || 'Match proposal'}`;
    return last.text.slice(0, 40) + (last.text.length > 40 ? '…' : '');
  };

  return (
    <div className="messenger-layout">
      {/* Sidebar */}
      <div className="messenger-sidebar">
        <div className="messenger-sidebar-header">Chats</div>
        <div className="messenger-thread-list">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`messenger-thread ${thread.id === activeThreadId ? 'active' : ''}`}
              onClick={() => setActiveThreadId(thread.id)}
            >
              <div className="messenger-thread-row">
                <div className="messenger-thread-meta">
                  <div className="messenger-thread-name">{thread.name}</div>
                  <div className="messenger-thread-preview">
                    {getPreview(thread)}
                  </div>
                </div>
                {thread.messages.length > 0 && (
                  <div className="messenger-thread-time">
                    {fmtTime(
                      thread.messages[thread.messages.length - 1].timestamp,
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="messenger-main">
        {activeThread ? (
          <>
            <div className="messenger-chat-header">
              <div className="messenger-chat-name">{activeThread.name}</div>
              {activeThread.isLeague && (
                <span className="messenger-chat-sub">
                  {participants.length} players
                </span>
              )}
            </div>

            <div className="messenger-messages">
              {activeThread.messages.map((msg) => {
                if (isSystem(msg))
                  return (
                    <div
                      key={msg.id}
                      style={{
                        textAlign: 'center',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                        padding: '0.5rem',
                        background: 'var(--surface-hi)',
                        borderRadius: '2px',
                        border: '1px solid var(--border)',
                      }}
                    >
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
                              <div>
                                📆{' '}
                                {fmtDateTime(
                                  `${ev.date}T${ev.time || '00:00'}`,
                                )}
                              </div>
                            )}
                            {ev.location && <div>📍 {ev.location}</div>}
                            {ev.note && (
                              <div
                                style={{
                                  marginTop: '4px',
                                  fontStyle: 'italic',
                                }}
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

            <div className="messenger-input-area">
              {/* Event form */}
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
                        placeholder="Match Proposal"
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
                      placeholder="e.g. Bring balls, 1 hour match"
                    />
                  </div>
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
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
                      onClick={sendEvent}
                      disabled={!eventForm.date}
                    >
                      Send Proposal
                    </button>
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="messenger-toolbar">
                <button
                  className={`messenger-toolbar-btn ${showEventForm ? 'active' : ''}`}
                  onClick={() => setShowEventForm((v) => !v)}
                >
                  📅 Match Proposal
                </button>
              </div>

              {/* Compose row */}
              <div className="messenger-compose">
                <textarea
                  className="messenger-textarea"
                  placeholder={`Message ${activeThread.isLeague ? 'the league' : activeThread.name}…`}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="messenger-send"
                  disabled={!msgText.trim()}
                  onClick={sendMessage}
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
