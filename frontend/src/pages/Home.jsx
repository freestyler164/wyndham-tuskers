import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import FormattedText from '../components/FormattedText.jsx';
import MediaPlaceholder from '../components/MediaPlaceholder.jsx';
import SponsorCarousel from '../components/SponsorCarousel.jsx';

const homePhotos = [
  { label: 'Family moments', src: '/static/photos/home/club-photo.jpg' },
  { label: 'TPL carnival', src: '/static/photos/home/tpl-carnival.mp4', type: 'video' },
  { label: 'Onam celebration', src: '/static/photos/home/onam-celebrations.MOV', type: 'video' },
  { label: 'Sports day', src: '/static/photos/home/sports-day.jpg' },
  { label: 'Community moments', src: '/static/photos/home/community-photo.jpg' },
  { label: 'Community gathering', src: '/static/photos/home/community-photo-2.jpg' },
];

function Home() {
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [onamSchedule, setOnamSchedule] = useState(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.allSettled([fetchJson('/surveys'), fetchJson('/events'), fetchJson('/config')])
      .then(([formsResult, eventsResult, configResult]) => {
        if (formsResult.status === 'fulfilled') {
          const sorted = [...formsResult.value].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          setItems(sorted);
        } else {
          setError(formsResult.reason.message);
        }

        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value);
        }

        if (configResult.status === 'fulfilled') {
          setRegistrationOpen(Boolean(configResult.value.enableMemberRegistration));
          if (configResult.value.onamSchedulePublished) {
            fetchJson('/onam-schedule')
              .then((schedule) => setOnamSchedule(schedule))
              .catch(() => setOnamSchedule(null));
          } else {
            setOnamSchedule(null);
          }
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const featuredItem = items[0];
  const featuredEvents = events.slice(0, 3);
  const onamItems = onamSchedule?.items || [];
  const liveOnamItem = onamItems.find((item) => item.status === 'live')
    || onamItems.find((item) => item.status === 'upcoming')
    || onamItems[onamItems.length - 1];
  const onamStatusText = onamSchedule?.config?.eventStatus === 'live'
    ? 'Live now'
    : onamSchedule?.config?.eventStatus === 'completed'
    ? 'Completed'
    : 'Published schedule';

  const formatEventDate = (value) => {
    if (!value) return 'TBC';
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <main className="home-page lovable-home">
      <SiteNav />

      <section className="lovable-hero">
        <div className="hero-announcement">
          <span>WT</span>
          Wyndham Tuskers
        </div>

        <div className="lovable-hero-copy">
          <h1>Once a Tusker, Always a Family.</h1>
          <p>Sports, culture and community moments for Wyndham families.</p>
        </div>

        <div className="hero-primary-actions">
          {registrationOpen && <Link className="btn btn-primary" to="/register">Become a member</Link>}
          <Link className="btn btn-secondary" to="/gallery">View gallery</Link>
        </div>

        <div className="home-action-grid">
          {onamSchedule?.config?.published ? (
            <section className="home-tile whats-new-tile live-onam-tile">
              <span className="eyebrow">Live Onam updates</span>
              <h2>{liveOnamItem?.title || 'Onam 2026 schedule is live'}</h2>
              <p>
                {liveOnamItem
                  ? `${onamStatusText} · ${liveOnamItem.timeLabel || 'Time TBC'} · ${liveOnamItem.location || onamSchedule.config.venue || 'Venue TBC'}`
                  : 'All scheduled items completed.'}
              </p>
              <Link className="btn btn-primary" to="/onam-2026">View live tracker</Link>
            </section>
          ) : (
            <section className="home-tile whats-new-tile">
              <span className="eyebrow">What's new</span>
              <h2>{featuredItem?.title || 'Community forms will appear here'}</h2>
              <p>{featuredItem ? 'Open now for member responses.' : 'Admins can publish forms from the portal.'}</p>
              {featuredItem && <Link className="btn btn-primary" to={`/survey/${featuredItem.id}`}>Open form</Link>}
            </section>
          )}

          <section className="home-tile events-tile">
            <div className="tile-heading">
              <span className="eyebrow">Upcoming events</span>
              <span className="event-count">{featuredEvents.length || 0}</span>
            </div>
            <div className="event-list">
              {featuredEvents.length > 0 ? featuredEvents.map((event) => (
                <article key={event.id} className="event-row">
                  <time>{formatEventDate(event.eventDate)}</time>
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.location || event.summary || 'Details coming soon'}</p>
                  </div>
                </article>
              )) : (
                <p className="muted-text">Upcoming events will appear here once added.</p>
              )}
            </div>
          </section>

          <SponsorCarousel variant="home" title="Sponsor spotlight" />
        </div>
      </section>

      <section className="about-us-section" id="about-us">
        <div className="about-us-intro">
          <span className="eyebrow">Welcome to Wyndham Tuskers</span>
          <h2>More than a sports club.</h2>
          <p>
            At Wyndham Tuskers, we are more than just a sports club &mdash; we are a growing community built on friendship,
            togetherness, and family spirit. Based around the vibrant Wyndham region, our club continues to grow steadily
            each year, bringing together people from diverse backgrounds through sports, culture, and social connections.
          </p>
          <Link className="btn btn-secondary" to="/about">Read about us</Link>
        </div>

        <div className="home-photo-grid">
          {homePhotos.map((photo, index) => (
            <MediaPlaceholder
              key={photo.label}
              className={`home-photo home-photo-${index + 1}`}
              label={photo.label}
              src={photo.src}
              type={photo.type}
            />
          ))}
        </div>
      </section>

      {error && <div className="message-card"><p>{error}</p></div>}

      {items.length > 0 && (
        <section className="survey-preview">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Open now</span>
              <h2>Community forms</h2>
            </div>
          </div>

          <div className="survey-grid">
            {items.map((item) => (
              <article key={item.id} className="survey-card">
                <h3>{item.title}</h3>
                <FormattedText text={item.description} />
                <Link className="btn btn-primary" to={`/survey/${item.id}`}>Open</Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="site-footer">
        <p>Wyndham Tuskers (c) 2026 - Malayalee community in Wyndham, Melbourne</p>
      </footer>
    </main>
  );
}

export default Home;
