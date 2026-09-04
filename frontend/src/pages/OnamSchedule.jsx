import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authHeaders, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import { phoneHref, sponsors, whatsappHref } from '../data/sponsors.js';

const statusLabels = {
  upcoming: 'Upcoming',
  live: 'Live Now',
  completed: 'Completed',
};

const TIER_RANK = {
  platinum: 0,
  gold: 1,
  silver: 2,
};

const sortSponsorsByTier = (items) => [...items].sort((a, b) => {
  const rankA = TIER_RANK[String(a.tier || '').toLowerCase().split(' ')[0]] ?? 99;
  const rankB = TIER_RANK[String(b.tier || '').toLowerCase().split(' ')[0]] ?? 99;
  return rankA - rankB || String(a.name || '').localeCompare(String(b.name || ''));
});

const toPublicItem = (item) => ({
  id: item.id,
  timeLabel: item.timeLabel || '',
  title: item.title || '',
  location: item.location || '',
  description: item.description || '',
  status: item.status || 'upcoming',
  sortOrder: item.sortOrder || 0,
});

const canUseSchedulePreview = () => {
  const role = localStorage.getItem('role');
  const scopes = JSON.parse(localStorage.getItem('scopes') || '[]');
  return role === 'admin' || (role === 'guest' && scopes.includes('onam-schedule:manage'));
};

