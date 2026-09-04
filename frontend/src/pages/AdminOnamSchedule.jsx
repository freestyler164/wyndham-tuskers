import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import logoUrl from '../public/static/logos/wt_logo.png';

const DEFAULT_ITEM_FORM = {
  timeLabel: '',
  title: '',
  location: '',
  description: '',
  entryId: '',
  programType: '',
  duration: '',
  contactPerson: '',
  mobile: '',
  ageGroup: '',
  performanceFormat: '',
  teamName: '',
  choreographer: '',
  participants: '',
  status: 'upcoming',
  published: true,
};

const emptyConfig = {
  title: 'Onam 2026',
  eyebrow: 'Wyndham Tuskers presents',
  description: '',
  eventDate: '2026-08-08',
  venue: 'Bacchus Marsh Public Hall',
  eventStatus: 'upcoming',
  published: false,
  menuLabel: 'Onam 2026',
  bannerImageUrl: '',
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

function AdminOnamSchedule() {
  const [config, setConfig] = useState(emptyConfig);
  const [items, setItems] = useState([]);
  const [itemForm, setItemForm] = useState(DEFAULT_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const role = localStorage.getItem('role');
  const scopes = JSON.parse(localStorage.getItem('scopes') || '[]');
  const canManage = role === 'admin' || (role === 'guest' && scopes.includes('onam-schedule:manage'));
  const isAdmin = role === 'admin';

  const sortedItems = useMemo(() => [...items].sort((a, b) => (
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.timeLabel || '').localeCompare(String(b.timeLabel || ''))
  )), [items]);

  const loadSchedule = async () => {
    setError('');
    try {
      const data = await fetchJson('/onam-schedule/admin', { headers: authHeaders() });
      setConfig({ ...emptyConfig, ...data.config });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) loadSchedule();
    else setLoading(false);
  }, [canManage]);

  const updateConfigField = (field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const updateItemFormField = (field, value) => {
    setItemForm((current) => ({ ...current, [field]: value }));
  };

  const openCreateModal = () => {
    setEditingItemId('');
    setItemForm(DEFAULT_ITEM_FORM);
    setShowItemModal(true);
  };

  const openEditModal = (item) => {
    setEditingItemId(item.id);
    setItemForm({
      ...DEFAULT_ITEM_FORM,
      ...item,
      published: item.published !== false,
    });
    setShowItemModal(true);
  };

  const closeItemModal = () => {
    setShowItemModal(false);
    setEditingItemId('');
    setItemForm(DEFAULT_ITEM_FORM);
  };

  const saveConfig = async (event) => {
    event?.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchJson('/onam-schedule/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(config),
      });
      setConfig({ ...emptyConfig, ...result });
      setMessage('Onam schedule header saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadBanner = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const data = await fileToBase64(file);
      const uploadResult = await fetchJson('/onam-schedule/admin/uploads', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          data,
        }),
      });
      const nextConfig = { ...config, bannerImageUrl: uploadResult.url };
      const saved = await fetchJson('/onam-schedule/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(nextConfig),
      });
      setConfig({ ...emptyConfig, ...saved });
      setMessage('Onam banner image uploaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const publishSchedule = async (published) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchJson(`/onam-schedule/admin/${published ? 'publish' : 'unpublish'}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      setConfig({ ...emptyConfig, ...result });
      setMessage(published ? 'Onam schedule published.' : 'Onam schedule hidden from the public menu.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEvent = async () => {
    const nextConfig = { ...config, eventStatus: 'live' };
    setConfig(nextConfig);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchJson('/onam-schedule/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(nextConfig),
      });
      setConfig({ ...emptyConfig, ...result });
      setMessage('Onam event marked live.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const completeEvent = async () => {
    if (!window.confirm('Mark the Onam event as completed and hide the public schedule?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await fetchJson('/onam-schedule/admin/complete', {
        method: 'POST',
        headers: authHeaders(),
      });
      setConfig({ ...emptyConfig, ...result });
      setMessage('Onam event completed and hidden from the public menu.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingItemId) {
        const existing = items.find((item) => item.id === editingItemId) || {};
        const result = await fetchJson(`/onam-schedule/admin/items/${encodeURIComponent(editingItemId)}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ ...existing, ...itemForm }),
        });
        setItems((current) => current.map((entry) => (entry.id === editingItemId ? result : entry)));
        setMessage('Schedule item updated.');
      } else {
        const sortOrder = sortedItems.length
          ? Math.max(...sortedItems.map((item) => Number(item.sortOrder || 0))) + 10
          : 10;
        await fetchJson('/onam-schedule/admin/items', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ...itemForm, sortOrder }),
        });
        setMessage('Schedule item added.');
        await loadSchedule();
      }
      closeItemModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateItem = async (item, updates) => {
    setError('');
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...updates } : entry)));
    try {
      const result = await fetchJson(`/onam-schedule/admin/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ ...item, ...updates }),
      });
      setItems((current) => current.map((entry) => (entry.id === item.id ? result : entry)));
    } catch (err) {
      setError(err.message);
    }
  };

  const moveItem = async (item, direction) => {
    const index = sortedItems.findIndex((entry) => entry.id === item.id);
    const swapWith = sortedItems[index + direction];
    if (!swapWith) return;
    await Promise.all([
      updateItem(item, { sortOrder: swapWith.sortOrder }),
      updateItem(swapWith, { sortOrder: item.sortOrder }),
    ]);
    await loadSchedule();
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete ${item.title}?`)) return;
    setError('');
    setMessage('');
    try {
      await fetchJson(`/onam-schedule/admin/items/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessage('Schedule item deleted.');
      await loadSchedule();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!canManage) {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Onam schedule</p>
          <h1>Access required</h1>
          <p>Log in as an administrator or Onam schedule manager to update the live schedule.</p>
          <Link className="btn btn-primary" to="/login">Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page onam-schedule-admin-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Onam event scheduler</h1>
          <p>Manage the full program sheet. Only time, title, location and optional public description appear on the public page.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/onam-2026?preview=1">Preview public page</Link>
          <Link className="btn btn-secondary" to="/onam-2026">View public page</Link>
          {isAdmin && <Link className="btn btn-secondary" to="/admin/surveys">Back to admin</Link>}
        </div>
      </section>

      {(message || error) && (
        <section className="message-card">
          {message && <p>{message}</p>}
          {error && <p className="error-message">{error}</p>}
        </section>
      )}

      {loading ? (
        <section className="empty-state"><p>Loading Onam schedule...</p></section>
      ) : (
        <>
          <section className="admin-panel onam-config-panel">
            <div className="panel-header">
              <div>
                <h2>Header and publishing</h2>
                <p>These details control the public Onam 2026 page and menu visibility.</p>
              </div>
              <span className={`status-pill ${config.published ? 'active' : 'inactive'}`}>
                {config.published ? 'Published' : 'Hidden'}
              </span>
            </div>

            <form className="compact-form onam-config-form" onSubmit={saveConfig}>
              <div className="form-grid-two">
                <label>
                  <span>Eyebrow</span>
                  <input value={config.eyebrow || ''} onChange={(event) => updateConfigField('eyebrow', event.target.value)} />
                </label>
                <label>
                  <span>Menu label</span>
                  <input value={config.menuLabel || ''} onChange={(event) => updateConfigField('menuLabel', event.target.value)} />
                </label>
              </div>
              <label>
                <span>Title</span>
                <input value={config.title || ''} onChange={(event) => updateConfigField('title', event.target.value)} required />
              </label>
              <label>
                <span>Description</span>
                <textarea value={config.description || ''} onChange={(event) => updateConfigField('description', event.target.value)} rows="4" />
              </label>
              <div className="photo-upload-grid onam-banner-upload-grid">
                <label>
                  <span>Banner image</span>
                  <input type="file" accept="image/png,image/jpeg" onChange={uploadBanner} disabled={uploading || saving} />
                </label>
                <label>
                  <span>Banner image URL</span>
                  <input value={config.bannerImageUrl || ''} onChange={(event) => updateConfigField('bannerImageUrl', event.target.value)} placeholder="/static/photos/onam-schedule/banner.jpg" />
                </label>
              </div>
              {config.bannerImageUrl && (
                <div className="onam-banner-preview">
                  <img src={config.bannerImageUrl} alt="" />
                  <button className="btn btn-ghost" type="button" onClick={() => updateConfigField('bannerImageUrl', '')}>Remove image</button>
                </div>
              )}
              <div className="form-grid-three">
                <label>
                  <span>Date</span>
                  <input type="date" value={config.eventDate || ''} onChange={(event) => updateConfigField('eventDate', event.target.value)} />
                </label>
                <label>
                  <span>Venue</span>
                  <input value={config.venue || ''} onChange={(event) => updateConfigField('venue', event.target.value)} />
                </label>
                <label>
                  <span>Event status</span>
                  <select value={config.eventStatus || 'upcoming'} onChange={(event) => updateConfigField('eventStatus', event.target.value)}>
                    <option value="upcoming">Upcoming</option>
                    <option value="live">Live Now</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
              </div>
              <div className="form-actions-row">
                <button className="btn btn-primary" type="submit" disabled={saving || uploading}>{uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save header'}</button>
                <button className="btn btn-secondary" type="button" onClick={startEvent} disabled={saving}>Start event</button>
                <button className="btn btn-secondary" type="button" onClick={completeEvent} disabled={saving}>Complete event</button>
                {config.published ? (
                  <button className="btn btn-secondary" type="button" onClick={() => publishSchedule(false)} disabled={saving}>Unpublish</button>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => publishSchedule(true)}
                    disabled={saving || config.eventStatus === 'completed'}
                    title={config.eventStatus === 'completed' ? 'Change event status before publishing again.' : undefined}
                  >
                    Publish schedule
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="admin-panel">
            <div className="panel-header">
              <div>
                <h2>Program schedule</h2>
                <p>{sortedItems.length} {sortedItems.length === 1 ? 'entry' : 'entries'} — contacts, participants and ops details are admin-only.</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={openCreateModal}>Add program</button>
            </div>

            <div className="onam-admin-list">
              {sortedItems.map((item, index) => (
                <article className="onam-admin-card" key={item.id}>
                  <div className="onam-admin-card-main">
                    <div className="onam-reorder-actions">
                      <button type="button" onClick={() => moveItem(item, -1)} disabled={index === 0} aria-label={`Move ${item.title} up`}>▲</button>
                      <button type="button" onClick={() => moveItem(item, 1)} disabled={index === sortedItems.length - 1} aria-label={`Move ${item.title} down`}>▼</button>
                    </div>
                    <div className="onam-admin-card-summary">
                      <div className="onam-admin-card-meta">
                        <strong>{item.timeLabel || 'Time TBA'}</strong>
                        {item.entryId && <span className="onam-entry-id">{item.entryId}</span>}
                        {item.programType && <span className="onam-program-type">{item.programType}</span>}
                        {item.duration && <span>{item.duration}</span>}
                      </div>
                      <h3>{item.title}</h3>
                      <p>
                        {[item.teamName, item.ageGroup, item.performanceFormat, item.contactPerson]
                          .filter(Boolean)
                          .join(' · ') || item.location || 'No ops details yet'}
                      </p>
                      {item.description && <p className="onam-admin-public-note">Public description set</p>}
                    </div>
                  </div>

                  <div className="onam-admin-card-controls">
                    <select
                      className="onam-admin-status"
                      value={item.status || 'upcoming'}
                      onChange={(event) => updateItem(item, { status: event.target.value })}
                      aria-label={`${item.title} status`}
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live Now</option>
                      <option value="completed">Completed</option>
                    </select>
                    <label className="switch-row onam-admin-visible">
                      <input
                        type="checkbox"
                        checked={item.published !== false}
                        onChange={(event) => updateItem(item, { published: event.target.checked })}
                      />
                      <span>{item.published !== false ? 'Visible' : 'Hidden'}</span>
                    </label>
                    <div className="row-actions onam-admin-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => openEditModal(item)}>Edit</button>
                      <button className="btn btn-ghost" type="button" onClick={() => deleteItem(item)}>Delete</button>
                    </div>
                  </div>

                  {(item.participants || item.choreographer || item.mobile) && (
                    <details className="onam-admin-card-details">
                      <summary>Ops details</summary>
                      {item.participants && <p><strong>Participants:</strong> {item.participants}</p>}
                      {item.choreographer && <p><strong>Choreographer:</strong> {item.choreographer}</p>}
                      {item.mobile && <p><strong>Mobile:</strong> {item.mobile}{item.contactPerson ? ` (${item.contactPerson})` : ''}</p>}
                    </details>
                  )}
                </article>
              ))}
              {sortedItems.length === 0 && <p className="muted-text">No schedule items yet.</p>}
            </div>
          </section>
        </>
      )}

      {showItemModal && (
        <div className="modal-backdrop" role="presentation" onClick={closeItemModal}>
          <section className="analytics-modal onam-item-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-brand">
                  <img src={logoUrl} alt="" />
                  <p className="eyebrow">Onam schedule</p>
                </div>
                <h2>{editingItemId ? 'Edit program' : 'Add program'}</h2>
              </div>
              <button className="btn btn-ghost" type="button" onClick={closeItemModal}>Close</button>
            </div>
            <form className="compact-form" onSubmit={saveItem}>
              <div className="form-grid-two">
                <label>
                  <span>Time</span>
                  <input value={itemForm.timeLabel} onChange={(event) => updateItemFormField('timeLabel', event.target.value)} placeholder="10:30 AM" required />
                </label>
                <label>
                  <span>Entry ID</span>
                  <input value={itemForm.entryId} onChange={(event) => updateItemFormField('entryId', event.target.value)} placeholder="T01" />
                </label>
              </div>
              <label>
                <span>Program name / title</span>
                <input value={itemForm.title} onChange={(event) => updateItemFormField('title', event.target.value)} required />
              </label>
              <div className="form-grid-three">
                <label>
                  <span>Program type</span>
                  <input value={itemForm.programType} onChange={(event) => updateItemFormField('programType', event.target.value)} placeholder="Dance, Song, MC" />
                </label>
                <label>
                  <span>Duration</span>
                  <input value={itemForm.duration} onChange={(event) => updateItemFormField('duration', event.target.value)} placeholder="8 min" />
                </label>
                <label>
                  <span>Location</span>
                  <input value={itemForm.location} onChange={(event) => updateItemFormField('location', event.target.value)} placeholder="Main Hall" />
                </label>
              </div>
              <div className="form-grid-three">
                <label>
                  <span>Age group</span>
                  <input value={itemForm.ageGroup} onChange={(event) => updateItemFormField('ageGroup', event.target.value)} placeholder="Kids" />
                </label>
                <label>
                  <span>Solo / Group</span>
                  <input value={itemForm.performanceFormat} onChange={(event) => updateItemFormField('performanceFormat', event.target.value)} placeholder="Solo, Duet, Group" />
                </label>
                <label>
                  <span>Team name</span>
                  <input value={itemForm.teamName} onChange={(event) => updateItemFormField('teamName', event.target.value)} />
                </label>
              </div>
              <div className="form-grid-two">
                <label>
                  <span>Contact person</span>
                  <input value={itemForm.contactPerson} onChange={(event) => updateItemFormField('contactPerson', event.target.value)} />
                </label>
                <label>
                  <span>Mobile</span>
                  <input value={itemForm.mobile} onChange={(event) => updateItemFormField('mobile', event.target.value)} />
                </label>
              </div>
              <label>
                <span>Choreographer</span>
                <input value={itemForm.choreographer} onChange={(event) => updateItemFormField('choreographer', event.target.value)} />
              </label>
              <label>
                <span>Participants</span>
                <textarea value={itemForm.participants} onChange={(event) => updateItemFormField('participants', event.target.value)} rows="3" />
              </label>
              <label>
                <span>Public description (optional)</span>
                <textarea
                  value={itemForm.description}
                  onChange={(event) => updateItemFormField('description', event.target.value)}
                  rows="4"
                  placeholder="Shown on the public schedule under this program. Leave blank to hide."
                />
              </label>
              <div className="form-grid-two">
                <label>
                  <span>Status</span>
                  <select value={itemForm.status} onChange={(event) => updateItemFormField('status', event.target.value)}>
                    <option value="upcoming">Upcoming</option>
                    <option value="live">Live Now</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={itemForm.published}
                    onChange={(event) => updateItemFormField('published', event.target.checked)}
                  />
                  <span>Show on the public schedule</span>
                </label>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingItemId ? 'Save program' : 'Add program'}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminOnamSchedule;
