import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react';
import { UserAvatar } from '../shared/ui.jsx';
import { FeedCommentForm } from './FeedCommentForm.jsx';
import { FeedMedia } from './FeedMedia.jsx';
import { renderMentionedText } from './mentions.jsx';
import { relativeTime } from './relativeTime.js';

function LikerStack({ likers, onOpen }) {
  if (!likers?.length) return null;
  return (
    <button className="feed-liker-stack" type="button" onClick={onOpen} aria-label="See who liked this">
      {likers.map((liker) => (
        <UserAvatar key={liker.userId} className="tiny" initials={liker.initials || 'MT'} photoUrl={liker.photoUrl || ''} />
      ))}
    </button>
  );
}

export function FeedPostCard({ post, canDelete, onOpen, onLike, onComment, onDelete, onShowLikers }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const latestComment = post.latestComment || post.comments?.[post.comments.length - 1] || null;
  const likeCount = post.reactionSummary?.likeCount || 0;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <article className="feed-post-card">
      <div className="feed-author-rail">
        <UserAvatar className="small" initials={post.authorInitials || 'MT'} photoUrl={post.authorPhotoUrl || ''} />
      </div>
      <div className="feed-post-author">
        <strong>{post.authorDisplayName}</strong>
        <span>· {relativeTime(post.createdAt)}</span>
        {canDelete && (
          <div className="match-menu-wrap" ref={menuRef}>
            <button
              className="match-menu-button"
              type="button"
              aria-label="Post actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal aria-hidden="true" size={18} />
            </button>
            {menuOpen && (
              <div className="match-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(post); }}>
                  Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="feed-post-bubble">
        <button className="feed-post-main" type="button" onClick={onOpen}>
          <h2>{post.shortDescription || post.message}</h2>
          {post.longDescription && <p>{renderMentionedText(post.longDescription)}</p>}
        </button>
        <FeedMedia media={post.media} onClick={onOpen} />
        <div className="feed-actions">
          <button className={post.reactionSummary?.likedByMe ? 'is-liked' : ''} type="button" onClick={onLike}>
            <Heart aria-hidden="true" size={18} fill={post.reactionSummary?.likedByMe ? 'currentColor' : 'none'} />
            <span>{likeCount}</span>
          </button>
          <button type="button" onClick={onOpen}>
            <MessageCircle aria-hidden="true" size={18} />
            <span>{post.commentCount || 0}</span>
          </button>
          <LikerStack likers={post.reactionSummary?.topLikers} onOpen={() => onShowLikers(post)} />
        </div>
        {latestComment && (
          <button className="feed-comment-preview" type="button" onClick={onOpen}>
            <UserAvatar className="tiny" initials={latestComment.authorInitials || 'MT'} photoUrl={latestComment.authorPhotoUrl || ''} />
            <strong>{latestComment.authorDisplayName}</strong>
            <span>{renderMentionedText(latestComment.message)}</span>
          </button>
        )}
        {post.commentCount > 1 && (
          <button className="feed-view-all" type="button" onClick={onOpen}>
            View all {post.commentCount} comments
          </button>
        )}
        <FeedCommentForm postId={post.postId} onSubmit={onComment} />
      </div>
    </article>
  );
}
