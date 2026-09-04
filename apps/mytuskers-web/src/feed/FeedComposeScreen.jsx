import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { BackHeader } from '../shared/ui.jsx';
import { useSession } from '../shared/session.jsx';
import { AppreciationCreateForm } from './AppreciationComposer.jsx';

export function FeedComposeScreen() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTeamId } = session;
  const title = location.state?.title || 'Post';
  const submitLabel = location.state?.submitLabel || 'Post';
  const returnTo = location.state?.returnTo || '/feed';
  const match = location.state?.match || null;
  const initialValues = location.state?.draft || {};
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeTeamId) {
      setMembers([]);
      return;
    }
    api(`/v1/teams/${activeTeamId}/home`)
      .then((data) => setMembers(data.members || []))
      .catch((err) => setError(err.message));
  }, [activeTeamId]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(returnTo);
  };

  return (
    <>
      <BackHeader title={title} />
      <section className="stack feed-compose-page">
        <p className="muted">
          {match
            ? 'Share the result with the team so everyone can react and comment.'
            : 'Shout out a teammate, share a photo, or start a conversation.'}
        </p>
        {match && (
          <div className="detail-card compact">
            <strong>{match.opponent?.startsWith('Training') ? match.opponent : `vs ${match.opponent}`}</strong>
            <p>{formatDate(match.startAt, { time: true })}</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {!activeTeamId ? (
          <div className="soft-card">
            <h2>Join a team to post</h2>
            <p>Team feed posts need an active team.</p>
          </div>
        ) : (
          <AppreciationCreateForm
            activeTeamId={activeTeamId}
            members={members}
            currentUserId={session.user.userId}
            initialValues={initialValues}
            submitLabel={submitLabel}
            onCancel={goBack}
            onCreated={() => navigate(returnTo, { state: { notice: 'Posted to the team feed.' } })}
          />
        )}
      </section>
    </>
  );
}
