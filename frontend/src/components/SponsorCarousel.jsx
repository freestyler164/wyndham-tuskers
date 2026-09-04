import { useEffect, useState } from 'react';
import { phoneHref, sponsors, whatsappHref } from '../data/sponsors.js';

function SponsorCarousel({ variant = 'section', title = 'Proudly supported by' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const activeSponsor = sponsors[activeIndex] || sponsors[0];

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

  const showPrevious = () => setActiveIndex((current) => (current === 0 ? sponsors.length - 1 : current - 1));
  const showNext = () => setActiveIndex((current) => (current + 1) % sponsors.length);

  return (
    <>
      <section className={`sponsor-carousel sponsor-carousel-${variant}`} aria-labelledby={`sponsor-carousel-${variant}-title`}>
        <div className="sponsor-carousel-heading">
          <p className="eyebrow" id={`sponsor-carousel-${variant}-title`}>{title}</p>
          <div className="sponsor-carousel-controls" aria-label="Sponsor carousel controls">
            <button type="button" onClick={showPrevious} aria-label="Previous sponsor">&lt;</button>
            <button type="button" onClick={showNext} aria-label="Next sponsor">&gt;</button>
          </div>
        </div>

        <article className="sponsor-carousel-card">
          <button
            type="button"
            className="painting-sponsor-logo sponsor-carousel-logo"
            data-sponsor-id={activeSponsor.id}
            onClick={() => setSelectedSponsor(activeSponsor)}
          >
            <img src={activeSponsor.logoUrl} alt={`${activeSponsor.name} logo`} />
          </button>
          <div className="painting-sponsor-copy sponsor-carousel-copy">
            <div>
              <div className="sponsor-carousel-meta">
                <span className="eyebrow">{activeSponsor.category}</span>
                <span className={`sponsor-tier sponsor-${activeSponsor.tier.toLowerCase().split(' ')[0]}`}>
                  {activeSponsor.tier}
                </span>
              </div>
              <h2>{activeSponsor.name}</h2>
              <p>{activeSponsor.description}</p>
            </div>
            <div className="painting-sponsor-actions">
              <button className="text-button" type="button" onClick={() => setSelectedSponsor(activeSponsor)}>View details</button>
              <a className="text-button" href={phoneHref(activeSponsor.phone)}>Call</a>
              <a className="text-button" href={whatsappHref(activeSponsor.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
              {activeSponsor.email && <a className="text-button" href={`mailto:${activeSponsor.email}`}>Email</a>}
            </div>
          </div>
        </article>

        <div className="sponsor-carousel-dots" aria-label="Select sponsor">
          {sponsors.map((sponsor, index) => (
            <button
              key={sponsor.id}
              type="button"
              className={index === activeIndex ? 'is-active' : ''}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${sponsor.name}`}
            />
          ))}
        </div>
      </section>

      {selectedSponsor && (
        <div className="modal-backdrop painting-modal-backdrop" role="presentation" onClick={() => setSelectedSponsor(null)}>
          <section
            className="analytics-modal painting-sponsor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sponsor-dialog-title"
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
            <h2 id="sponsor-dialog-title">{selectedSponsor.name}</h2>
            <p>{selectedSponsor.description}</p>
            <div className="sponsor-contact-block">
              <span>Contact</span>
              <strong>{selectedSponsor.contactLabel}</strong>
              <a href={phoneHref(selectedSponsor.phone)}>{selectedSponsor.phone}</a>
              <a href={whatsappHref(selectedSponsor.phone)} target="_blank" rel="noreferrer">WhatsApp: {selectedSponsor.phone}</a>
              {selectedSponsor.email && <a href={`mailto:${selectedSponsor.email}`}>{selectedSponsor.email}</a>}
            </div>
            <div className="modal-actions">
              <a className="btn btn-secondary" href={phoneHref(selectedSponsor.phone)}>Call</a>
              <a className="btn btn-primary" href={whatsappHref(selectedSponsor.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
              {selectedSponsor.email && <a className="btn btn-secondary" href={`mailto:${selectedSponsor.email}`}>Email</a>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default SponsorCarousel;
