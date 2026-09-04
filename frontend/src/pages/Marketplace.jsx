import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import FormattedText from '../components/FormattedText.jsx';

const categories = [
  'All',
  'Food & Catering',
  'Finance & Mortgage',
  'Real Estate',
  'Sports & Fitness',
  'Trades & Services',
  'Retail & Shopping',
  'Professional Services',
  'Education & Training',
  'Health & Wellness',
  'Other',
];

const initials = (value) => String(value || 'WT')
  .split(/\s+/)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const whatsappUrl = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits.startsWith('0') ? `61${digits.slice(1)}` : digits}` : '';
};

const whatsappLinks = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
  .map((label) => ({ label, url: whatsappUrl(label) }))
  .filter((item) => item.url);

const stopCardNavigation = (event) => {
  event.stopPropagation();
};

function MarketplaceCard({ business }) {
  const waLinks = whatsappLinks(business.whatsapp || business.phone);
  const whatsappText = String(business.whatsapp || '').trim();

  return (
    <Link className={`marketplace-card ${business.featured ? 'is-featured' : ''}`} to={`/marketplace/${business.slug || business.id}`}>
      <div className="marketplace-card-media">
        {business.logoUrl || business.bannerUrl ? (
          <img
            className={business.logoUrl && !business.bannerUrl ? 'marketplace-logo-image' : ''}
            src={business.logoUrl || business.bannerUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span>{initials(business.name)}</span>
        )}
      </div>
      <div className="marketplace-card-copy">
        <div className="marketplace-card-topline">
          <span className="eyebrow">{business.category}</span>
          {business.featured && <span className="featured-badge">Featured</span>}
        </div>
        <h2>{business.name}</h2>
        <p>{business.description}</p>
        <div className="marketplace-card-contact">
          <span>Contact</span>
          <strong>{business.contactPerson}</strong>
          {business.phone && <p>{business.phone}</p>}
          {whatsappText && <p>WhatsApp: {whatsappText}</p>}
          {business.email && <p>{business.email}</p>}
          <div className="marketplace-card-actions">
            {business.phone && (
              <a href={`tel:${business.phone}`} onClick={stopCardNavigation}>Call</a>
            )}
            {waLinks.map((item, index) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" onClick={stopCardNavigation}>
                WhatsApp{waLinks.length > 1 ? ` ${index + 1}` : ''}
              </a>
            ))}
            {business.email && (
              <a href={`mailto:${business.email}`} onClick={stopCardNavigation}>Email</a>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Marketplace() {
  const { slug } = useParams();
  const [businesses, setBusinesses] = useState([]);
  const [business, setBusiness] = useState(null);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const request = slug ? fetchJson(`/marketplace/${slug}`) : fetchJson('/marketplace');
    request
      .then((data) => {
        if (slug) {
          setBusiness(data);
          setBusinesses([]);
        } else {
          setBusinesses(data);
          setBusiness(null);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return businesses.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!query) return true;
      return [
        item.name,
        item.category,
        item.description,
        item.fullDescription,
        item.contactPerson,
        ...(item.services || []),
      ].join(' ').toLowerCase().includes(query);
    });
  }, [businesses, category, search]);

  if (slug) {
    const waLinks = whatsappLinks(business?.whatsapp || business?.phone);
    const whatsappText = String(business?.whatsapp || '').trim();
    return (
      <main className="page-shell marketplace-page">
        <SiteNav />
        {loading && <section className="empty-state"><p>Loading business details...</p></section>}
        {error && <section className="empty-state"><p className="message error-message">{error}</p></section>}
        {business && (
          <article className="marketplace-detail">
            <section className="marketplace-detail-hero">
              <div className="marketplace-detail-media">
                {business.bannerUrl || business.logoUrl ? (
                  <img
                    className={business.logoUrl && !business.bannerUrl ? 'marketplace-logo-image' : ''}
                    src={business.bannerUrl || business.logoUrl}
                    alt=""
                  />
                ) : (
                  <span>{initials(business.name)}</span>
                )}
              </div>
              <div>
                <p className="eyebrow">{business.category}</p>
                <h1>{business.name}</h1>
                {business.featured && <span className="featured-badge">Featured business</span>}
                <p>{business.description}</p>
              </div>
            </section>

            <section className="marketplace-detail-grid">
              <div className="marketplace-detail-body">
                <h2>About</h2>
                <FormattedText text={business.fullDescription || business.description} />

                {business.services?.length > 0 && (
                  <>
                    <h2>Services</h2>
                    <div className="service-chip-list">
                      {business.services.map((service) => <span key={service}>{service}</span>)}
                    </div>
                  </>
                )}

                {business.menuPdfUrl && (
                  <section className="marketplace-pdf-section">
                    <div className="section-heading-row">
                      <h2>Menu</h2>
                      <a className="btn btn-secondary" href={business.menuPdfUrl} target="_blank" rel="noreferrer">
                        Open menu PDF
                      </a>
                    </div>
                    <iframe
                      src={business.menuPdfUrl}
                      title={`${business.name} menu PDF`}
                    />
                  </section>
                )}
              </div>

              <aside className="marketplace-contact-panel">
                <h2>Contact</h2>
                <p><span>Person</span><strong>{business.contactPerson}</strong></p>
                {business.phone && <p><span>Phone</span><a href={`tel:${business.phone}`}>{business.phone}</a></p>}
                {whatsappText && <p><span>WhatsApp</span><strong>{whatsappText}</strong></p>}
                {business.email && <p><span>Email</span><a href={`mailto:${business.email}`}>{business.email}</a></p>}
                {business.website && <p><span>Website</span><a href={business.website} target="_blank" rel="noreferrer">Open link</a></p>}
                {waLinks.map((item, index) => (
                  <a key={item.url} className="btn btn-primary" href={item.url} target="_blank" rel="noreferrer">
                    Message on WhatsApp{waLinks.length > 1 ? ` ${index + 1}` : ''}
                  </a>
                ))}
              </aside>
            </section>

            {business.gallery?.length > 0 && (
              <section className="article-photo-grid">
                {business.gallery.map((photo, index) => (
                  <figure key={`${photo.url}-${index}`}>
                    <img src={photo.url} alt={photo.caption || `${business.name} photo ${index + 1}`} loading="lazy" />
                    {photo.caption && <figcaption>{photo.caption}</figcaption>}
                  </figure>
                ))}
              </section>
            )}

            <Link className="btn btn-secondary" to="/marketplace">Back to marketplace</Link>
          </article>
        )}
      </main>
    );
  }

  return (
    <main className="page-shell marketplace-page">
      <SiteNav />

      <section className="page-heading marketplace-heading">
        <p className="eyebrow">Member Marketplace</p>
        <h1>Support the Tuskers family.</h1>
        <p>Support businesses and services owned by Wyndham Tuskers members and their families.</p>
      </section>

      <section className="marketplace-controls">
        <label>
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Business, service, contact..."
          />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </section>

      {loading && <section className="empty-state"><p>Loading marketplace...</p></section>}
      {error && <div className="message-card"><p>{error}</p></div>}

      {!loading && filteredBusinesses.length > 0 && (
        <section className="marketplace-grid">
          {filteredBusinesses.map((item) => <MarketplaceCard key={item.id} business={item} />)}
        </section>
      )}

      {!loading && filteredBusinesses.length === 0 && !error && (
        <section className="empty-state">
          <h2>No businesses found</h2>
          <p>Try a different category or search term.</p>
        </section>
      )}
    </main>
  );
}

export default Marketplace;
