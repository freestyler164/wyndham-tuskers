import { useEffect, useState } from 'react';
import SiteNav from '../components/SiteNav.jsx';
import { fetchJson } from '../api.js';

function Gallery() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      try {
        const data = await fetchJson('/gallery');
        if (!cancelled) {
          setPhotos(Array.isArray(data) ? data : []);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load gallery photos.');
          setPhotos([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page-shell gallery-page">
      <SiteNav />

      {loading && (
        <section className="empty-state gallery-empty">
          <p className="eyebrow">Gallery</p>
          <h1>Loading photos…</h1>
        </section>
      )}

      {!loading && error && (
        <section className="empty-state gallery-empty">
          <p className="eyebrow">Gallery</p>
          <h1>Could not load gallery</h1>
          <p>{error}</p>
        </section>
      )}

      {!loading && !error && photos.length > 0 && (
        <section className="gallery-photo-grid" aria-label="Gallery photos">
          {photos.map((photo) => (
            <figure key={photo.id} className="gallery-photo">
              <img
                src={photo.url}
                alt={photo.caption || 'Wyndham Tuskers gallery photo'}
                loading="lazy"
              />
              {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
            </figure>
          ))}
        </section>
      )}

      {!loading && !error && photos.length === 0 && (
        <section className="empty-state gallery-empty">
          <p className="eyebrow">Gallery</p>
          <h1>No gallery photos yet</h1>
          <p>Check back soon for community photos from Wyndham Tuskers events.</p>
        </section>
      )}
    </main>
  );
}

export default Gallery;
