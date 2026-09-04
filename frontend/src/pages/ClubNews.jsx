import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import FormattedText from '../components/FormattedText.jsx';

const formatDate = (value) => {
  if (!value) return 'Date TBC';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatViews = (value) => {
  const count = Number(value || 0);
  return `${count.toLocaleString()} ${count === 1 ? 'view' : 'views'}`;
};

function ClubNews() {
  const { slug } = useParams();
  const [posts, setPosts] = useState([]);
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    const request = slug ? fetchJson(`/news/${slug}`) : fetchJson('/news');
    request
      .then((data) => {
        if (slug) {
          setPost(data);
          setPosts([]);
        } else {
          setPosts(data);
          setPost(null);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const featured = posts[0];
  const remainingPosts = useMemo(() => posts.slice(1), [posts]);

  if (slug) {
    return (
      <main className="page-shell news-page">
        <SiteNav />
        {loading && <section className="empty-state"><p>Loading club news...</p></section>}
        {error && <section className="empty-state"><p className="message error-message">{error}</p></section>}
        {post && (
          <article className="news-article">
            <div className="news-article-hero">
              <img src={post.coverImageUrl} alt="" />
              <div>
                <p className="eyebrow">{post.category || 'Club news'}</p>
                <h1>{post.title}</h1>
                <div className="article-meta">
                  <span>{post.author || 'Wyndham Tuskers'}</span>
                  <span>{formatDate(post.publishedAt)}</span>
                  <span>{formatViews(post.viewCount)}</span>
                </div>
                <p>{post.excerpt}</p>
              </div>
            </div>

            <FormattedText text={post.body} className="article-body" />

            {post.supportingPhotos?.length > 0 && (
              <div className="article-photo-grid">
                {post.supportingPhotos.map((photo, index) => (
                  <figure key={`${photo.url}-${index}`}>
                    <img src={photo.url} alt={photo.caption || `${post.title} photo ${index + 1}`} loading="lazy" />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}

            <Link className="btn btn-secondary" to="/club-news">Back to club news</Link>
          </article>
        )}
      </main>
    );
  }

  return (
    <main className="page-shell news-page">
      <SiteNav />

      <section className="page-heading news-heading">
        <p className="eyebrow">Club news</p>
        <h1>Stories from the Tuskers family.</h1>
      </section>

      {loading && <section className="empty-state"><p>Loading club news...</p></section>}
      {error && <div className="message-card"><p>{error}</p></div>}

      {featured && (
        <article className="featured-news-card">
          <img src={featured.coverImageUrl} alt="" />
          <div className="featured-news-copy">
            <h2>{featured.title}</h2>
            <div className="article-meta">
              <span>{featured.author || 'Wyndham Tuskers'}</span>
              <span>{featured.category || 'Club news'}</span>
              <span>{formatDate(featured.publishedAt)}</span>
            </div>
            <p>{featured.excerpt}</p>
            <Link className="btn btn-secondary" to={`/club-news/${featured.slug}`}>Read more</Link>
          </div>
        </article>
      )}

      {remainingPosts.length > 0 && (
        <section className="news-grid">
          {remainingPosts.map((item) => (
            <article key={item.slug} className="news-card">
              <img src={item.coverImageUrl} alt="" loading="lazy" />
              <div>
                <span className="eyebrow">{item.category || 'Club news'}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <Link to={`/club-news/${item.slug}`}>Read more</Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && !featured && !error && (
        <section className="empty-state">
          <h2>No club news yet</h2>
          <p>Published articles will appear here.</p>
        </section>
      )}
    </main>
  );
}

export default ClubNews;
