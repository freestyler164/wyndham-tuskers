import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ActionModal, UserAvatar } from '../shared/ui.jsx';
import { relativeTime } from './relativeTime.js';

export function LikersSheet({ teamId, post, onClose }) {
  const [likers, setLikers] = useState(post.likedBy || null);
  const [error, setError] = useState('');

  // Cards only carry the top few likers, so the full list needs the detail call.
  useEffect(() => {
    if (likers) return;
    let cancelled = false;
    api(`/v1/teams/${teamId}/appreciation/${post.postId}`)
      .then((data) => { if (!cancelled) setLikers(data.post?.likedBy || []); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [teamId, post.postId]);

  const likeCount = post.reactionSummary?.likeCount || 0;
  const title = `Liked by ${likeCount} ${likeCount === 1 ? 'person' : 'people'}`;

  return (
    <ActionModal title={title} onClose={onClose}>
      {/* ActionModal only uses `title` as an aria-label and adds no padding of
          its own, so the body has to supply both. */}
      <div className="expense-form likers-sheet">
        <div className="section-heading"><h2>{title}</h2></div>
        {error && <p className="error">{error}</p>}
        {!likers && !error && <p className="muted">Loading…</p>}
        {likers?.length === 0 && <p className="muted">No likes yet.</p>}
        {likers?.map((liker) => (
          <div className="liker-row" key={liker.userId}>
            <UserAvatar className="small" initials={liker.initials || 'MT'} photoUrl={liker.photoUrl || ''} />
            <strong>{liker.displayName}</strong>
            <span>{relativeTime(liker.likedAt)}</span>
          </div>
        ))}
      </div>
    </ActionModal>
  );
}
