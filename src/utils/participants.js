// Shared small helpers for participants
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function getParticipantName(p, isDoubles) {
  if (!p) return 'BYE';
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}
