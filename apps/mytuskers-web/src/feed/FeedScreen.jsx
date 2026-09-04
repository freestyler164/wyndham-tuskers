import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { api } from '../api.js';
import { SkeletonCards } from '../shared/ui.jsx';
import { useSession } from '../shared/session.jsx';
import { FeedPostCard } from './FeedPostCard.jsx';
import { LikersSheet } from './LikersSheet.jsx';

const isTeamManager = (role) => ['CAPTAIN', 'TEAM_ADMIN', 'GLOBAL_ADMIN'].includes(role);

export function FeedScreen() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTeamId, activeTeam } = session;
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likersPost, setLikersPost] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');
  const [refreshState, setRefreshState] = useState({ pulling: false, distance: 0, refreshing: false });
  const pullStartYRef = useRef(0);
  const pullActiveRef = useRef(false);
  const refreshDistanceRef = useRef(0);

  const fetchPage = (pageCursor) => api(
    `/v1/teams/${activeTeamId}/appreciation${pageCursor ? `?cursor=${encodeURIComponent(pageCursor)}` : ''}`,
  );

  const load = async () => {
    if (!activeTeamId) return;
    const data = await fetchPage(null);
    setPosts(data.posts || []);
    setCursor(data.nextCursor || null);
  };

  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      const incoming = data.posts || [];
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.postId));
        return [...current, ...incoming.filter((post) => !seen.has(post.postId))];
      });
      setCursor(data.nextCursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Refreshing after a like or comment must not throw away pages the user has
  // already scrolled into, so merge the newest page over what is on screen.
  const syncNewestPage = async () => {
    const data = await fetchPage(null);
    const incoming = data.posts || [];
    setPosts((current) => {
      const byId = new Map(incoming.map((post) => [post.postId, post]));
      const merged = current.map((post) => byId.get(post.postId) || post);
      const seen = new Set(merged.map((post) => post.postId));
      return [...incoming.filter((post) => !seen.has(post.postId)), ...merged];
    });
  };

  useEffect(() => {
    setError('');
    setCursor(null);
    setLoading(true);
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeTeamId]);

  const removePost = async (post) => {
    if (!window.confirm('Delete this post? Comments and likes go with it.')) return;
    try {
      await api(`/v1/teams/${activeTeamId}/appreciation/${post.postId}`, { method: 'DELETE' });
      setPosts((current) => current.filter((item) => item.postId !== post.postId));
      setNotice('Post deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleLike = async (post) => {
    const liked = post.reactionSummary?.likedByMe;
    setPosts((current) => current.map((item) => {
      if (item.postId !== post.postId) return item;
      const likeCount = Math.max(0, Number(item.reactionSummary?.likeCount || 0) + (liked ? -1 : 1));
      return { ...item, reactionSummary: { likeCount, likedByMe: !liked } };
    }));
    try {
      await api(`/v1/teams/${activeTeamId}/appreciation/${post.postId}/like`, {
        method: liked ? 'DELETE' : 'POST',
      });
      await syncNewestPage();
    } catch (err) {
      setError(err.message);
      await syncNewestPage();
    }
  };

  const addComment = async (postId, message) => {
    await api(`/v1/teams/${activeTeamId}/appreciation/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    await syncNewestPage();
  };

  const runRefresh = async () => {
    if (!activeTeamId || refreshState.refreshing) return;
    setError('');
    setRefreshState({ pulling: false, distance: 0, refreshing: true });
    try {
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshState({ pulling: false, distance: 0, refreshing: false });
    }
  };

  const onPullStart = (event) => {
    if (!activeTeamId || refreshState.refreshing || window.scrollY > 2) return;
    pullStartYRef.current = event.touches[0]?.clientY || 0;
    refreshDistanceRef.current = 0;
    pullActiveRef.current = true;
  };

  const onPullMove = (event) => {
    if (!pullActiveRef.current || window.scrollY > 2) return;
    const currentY = event.touches[0]?.clientY || 0;
    const distance = Math.max(0, Math.min(92, (currentY - pullStartYRef.current) * 0.55));
    refreshDistanceRef.current = distance;
    if (distance > 4) {
      setRefreshState({ pulling: true, distance, refreshing: false });
    }
  };

  const onPullEnd = () => {
    if (!pullActiveRef.current) return;
    pullActiveRef.current = false;
    const shouldRefresh = refreshDistanceRef.current >= 58;
    refreshDistanceRef.current = 0;
    if (shouldRefresh) {
      runRefresh();
    } else {
      setRefreshState((current) => (current.refreshing ? current : { pulling: false, distance: 0, refreshing: false }));
    }
  };

  return (
    <>
      <section className="feed-topbar">
        <h1>Team feed</h1>
        {activeTeamId && (
          <button type="button" onClick={() => navigate('/feed/new', { state: { title: 'Post', submitLabel: 'Post', returnTo: '/feed' } })}>
            <PlusCircle aria-hidden="true" size={16} />
            <span>Post</span>
          </button>
        )}
      </section>
      <section
        className="stack team-feed-screen"
        onTouchStart={onPullStart}
        onTouchMove={onPullMove}
        onTouchEnd={onPullEnd}
        onTouchCancel={onPullEnd}
      >
        <div
          className={`pull-refresh ${refreshState.pulling || refreshState.refreshing ? 'is-visible' : ''} ${refreshState.refreshing ? 'is-refreshing' : ''}`}
          style={{ '--pull-distance': `${refreshState.refreshing ? 46 : refreshState.distance}px` }}
          aria-live="polite"
        >
          <span />
          <strong>{refreshState.refreshing ? 'Refreshing' : refreshState.distance >= 58 ? 'Release to refresh' : 'Pull to refresh'}</strong>
        </div>
        {!activeTeamId && (
          <div className="soft-card">
            <p className="eyebrow">No active team</p>
            <h2>Team feed appears once you join a team.</h2>
          </div>
        )}
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
        {activeTeamId && loading && <SkeletonCards />}
        {activeTeamId && !loading && posts.length === 0 && !error && (
          <div className="soft-card feed-empty">
            <h2>No posts yet</h2>
            <p>Shout out a teammate, share a photo from the weekend, or start a conversation.</p>
            <button type="button" onClick={() => navigate('/feed/new', { state: { title: 'Post', submitLabel: 'Post', returnTo: '/feed' } })}>Write the first post</button>
          </div>
        )}
        {activeTeamId && !loading && posts.length > 0 && (
          <div className="feed-list">
            {posts.map((post) => (
              <FeedPostCard
                key={post.postId}
                post={post}
                canDelete={post.authorUserId === session.user?.userId || isTeamManager(activeTeam?.membership?.role)}
                onOpen={() => navigate(`/feed/${post.postId}`)}
                onLike={() => toggleLike(post)}
                onComment={addComment}
                onDelete={removePost}
                onShowLikers={setLikersPost}
              />
            ))}
            {cursor && (
              <button type="button" className="feed-load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load older posts'}
              </button>
            )}
          </div>
        )}
      </section>
      {likersPost && (
        <LikersSheet teamId={activeTeamId} post={likersPost} onClose={() => setLikersPost(null)} />
      )}
    </>
  );
}
