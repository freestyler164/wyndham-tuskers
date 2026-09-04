import React, { useState } from 'react';
import { api } from '../api.js';

// Tapping a player steps through the captain's own marks and back to unmarked,
// so a whole squad can be worked through without opening a menu each time.
const CYCLE = ['NOT_MARKED', 'AVAILABLE', 'MAYBE', 'UNAVAILABLE'];

// The shared statusLabel map is written in the first person ("You're in"),
// which does not read correctly in a list about other players.
const ROSTER_LABEL = {
  AVAILABLE: 'Available',
  MAYBE: 'Maybe',
  UNAVAILABLE: 'Unavailable',
  NO_RESPONSE: 'No response',
  NOT_MARKED: 'Not marked',
};

export const captainStatusLabel = (status) => ROSTER_LABEL[status] || ROSTER_LABEL.NOT_MARKED;

export function CaptainAvailabilityList({ activeTeamId, matchId, rows, onChanged }) {
  const [savingUserId, setSavingUserId] = useState('');
  const [error, setError] = useState('');

  const cycle = async (row) => {
    const next = CYCLE[(CYCLE.indexOf(row.captainStatus || 'NOT_MARKED') + 1) % CYCLE.length];
    setSavingUserId(row.userId);
    setError('');
    try {
      const path = `/v1/teams/${activeTeamId}/matches/${matchId}/captain-availability/${row.userId}`;
      if (next === 'NOT_MARKED') await api(path, { method: 'DELETE' });
      else await api(path, { method: 'PUT', body: JSON.stringify({ status: next }) });
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUserId('');
    }
  };

  return (
    <div className="captain-availability-list">
      {error && <p className="error">{error}</p>}
      <div className="captain-availability-head">
        <span>Player</span>
        <span>Player said</span>
        <span>Captain</span>
      </div>
      {rows.map((row) => (
        <button
          key={row.userId}
          type="button"
          className="captain-availability-row"
          disabled={savingUserId === row.userId}
          onClick={() => cycle(row)}
        >
          <strong>{row.user?.preferredName || row.user?.displayName || row.userId}</strong>
          <span className={`availability-chip status-${row.status.toLowerCase()}`}>
            {ROSTER_LABEL[row.status] || ROSTER_LABEL.NO_RESPONSE}
          </span>
          <span className={`availability-chip captain status-${(row.captainStatus || 'NOT_MARKED').toLowerCase()}`}>
            {captainStatusLabel(row.captainStatus)}
          </span>
        </button>
      ))}
      {!rows.length && <p className="muted">No active players in this team.</p>}
    </div>
  );
}