const formatEventDate = (value) => {
  if (!value) return 'Date to be confirmed';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getCountdownLabel = (value, status) => {
  if (status === 'live' || status === 'completed') return '';
  if (!value) return 'Date coming soon';
  const today = new Date();
  const eventDate = new Date(`${value}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((eventDate.getTime() - today.getTime()) / 86_400_000);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  return 'Completed';
};

function OnamSchedule() {
  const [searchParams] = useSearchParams();
  const wantsPreview = searchParams.get('preview') === '1';
  const canPreview = canUseSchedulePreview();
  const isPreview = wantsPreview && canPreview;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSponsor, setSelectedSponsor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      try {
        if (wantsPreview && !canPreview) {
          if (!cancelled) {
            setData(null);
            setError('Log in as an administrator or Onam schedule manager to preview the unpublished schedule.');
          }
          return;
        }

        const result = isPreview
          ? await fetchJson('/onam-schedule/admin', { headers: authHeaders() })
          : await fetchJson('/onam-schedule');

        if (cancelled) return;

        if (isPreview) {
          const previewItems = (result.items || [])
            .filter((item) => item.published !== false)
            .map(toPublicItem)
            .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
              || String(a.timeLabel || '').localeCompare(String(b.timeLabel || '')));
          setData({
            config: { ...result.config, published: true },
            items: previewItems,
          });
        } else {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [wantsPreview, canPreview, isPreview]);

  useEffect(() => {
    if (!selectedSponsor) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedSponsor(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [selectedSponsor]);

  const config = data?.config;
  const items = useMemo(() => data?.items || [], [data]);
  const sortedSponsors = useMemo(() => sortSponsorsByTier(sponsors), []);
  const publishedCount = items.length;

  return (
    <main className="page-shell onam-schedule-page">
      <SiteNav />

      {isPreview && (
        <section className="onam-preview-banner" role="status">
          <div>
            <strong>Preview mode</strong>
            <p>This is how the public page will look. The schedule is still unpublished.</p>
          </div>
          <Link className="btn btn-secondary" to="/admin/onam-schedule">Back to admin</Link>
        </section>
      )}

      {loading && <section className="empty-state"><p>Loading Onam schedule...</p></section>}
      {error && (
        <section className="message-card">
          <p className="error-message">{error}</p>
          {wantsPreview && !canPreview && (
            <Link className="btn btn-primary" to="/login">Login</Link>
          )}
        </section>
      )}

      {!loading && !error && config && (
        <>
          <section className={`onam-schedule-hero ${config.bannerImageUrl ? 'has-media' : ''}`}>
            <div className="onam-schedule-hero-copy">
              <p className="eyebrow">{config.eyebrow || 'Wyndham Tuskers presents'}</p>
              <h1>{config.title || 'Onam 2026'}</h1>
              <p>{config.description}</p>
              <div className="onam-meta-row">
                <span className="onam-meta-chip">{formatEventDate(config.eventDate)}</span>
                <span className="onam-meta-chip">{config.venue || 'Venue to be confirmed'}</span>
                <span className={`onam-meta-chip onam-status-chip ${config.eventStatus || 'upcoming'}`}>{statusLabels[config.eventStatus] || 'Upcoming'}</span>
                {getCountdownLabel(config.eventDate, config.eventStatus) && (
                  <strong className="onam-countdown-chip">{getCountdownLabel(config.eventDate, config.eventStatus)}</strong>
                )}
              </div>
            </div>
            {config.bannerImageUrl && (
              <div className="onam-schedule-hero-media">
                <img src={config.bannerImageUrl} alt="" />
              </div>
            )}
          </section>

          {!config.published ? (
            <section className="empty-state">
              <p className="eyebrow">Onam 2026</p>
              <h2>Schedule is not published yet.</h2>
              <p>Check back closer to the event for live Onam updates.</p>
              <Link className="btn btn-secondary" to="/">Back home</Link>
            </section>
          ) : (
            <div className="onam-schedule-body">
              {/* Sponsors first in DOM for mobile; desktop grid places schedule in column 1 */}
              <aside className="onam-schedule-sponsors" aria-labelledby="onam-sponsors-title">
                <div className="onam-sponsors-heading">
                  <p className="eyebrow" id="onam-sponsors-title">Proudly supported by</p>
                </div>
                <div className="onam-sponsor-stack">
                  {sortedSponsors.map((sponsor) => (
                    <article className="onam-sponsor-card" key={sponsor.id}>
                      <button
                        type="button"
                        className="onam-sponsor-logo"
                        data-sponsor-id={sponsor.id}
                        onClick={() => setSelectedSponsor(sponsor)}
                      >
                        <img src={sponsor.logoUrl} alt={`${sponsor.name} logo`} />
                      </button>
                      <div className="onam-sponsor-copy">
                        <span className={`sponsor-tier sponsor-${sponsor.tier.toLowerCase().split(' ')[0]}`}>
                          {sponsor.tier}
                        </span>
                        <h2>{sponsor.name}</h2>
                        <p>{sponsor.description}</p>
                        <div className="painting-sponsor-actions">
                          <button className="text-button" type="button" onClick={() => setSelectedSponsor(sponsor)}>Read more</button>
                          <a className="text-button" href={phoneHref(sponsor.phone)}>Call</a>
                          <a className="text-button" href={whatsappHref(sponsor.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </aside>

              <section className="onam-schedule-list" aria-labelledby="onam-schedule-title">
                <div className="section-heading-row">
                  <h2 id="onam-schedule-title">Event Schedule</h2>
                  <p>{publishedCount} {publishedCount === 1 ? 'event' : 'events'} published</p>
                </div>

                {items.length > 0 ? items.map((item) => (
                  <article className={`onam-schedule-row is-${item.status || 'upcoming'}`} key={item.id}>
                    <time>{item.timeLabel}</time>
                    <div className="onam-schedule-row-copy">
                      <h3>{item.title}</h3>
                      {item.location ? <p>{item.location}</p> : null}
                      {item.description ? <p className="onam-item-description">{item.description}</p> : null}
                    </div>
                    <span className={`status-pill ${item.status || 'upcoming'}`}>{statusLabels[item.status] || 'Upcoming'}</span>
                  </article>
                )) : (
                  <section className="empty-state">
                    <p>No schedule items have been published yet.</p>
                  </section>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {selectedSponsor && (
        <div className="modal-backdrop painting-modal-backdrop" role="presentation" onClick={() => setSelectedSponsor(null)}>
          <section
            className="analytics-modal painting-sponsor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onam-sponsor-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close floating-close" type="button" onClick={() => setSelectedSponsor(null)} aria-label="Close">x</button>
            <div className="painting-sponsor-modal-logo">
              <img src={selectedSponsor.logoUrl} alt={`${selectedSponsor.name} logo`} />
            </div>
            <div className="painting-sponsor-modal-meta">
              <p className="eyebrow">{selectedSponsor.category}</p>
              <span className={`sponsor-tier sponsor-${selectedSponsor.tier.toLowerCase().split(' ')[0]}`}>
                {selectedSponsor.tier}
              </span>
            </div>
            <h2 id="onam-sponsor-dialog-title">{selectedSponsor.name}</h2>
            <p>{selectedSponsor.description}</p>
            <div className="sponsor-contact-block">
              <p className="eyebrow">Contact</p>
              <strong>{selectedSponsor.contactLabel}</strong>
              <a href={phoneHref(selectedSponsor.phone)}>{selectedSponsor.phone}</a>
              <a href={whatsappHref(selectedSponsor.phone)} target="_blank" rel="noreferrer">WhatsApp: {selectedSponsor.phone}</a>
              {selectedSponsor.email && <a href={`mailto:${selectedSponsor.email}`}>{selectedSponsor.email}</a>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default OnamSchedule;
