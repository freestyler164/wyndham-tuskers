import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, authHeaders, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-AU') : 'Unknown');

function AdminPaintingCompetition() {
  const [config, setConfig] = useState(null);
  const [instructionsText, setInstructionsText] = useState('');
  const [templates, setTemplates] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [templateForm, setTemplateForm] = useState({
    label: '',
    sortOrder: 0,
    file: null,
  });
  const [selected, setSelected] = useState(null);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [artworkRotation, setArtworkRotation] = useState(0);
  const [showExplorerDetails, setShowExplorerDetails] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const role = localStorage.getItem('role');
  const scopes = JSON.parse(localStorage.getItem('scopes') || '[]');
  const isAdmin = role === 'admin';
  const canJudgePainting = isAdmin || (role === 'guest' && scopes.includes('painting:judge'));

  const loadAdminData = async () => {
    setError('');
    try {
      const result = await fetchJson('/painting-competition/admin', { headers: authHeaders() });
      setConfig(result.config);
      setInstructionsText((result.config.instructions || []).join('\n'));
      setTemplates(result.templates || []);
      setSubmissions(result.submissions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canJudgePainting) loadAdminData();
    else setLoading(false);
  }, [canJudgePainting]);

  useEffect(() => () => {
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
  }, [artworkUrl]);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!query) return true;
      return [
        item.childName,
        item.parentName,
        item.ageGroup,
        item.activityType,
        item.templateLabel,
      ].join(' ').toLowerCase().includes(query);
    });
  }, [submissions, search, statusFilter]);
  const selectedIndex = selected ? filteredSubmissions.findIndex((item) => item.id === selected.id) : -1;
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < filteredSubmissions.length - 1;

  const updateConfig = (field, value) => setConfig((current) => ({ ...current, [field]: value }));

  const saveConfig = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchJson('/painting-competition/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          ...config,
          instructions: instructionsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        }),
      });
      setConfig(result);
      setInstructionsText((result.instructions || []).join('\n'));
      setMessage('Competition settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadTemplate = async (event) => {
    event.preventDefault();
    if (!templateForm.file) {
      setError('Select the template file.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await fetchJson('/painting-competition/admin/templates', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          label: templateForm.label,
          sortOrder: Number(templateForm.sortOrder),
          fileName: templateForm.file.name,
          data: await fileToBase64(templateForm.file),
        }),
      });
      setTemplateForm({ label: '', sortOrder: 0, file: null });
      setMessage('Age-group template uploaded.');
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      event.target.reset();
    }
  };

  const toggleTemplate = async (template) => {
    setError('');
    try {
      await fetchJson(`/painting-competition/admin/templates/${encodeURIComponent(template.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ active: !template.active }),
      });
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteTemplate = async (template) => {
    if (!window.confirm(`Delete ${template.label}?`)) return;
    setError('');
    try {
      await fetchJson(`/painting-competition/admin/templates/${encodeURIComponent(template.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessage('Template deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openSubmission = async (submission) => {
    setSelected({ ...submission });
    setError('');
    setArtworkRotation(0);
    setShowExplorerDetails(false);
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    setArtworkUrl('');
    try {
      const response = await fetch(
        `${API_URL}/painting-competition/admin/submissions/${encodeURIComponent(submission.id)}/artwork`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Could not load artwork.');
      }
      setArtworkUrl(URL.createObjectURL(await response.blob()));
    } catch (err) {
      setError(err.message);
    }
  };

  const closeSubmission = () => {
    setSelected(null);
    setArtworkRotation(0);
    setShowExplorerDetails(false);
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
    setArtworkUrl('');
  };

  const openAdjacentSubmission = (direction) => {
    if (selectedIndex < 0) return;
    const nextSubmission = filteredSubmissions[selectedIndex + direction];
    if (nextSubmission) openSubmission(nextSubmission);
  };

  const rotateArtwork = (degrees) => {
    setArtworkRotation((current) => (current + degrees + 360) % 360);
  };

  const downloadArtwork = () => {
    if (!artworkUrl || !selected) return;
    const link = document.createElement('a');
    link.href = artworkUrl;
    link.download = selected.artworkFileName || `${selected.childName || 'painting'}-artwork.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const saveJudging = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await fetchJson(`/painting-competition/admin/submissions/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: selected.status, judgingNotes: selected.judgingNotes }),
      });
      setSelected(result);
      setSubmissions((current) => current.map((item) => (item.id === result.id ? result : item)));
      setMessage('Judging decision saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSubmission = async (submission = selected) => {
    if (!isAdmin) {
      setError('Only administrators can delete painting submissions.');
      return;
    }
    if (!submission) return;
    if (!window.confirm(`Delete the submission for ${submission.childName}? This also deletes the artwork file.`)) return;
    setSaving(true);
    setError('');
    try {
      await fetchJson(`/painting-competition/admin/submissions/${encodeURIComponent(submission.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (selected?.id === submission.id) closeSubmission();
      setMessage('Submission deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!canJudgePainting) {
    return (
      <main className="page-shell admin-page">
        <SiteNav />
        <section className="auth-card">
          <h1>Painting judging access required</h1>
          <p>Log in as an administrator or painting judge to review submissions.</p>
          <Link className="btn btn-primary" to="/login">Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page painting-admin-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Painting competition</h1>
          <p>{isAdmin ? 'Publish templates, control entries and review submitted artwork.' : 'Review submitted artwork and save judging decisions.'}</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/onam-painting-competition">View public page</Link>
          {isAdmin && <Link className="btn btn-secondary" to="/admin/surveys">Back to admin</Link>}
        </div>
      </section>

      {(message || error) && (
        <section className="message-card">
          {message && <p>{message}</p>}
          {error && <p className="error-message">{error}</p>}
        </section>
      )}

      {loading && <section className="empty-state"><p>Loading competition data...</p></section>}

      {config && (
        <>
          {isAdmin && (
          <section className="admin-panel">
            <div className="panel-header">
              <div>
                <h2>Competition settings</h2>
                <p>Set the public status and the instructions shown in the painting guidance step.</p>
              </div>
              <span className={`status-pill ${config.status === 'open' ? 'active' : 'inactive'}`}>{config.status}</span>
            </div>

            <form className="compact-form painting-config-form" onSubmit={saveConfig}>
              <div className="form-grid-two">
                <label>
                  <span>Title</span>
                  <input value={config.title || ''} onChange={(event) => updateConfig('title', event.target.value)} required />
                </label>
                <label>
                  <span>Status</span>
                  <select value={config.status || 'draft'} onChange={(event) => updateConfig('status', event.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="open">Open for entries</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Subtitle</span>
                <input value={config.subtitle || ''} onChange={(event) => updateConfig('subtitle', event.target.value)} />
              </label>
              <div className="form-grid-two">
                <label>
                  <span>Event date</span>
                  <input type="date" value={config.eventDate || ''} onChange={(event) => updateConfig('eventDate', event.target.value)} />
                </label>
                <label>
                  <span>Venue</span>
                  <input value={config.venue || ''} onChange={(event) => updateConfig('venue', event.target.value)} />
                </label>
              </div>
              <label>
                <span>Painting instructions <small>One instruction per line</small></span>
                <textarea rows="7" value={instructionsText} onChange={(event) => setInstructionsText(event.target.value)} required />
              </label>
              <label>
                <span>Parent consent statement</span>
                <textarea rows="3" value={config.consentText || ''} onChange={(event) => updateConfig('consentText', event.target.value)} required />
              </label>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button>
            </form>
          </section>
          )}

          {isAdmin && (
          <section className="admin-panel">
            <div className="panel-header">
              <div>
                <h2>Under 5 colouring templates</h2>
                <p>Only the Under 5 group uses a template. Upload a PDF, JPG or PNG file up to 4 MB.</p>
              </div>
            </div>

            <form className="painting-template-form" onSubmit={uploadTemplate}>
              <label>
                <span>Template label</span>
                <input
                  value={templateForm.label}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Example: Junior template"
                  required
                />
              </label>
              <label>
                <span>Order</span>
                <input
                  type="number"
                  value={templateForm.sortOrder}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, sortOrder: event.target.value }))}
                />
              </label>
              <label>
                <span>Template file</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf,.jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={(event) => setTemplateForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  required
                />
                <small>PDF, JPG or PNG only. Maximum file size: 4 MB.</small>
              </label>
              <button className="btn btn-primary" type="submit" disabled={saving}>Upload template</button>
            </form>

            <div className="painting-admin-list painting-template-list">
              {templates.map((template) => (
                <article className="painting-admin-card painting-template-card" key={template.id}>
                  <div className="painting-admin-card-main">
                    <div>
                      <span>Age group</span>
                      <strong>{template.ageGroup}</strong>
                    </div>
                    <div>
                      <span>Template</span>
                      <strong>{template.label}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <span className={`status-pill ${template.active ? 'active' : 'inactive'}`}>{template.active ? 'Published' : 'Hidden'}</span>
                    </div>
                  </div>
                  <div className="table-actions painting-card-actions">
                    <a
                      className="btn btn-secondary"
                      href={`${API_URL}/painting-competition/templates/${encodeURIComponent(template.id)}/download`}
                    >
                      Download
                    </a>
                    <button className="btn btn-secondary" type="button" onClick={() => toggleTemplate(template)}>
                      {template.active ? 'Hide' : 'Publish'}
                    </button>
                    <button className="btn btn-danger" type="button" onClick={() => deleteTemplate(template)}>Delete</button>
                  </div>
                </article>
              ))}
              {templates.length === 0 && <p className="empty-inline">No age-group templates uploaded.</p>}
            </div>
          </section>
          )}

          <section className="admin-panel painting-submissions-panel">
            <div className="panel-header">
              <div>
                <h2>Submitted paintings</h2>
                <p>Artwork remains private and is fetched only after admin authentication.</p>
              </div>
              <strong>{submissions.length} entries</strong>
            </div>

            <div className="table-toolbar">
              <label className="member-search">
                <span>Search entries</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Child, guardian, age group..."
                />
              </label>
              <label className="page-size-control">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All</option>
                  <option value="submitted">Submitted</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="winner">Winner</option>
                  <option value="not_selected">Not selected</option>
                </select>
              </label>
            </div>

            <div className="painting-admin-list painting-submission-list">
              {filteredSubmissions.map((submission) => (
                <article
                  key={submission.id}
                  className="painting-admin-card painting-submission-card"
                  onClick={() => openSubmission(submission)}
                  tabIndex="0"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openSubmission(submission);
                    }
                  }}
                >
                  <div className="painting-admin-card-main">
                    <div>
                      <span>Child</span>
                      <strong>{submission.childName}</strong>
                      {submission.childAge != null && <small>Age {submission.childAge}</small>}
                    </div>
                    <div>
                      <span>Age group</span>
                      <strong>{submission.ageGroup}</strong>
                      {submission.activityType && <small>{submission.activityType}</small>}
                      {submission.templateLabel && <small>Template: {submission.templateLabel}</small>}
                    </div>
                    <div>
                      <span>Parent</span>
                      <strong>{submission.parentName}</strong>
                      {submission.parentPhone && <small>{submission.parentPhone}</small>}
                    </div>
                    <div>
                      <span>Submitted</span>
                      <strong>{formatDateTime(submission.submittedAt)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <span className={`status-pill ${submission.status === 'winner' ? 'active' : 'inactive'}`}>{submission.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="table-actions painting-card-actions" onClick={(event) => event.stopPropagation()}>
                    <button className="btn btn-secondary" type="button" onClick={() => openSubmission(submission)}>View</button>
                    {isAdmin && (
                      <button className="btn btn-danger" type="button" onClick={() => deleteSubmission(submission)} disabled={saving}>Delete</button>
                    )}
                  </div>
                </article>
              ))}
              {filteredSubmissions.length === 0 && <p className="empty-inline">No submissions found.</p>}
            </div>
          </section>
        </>
      )}

      {selected && (
        <div className="modal-backdrop analytics-modal-backdrop painting-explorer-backdrop" role="presentation" onClick={closeSubmission}>
          <section className="analytics-modal painting-judging-modal painting-photo-explorer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="painting-explorer-topbar">
              <div>
                <p className="eyebrow">Judging review</p>
                <h2>{selected.childName}</h2>
                <p>{selected.ageGroup} · {String(selected.status || 'submitted').replace('_', ' ')}</p>
              </div>
              <div className="painting-explorer-topbar-actions">
                <button className="btn btn-secondary" type="button" onClick={() => openAdjacentSubmission(-1)} disabled={!canGoPrevious}>Previous</button>
                <button className="btn btn-secondary" type="button" onClick={() => openAdjacentSubmission(1)} disabled={!canGoNext}>Next</button>
                <button className="btn btn-secondary painting-details-toggle" type="button" onClick={() => setShowExplorerDetails((current) => !current)}>
                  {showExplorerDetails ? 'Hide details' : 'Details'}
                </button>
                <button className="modal-close" type="button" onClick={closeSubmission} aria-label="Close">x</button>
              </div>
            </div>

            <div className="painting-judging-grid">
              <div className="painting-preview-panel">
                <div className="painting-preview-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => rotateArtwork(-90)} disabled={!artworkUrl}>Rotate left</button>
                  <button className="btn btn-secondary" type="button" onClick={() => rotateArtwork(90)} disabled={!artworkUrl}>Rotate right</button>
                  <button className="btn btn-secondary" type="button" onClick={() => setArtworkRotation(0)} disabled={!artworkUrl || artworkRotation === 0}>Reset</button>
                  <button className="btn btn-primary" type="button" onClick={downloadArtwork} disabled={!artworkUrl}>Download</button>
                </div>
                <div className={`painting-private-preview ${artworkRotation % 180 !== 0 ? 'is-rotated' : ''}`}>
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={`Painting submitted by ${selected.childName}`}
                      style={{ transform: `rotate(${artworkRotation}deg)` }}
                    />
                  ) : (
                    <p>Loading private artwork...</p>
                  )}
                </div>
              </div>
              <div className={`painting-entry-details painting-explorer-details ${showExplorerDetails ? 'is-open' : ''}`}>
                <div className="painting-details-mobile-header">
                  <div>
                    <p className="eyebrow">Entry details</p>
                    <h3>{selected.childName}</h3>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => setShowExplorerDetails(false)}>Close</button>
                </div>
                <p>
                  <span>Child</span>
                  <strong>{selected.childName}{selected.childAge != null ? `, age ${selected.childAge}` : ''}</strong>
                </p>
                <p><span>Age group</span><strong>{selected.ageGroup}</strong></p>
                {selected.activityType && <p><span>Entry type</span><strong>{selected.activityType}</strong></p>}
                {selected.templateLabel && <p><span>Template</span><strong>{selected.templateLabel}</strong></p>}
                <p><span>Parent</span><strong>{selected.parentName}</strong></p>
                {selected.parentPhone && <p><span>Phone</span><strong>{selected.parentPhone}</strong></p>}
                {selected.parentEmail && <p><span>Email</span><strong>{selected.parentEmail}</strong></p>}
                <p><span>Submitted</span><strong>{formatDateTime(selected.submittedAt)}</strong></p>
                <label>
                  <span>Judging status</span>
                  <select value={selected.status} onChange={(event) => setSelected((current) => ({ ...current, status: event.target.value }))}>
                    <option value="submitted">Submitted</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="winner">Winner</option>
                    <option value="not_selected">Not selected</option>
                  </select>
                </label>
                <label>
                  <span>Private judging notes</span>
                  <textarea
                    rows="6"
                    value={selected.judgingNotes || ''}
                    onChange={(event) => setSelected((current) => ({ ...current, judgingNotes: event.target.value }))}
                  />
                </label>
                <div className="modal-actions">
                  <button className="btn btn-primary" type="button" onClick={saveJudging} disabled={saving}>Save decision</button>
                  {isAdmin && <button className="btn btn-danger" type="button" onClick={deleteSubmission} disabled={saving}>Delete entry</button>}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminPaintingCompetition;
