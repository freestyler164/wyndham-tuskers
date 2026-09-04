import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, MessageCircle, Trash2 } from 'lucide-react';
import { api, formatDate } from '../api.js';
import { useSession } from '../shared/session.jsx';
import { BackHeader, SkeletonCards, UserAvatar } from '../shared/ui.jsx';
import { FeedCommentForm } from './FeedCommentForm.jsx';
import { FeedMedia } from './FeedMedia.jsx';
import { LikersSheet } from './LikersSheet.jsx';
import { renderMentionedText } from './mentions.jsx';
import { relativeTime } from './relativeTime.js';

const isTeamManager = (role) => ['CAPTAIN', 'TEAM_ADMIN', 'GLOBAL_ADMIN'].includes(role);

export function FeedPostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const { activeTeamId, activeTeam } = session;
  const [post, setPost] = useState(null);
  const [likersOpen, setLikersOpen] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api(`/v1/teams/${activeTeamId}/appreciation/${postId}`);
    setPost(data.post);
  };

  useEffect(() => {
    if (!activeTeamId) return;
    setError('');
    load().catch((err) => setError(err.message));
  }, [activeTeamId, postId]);

  const toggleLike = async () => {
    const liked = post.reactionSummary?.likedByMe;
    try {
      await api(`/v1/teams/${activeTeamId}/appreciation/${postId}/like`, { method: liked ? 'DELETE' : 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addComment = async (targetPostId, message) => {
    await api(`/v1/teams/${activeTeamId}/appreciation/${targetPostId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    await load();
  };

  const remove = async () => {
    if (!window.confirm('Delete this post? Comments and likes go with it.')) return;
    try {
      await api(`/v1/teams/${activeTeamId}/appreciation/${postId}`, { method: 'DELETE' });
      navigate('/feed', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  const canDelete = post && (post.authorUserId === session.user?.userId || isTeamManager(activeTeam?.membership?.role));

  return (
    <>
      <BackHeader title="Post" />
      <section className="stack feed-detail">
        {error && <p className="error">{error}</p>}
        {!post && !error && <SkeletonCards />}
        {post && (
          <article className="feed-detail-card">
            <div className="feed-detail-head">
              <UserAvatar className="small" initials={post.authorInitials || 'MT'} photoUrl={post.authorPhotoUrl || ''} />
              <div>
                <strong>{post.authorDisplayName}</strong>
                <span>{formatDate(post.createdAt, { time: true })}</span>
              </div>
              {canDelete && (
                <button className="feed-detail-delete" type="button" onClick={remove} aria-label="Delete post">
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              )}
            </div>
            <h1>{post.shortDescription || post.message}</h1>
            {post.longDescription && <p className="feed-detail-body">{renderMentionedText(post.longDescription)}</p>}
            <FeedMedia media={post.media} />
            <div className="feed-actions">
              <button className={post.reactionSummary?.likedByMe ? 'is-liked' : ''} type="button" onClick={toggleLike}>
                <Heart aria-hidden="true" size={18} fill={post.reactionSummary?.likedByMe ? 'currentColor' : 'none'} />
                <span>{post.reactionSummary?.likeCount || 0}</span>
              </button>
              <span className="feed-action-static">
                <MessageCircle aria-hidden="true" size={18} />
                <span>{post.commentCount || 0}</span>
              </span>
            </div>
            {post.likedBy?.length > 0 && (
              <button className="feed-liked-by" type="button" onClick={() => setLikersOpen(true)}>
                Liked by {post.likedBy[0].displayName}
                {post.likedBy.length > 1 && ` and ${post.likedBy.length - 1} other${post.likedBy.length > 2 ? 's' : ''}`}
              </button>
            )}
            <div className="feed-comments-panel">
              {post.comments?.length === 0 && <p className="muted">No comments yet. Start the conversation.</p>}
              {post.comments?.map((comment) => (
                <div className="feed-comment" key={comment.commentId}>
                  <UserAvatar className="tiny" initials={comment.authorInitials || 'MT'} photoUrl={comment.authorPhotoUrl || ''} />
                  <div>
                    <p className="feed-comment-byline">
                      <strong>{comment.authorDisplayName}</strong>
                      <em>{relativeTime(comment.createdAt)}</em>
                    </p>
                    <span>{renderMentionedText(comment.message)}</span>
                  </div>
                </div>
              ))}
            </div>
            <FeedCommentForm postId={post.postId} onSubmit={addComment} />
          </article>
        )}
      </section>
      {likersOpen && post && (
        <LikersSheet teamId={activeTeamId} post={post} onClose={() => setLikersOpen(false)} />
      )}
    </>
  );
}
