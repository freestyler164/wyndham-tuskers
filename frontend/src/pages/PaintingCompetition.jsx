import { useEffect, useState } from 'react';
import { API_URL, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import { phoneHref, sponsors, whatsappHref } from '../data/sponsors.js';

const emptyForm = {
  parentName: '',
  childName: '',
  ageGroupId: '',
  templateId: '',
  consentAccepted: false,
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const isHeicLikeFile = (file) => (
  ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(String(file.type || '').toLowerCase())
  || /\.(heic|heif)$/i.test(file.name || '')
);

const isSupportedArtworkFile = (file) => (
  ['image/jpeg', 'image/png'].includes(String(file.type || '').toLowerCase())
  || /\.(jpe?g|png|heic|heif)$/i.test(file.name || '')
  || isHeicLikeFile(file)
);

function PaintingCompetition({ submissionMode = false }) {
  const [data, setData] = useState({
    config: null,
    templates: [],
    ageGroups: [],
    maxArtworkBytes: 4 * 1024 * 1024,
  });
  const [form, setForm] = useState(emptyForm);
  const [artwork, setArtwork] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(null);
  const [showSubmission, setShowSubmission] = useState(submissionMode);
  const [selectedSponsor, setSelectedSponsor] = useState(null);

  useEffect(() => {
    fetchJson('/painting-competition')
      .then(setData)
      .catch((err) => setPageError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!showSubmission && !selectedSponsor) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !submitting) setShowSubmission(false);
      if (event.key === 'Escape') setSelectedSponsor(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [showSubmission, selectedSponsor, submitting]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const selectAgeGroup = (ageGroupId) => setForm((current) => ({
    ...current,
    ageGroupId,
    templateId: ageGroupId === 'under-5' ? data.templates[0]?.id || '' : '',
  }));

  const openSubmission = () => {
    setFormError('');
    setShowSubmission(true);
  };

  const closeSubmission = () => {
    if (submitting) return;
    setShowSubmission(false);
    setFormError('');
  };

  const selectArtwork = (event) => {
    const file = event.target.files?.[0];
    setFormError('');
    if (!file) return;
    setArtwork(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (!isSupportedArtworkFile(file)) {
      setFormError('Upload a valid JPG, PNG or HEIC image.');
      event.target.value = '';
      return;
    }
    if (file.size > data.maxArtworkBytes) {
      setFormError(`Artwork must be ${Math.round(data.maxArtworkBytes / 1024 / 1024)} MB or smaller.`);
      event.target.value = '';
      return;
    }
    setArtwork(file);
    if (!isHeicLikeFile(file)) setPreviewUrl(URL.createObjectURL(file));
  };

  const submitArtwork = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!artwork) {
      setFormError('Select the finished painting image.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchJson('/painting-competition/submissions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          fileName: artwork.name,
          data: await fileToBase64(artwork),
        }),
      });
      setSuccess(result);
      setShowSubmission(false);
      setForm(emptyForm);
      setArtwork(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const config = data.config;
  const isOpen = config?.status === 'open';
  const uploadEnabled = isOpen;
  const selectedAgeGroup = data.ageGroups.find((group) => group.id === form.ageGroupId);
  const underFiveTemplateMissing = selectedAgeGroup?.requiresTemplate && data.templates.length === 0;

  return (
    <main className="page-shell painting-page">
      <SiteNav />

      {success && (
        <section className="painting-success-banner" role="status" aria-live="polite">
          <div>
            <p className="eyebrow">Entry received</p>
            <h2>Painting submitted successfully.</h2>
            <p>{success.message}</p>
          </div>
          <p className="submission-reference">Reference: {success.submissionId}</p>
        </section>
      )}

      {loading && <section className="empty-state"><p>Loading competition details...</p></section>}
      {pageError && !config && <section className="message-card"><p>{pageError}</p></section>}

      {config && (
        <>
          {config.status === 'closed' ? (
            <section className="empty-state">
              <p className="eyebrow">Onam 2026</p>
              <h1>Painting submissions are closed.</h1>
              <p>The public painting competition page is no longer available. Administrators and judges can continue reviewing entries from the admin portal.</p>
            </section>
          ) : (
          <>
          <section className="painting-hero">
            <div>
              <div className="painting-hero-kicker">
                <p className="eyebrow">Onam 2026</p>
                <span className={`status-pill ${isOpen ? 'active' : 'inactive'}`}>
                  {isOpen ? 'Entries open' : config.status === 'closed' ? 'Entries closed' : 'Coming soon'}
                </span>
              </div>
              <h1>{config.title}</h1>
              <p>{config.subtitle}</p>
            </div>
            <div className="painting-hero-art">
              <img
                src="/static/photos/painting-competition/onam-kids-painting-hero.png"
                alt="Children colouring an Onam-themed painting template"
              />
            </div>
          </section>

          <section className="painting-sponsors" aria-labelledby="painting-sponsors-title">
            <p className="eyebrow">Proudly supported by</p>
            <div className="painting-sponsor-grid">
              {sponsors.map((sponsor) => (
                <article className="painting-sponsor-card" key={sponsor.id}>
                  <button
                    type="button"
                    className="painting-sponsor-logo"
                    data-sponsor-id={sponsor.id}
                    onClick={() => setSelectedSponsor(sponsor)}
                  >
                    <img src={sponsor.logoUrl} alt={`${sponsor.name} logo`} />
                  </button>
                  <div className="painting-sponsor-copy">
                    <div>
                      <span className={`sponsor-tier sponsor-${sponsor.tier.toLowerCase().split(' ')[0]}`}>
                        {sponsor.tier}
                      </span>
                      <h2 id={sponsor.id === sponsors[0].id ? 'painting-sponsors-title' : undefined}>{sponsor.name}</h2>
                      <p>{sponsor.description}</p>
                    </div>
                    <div className="painting-sponsor-actions">
                      <button className="text-button" type="button" onClick={() => setSelectedSponsor(sponsor)}>Read more</button>
                      <a className="text-button" href={phoneHref(sponsor.phone)}>Call</a>
                      <a className="text-button" href={whatsappHref(sponsor.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
                      {sponsor.email && <a className="text-button" href={`mailto:${sponsor.email}`}>Email</a>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="painting-compact-process" aria-labelledby="painting-process-title">
            <div className="painting-compact-intro">
              <p className="eyebrow">How to enter</p>
              <h2 id="painting-process-title">Create and submit in three steps.</h2>
            </div>

            <div className="painting-compact-grid">
              <section className="painting-compact-step">
                <div className="painting-compact-step-heading">
                  <p className="eyebrow">Step 1</p>
                  <div className="painting-step-title-row">
                    <span className="painting-step-number" aria-hidden="true">1</span>
                    <h2>Choose the age group.</h2>
                  </div>
                </div>
                <div className="painting-age-list">
                  {(data.ageGroups || []).map((group) => (
                    <div className="painting-age-row" key={group.id}>
                      <strong>{group.label}</strong>
                      <span>{group.activity}</span>
                    </div>
                  ))}
                </div>
                <div className="painting-template-download">
                  <strong>Under 5 colouring template</strong>
                  {data.templates.map((template) => (
                    <a
                      key={template.id}
                      className="btn btn-secondary"
                      href={`${API_URL}/painting-competition/templates/${encodeURIComponent(template.id)}/download`}
                    >
                      Download template
                    </a>
                  ))}
                  {data.templates.length === 0 && <span>Template coming soon</span>}
                </div>
              </section>

              <section className="painting-compact-step">
                <div className="painting-compact-step-heading">
                  <p className="eyebrow">Step 2</p>
                  <div className="painting-step-title-row">
                    <span className="painting-step-number" aria-hidden="true">2</span>
                    <h2>Finish the artwork.</h2>
                  </div>
                </div>
                <p>
                  Under-5 artists colour the printed template. Ages 5-7, 8-10, and 11-14 can create an original drawing, painting, or pencil sketch.
                  {' '}<strong>Theme: Onam.</strong>
                </p>
                <details className="painting-instruction-details">
                  <summary>Read competition instructions</summary>
                  <ol>
                    {(config.instructions || []).map((instruction) => <li key={instruction}>{instruction}</li>)}
                  </ol>
                </details>
              </section>

              <section className="painting-compact-step painting-upload-step">
                <div className="painting-compact-step-heading">
                  <p className="eyebrow">Step 3</p>
                  <div className="painting-step-title-row">
                    <span className="painting-step-number" aria-hidden="true">3</span>
                    <h2>Upload the artwork.</h2>
                  </div>
                </div>
                <p>Take a clear, well-lit photo or scan with the whole page visible. Upload a JPG, PNG or HEIC file up to 4 MB.</p>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!uploadEnabled}
                  onClick={openSubmission}
                >
                  Submit a painting
                </button>
                {!uploadEnabled && <p className="painting-availability">Submissions are not currently open.</p>}
              </section>
            </div>
          </section>

          {showSubmission && (
            <div className="modal-backdrop painting-modal-backdrop" role="presentation" onClick={closeSubmission}>
              <section
                className="analytics-modal painting-submission-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="painting-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <p className="eyebrow">Onam 2026</p>
                    <h2 id="painting-dialog-title">Submit a painting</h2>
                    <p className="muted-text">Add the participant details and upload one clear image of the finished work.</p>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={closeSubmission} disabled={submitting}>Close</button>
                </div>

                <form className="painting-entry-form" onSubmit={submitArtwork}>
                  {!isOpen && <p className="message error-message">Entries are not currently open.</p>}
                  {formError && <p className="message error-message" role="alert">{formError}</p>}

                  <div className="form-grid-two">
                    <label>
                      <span>Child's name</span>
                      <input
                        value={form.childName}
                        onChange={(event) => setField('childName', event.target.value)}
                        maxLength="100"
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label>
                      <span>Parent or guardian name</span>
                      <input
                        value={form.parentName}
                        onChange={(event) => setField('parentName', event.target.value)}
                        maxLength="100"
                        autoComplete="name"
                        required
                      />
                    </label>
                  </div>

                  <label>
                    <span>Age group</span>
                    <select value={form.ageGroupId} onChange={(event) => selectAgeGroup(event.target.value)} required>
                      <option value="">Select the child's age group</option>
                      {data.ageGroups.map((group) => (
                        <option key={group.id} value={group.id}>{group.label} - {group.activity}</option>
                      ))}
                    </select>
                    {selectedAgeGroup && <small>{selectedAgeGroup.activity}</small>}
                  </label>

                  {underFiveTemplateMissing && (
                    <p className="message error-message">The Under 5 colouring template has not been published yet.</p>
                  )}

                  <label className="painting-upload-field">
                    <span>Finished painting</span>
                    <input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif" onChange={selectArtwork} required />
                    <small>JPG, PNG or HEIC only, up to {Math.round(data.maxArtworkBytes / 1024 / 1024)} MB. HEIC photos are converted securely before judging.</small>
                  </label>

                  {previewUrl && (
                    <div className="painting-upload-preview">
                      <img src={previewUrl} alt="Selected finished painting preview" />
                    </div>
                  )}
                  {artwork && !previewUrl && (
                    <p className="empty-inline">Selected file: {artwork.name}. A preview will be available after upload.</p>
                  )}

                  <label className="checkbox-row painting-consent">
                    <input
                      type="checkbox"
                      checked={form.consentAccepted}
                      onChange={(event) => setField('consentAccepted', event.target.checked)}
                      required
                    />
                    <span>{config.consentText}</span>
                  </label>

                  <div className="modal-actions">
                    <button className="btn btn-ghost" type="button" onClick={closeSubmission} disabled={submitting}>Cancel</button>
                    <button className="btn btn-primary" type="submit" disabled={!isOpen || submitting || underFiveTemplateMissing}>
                      {submitting ? 'Submitting...' : 'Submit painting'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

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
          )}

        </>
      )}
    </main>
  );
}

export default PaintingCompetition;
