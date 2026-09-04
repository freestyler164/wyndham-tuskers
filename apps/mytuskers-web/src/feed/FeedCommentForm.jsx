import React, { useState } from 'react';
import { Send } from 'lucide-react';

export function FeedCommentForm({ postId, onSubmit }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setError('');
    setSaving(true);
    try {
      await onSubmit(postId, trimmed);
      setMessage('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <form className="feed-comment-form" onSubmit={submit}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Write a comment" />
        <button type="submit" disabled={saving || !message.trim()} aria-label="Post comment">
          <Send aria-hidden="true" size={16} />
        </button>
      </form>
      {error && <p className="error compact-error">{error}</p>}
    </>
  );
}
