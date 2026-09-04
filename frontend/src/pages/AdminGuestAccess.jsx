import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';

const DEFAULT_FORM = {
  purpose: 'painting-judge',
  fullName: 'Painting Judge Guest',
  expiresInHours: 168,
  username: '',
  password: '',
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-AU') : '-');
const formatScopes = (scopes) => (Array.isArray(scopes) && scopes.length ? scopes.join(', ') : '-');

function AdminGuestAccess() {
  const [guests, setGuests] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [createdGuest, setCreatedGuest] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const role = localStorage.getItem('role');

  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return guests;
    return guests.filter((guest) => [
      guest.username,
      guest.email,
      guest.fullName,
      guest.guestPurpose,
      formatScopes(guest.scopes),
      guest.active ? 'active' : 'expired',
    ].join(' ').toLowerCase().includes(query));
  }, [guests, search]);

  const loadGuests = async () => {
    setError('');
    try {
      const data = await fetchJson('/auth/guests', { headers: authHeaders() });
      setGuests(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'admin') loadGuests();
    else setLoading(false);
  }, [role]);

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'purpose' && !current.username && !current.password
        ? { fullName: value === 'onam-schedule-manager' ? 'Onam Schedule Guest' : 'Painting Judge Guest' }
        : {}),
    }));
  };

  const createGuest = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setCreatedGuest(null);

    try {
      const payload = {
        purpose: form.purpose,
        fullName: form.fullName,
        scopes: [form.purpose === 'onam-schedule-manager' ? 'onam-schedule:manage' : 'painting:judge'],
        expiresInHours: Number(form.expiresInHours),
      };
      if (form.username.trim()) payload.username = form.username.trim();
      if (form.password) payload.password = form.password;

      const result = await fetchJson('/auth/guests', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      setCreatedGuest(result);
      setForm(DEFAULT_FORM);
      setMessage('Guest access created. Copy the password now; it cannot be shown again later.');
      await loadGuests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const revokeGuest = async (username) => {
    if (!window.confirm(`Revoke guest access for ${username}?`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await fetchJson(`/auth/guests/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessage('Guest access revoked.');
      await loadGuests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const copyCreatedGuest = async () => {
    if (!createdGuest) return;
    await navigator.clipboard.writeText([
      `Username: ${createdGuest.username}`,
      `Password: ${createdGuest.password}`,
      `Expires: ${formatDateTime(createdGuest.expiresAt)}`,
      `Access: ${formatScopes(createdGuest.scopes)}`,
    ].join('\n'));
    setMessage('Guest login details copied.');
  };

  if (role !== 'admin') {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Admin portal</p>
          <h1>Admin access required</h1>
          <p>Log in as an administrator to manage guest access.</p>
          <Link className="btn btn-primary" to="/login">Admin Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Guest access</h1>
          <p>Create short-lived users for limited admin functions, such as painting competition judging.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/admin/surveys">Back to admin</Link>
        </div>
      </section>

      {(message || error) && (
        <section className="message-card">
          {message && <p>{message}</p>}
          {error && <p className="error-message">{error}</p>}
        </section>
      )}

      {createdGuest && (
        <section className="admin-panel">
          <div className="panel-header">
            <div>
              <h2>New guest login</h2>
              <p>This password is shown once. Store it before leaving this page.</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={copyCreatedGuest}>Copy details</button>
          </div>
          <div className="registration-detail-grid">
            <article>
              <span>Username</span>
              <strong>{createdGuest.username}</strong>
            </article>
            <article>
              <span>Password</span>
              <strong>{createdGuest.password}</strong>
            </article>
            <article>
              <span>Access</span>
              <strong>{formatScopes(createdGuest.scopes)}</strong>
            </article>
            <article>
              <span>Expires</span>
              <strong>{formatDateTime(createdGuest.expiresAt)}</strong>
            </article>
          </div>
        </section>
      )}

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Create guest access</h2>
            <p>Select a limited access purpose. Leave username and password blank to generate them.</p>
          </div>
        </div>
        <form className="compact-form admin-create-form" onSubmit={createGuest}>
          <div className="form-grid-two">
            <label>
              <span>Purpose</span>
              <select value={form.purpose} onChange={(event) => updateForm('purpose', event.target.value)}>
                <option value="painting-judge">Painting judge</option>
                <option value="onam-schedule-manager">Onam schedule manager</option>
              </select>
            </label>
            <label>
              <span>Expiry</span>
              <select value={form.expiresInHours} onChange={(event) => updateForm('expiresInHours', event.target.value)}>
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
                <option value={336}>14 days</option>
                <option value={720}>30 days</option>
              </select>
            </label>
          </div>
          <label>
            <span>Display name</span>
            <input value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} required />
          </label>
          <div className="form-grid-two">
            <label>
              <span>Username <small>Optional</small></span>
              <input
                value={form.username}
                onChange={(event) => updateForm('username', event.target.value)}
                placeholder="Auto-generated if blank"
              />
            </label>
            <label>
              <span>Password <small>Optional</small></span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateForm('password', event.target.value)}
                placeholder="Auto-generated if blank"
              />
            </label>
          </div>
          <p className="muted-text">Use a short, unique username, or leave it blank to generate one automatically.</p>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create guest access'}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Guest users</h2>
            <p>Short-lived users with scoped access. Revoke access by deleting the guest record.</p>
          </div>
          <strong>{guests.length} guests</strong>
        </div>
        <div className="table-toolbar members-toolbar">
          <label className="member-search">
            <span>Search guests</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Username, purpose, scope..."
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Purpose</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGuests.map((guest) => (
                <tr key={guest.email}>
                  <td>
                    <strong>{guest.fullName || guest.username || guest.email}</strong>
                    <span>{guest.username || guest.email}</span>
                  </td>
                  <td>{guest.guestPurpose || '-'}</td>
                  <td>{formatScopes(guest.scopes)}</td>
                  <td><span className={`status-pill ${guest.active ? 'active' : 'inactive'}`}>{guest.active ? 'Active' : 'Expired'}</span></td>
                  <td>{formatDateTime(guest.expiresAt)}</td>
                  <td>{formatDateTime(guest.createdAt)}</td>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => revokeGuest(guest.username || guest.email)} disabled={saving}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredGuests.length === 0 && (
                <tr>
                  <td colSpan="7">{guests.length === 0 ? 'No guest users created yet.' : 'No guest users match your search.'}</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="7">Loading guest users...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default AdminGuestAccess;
