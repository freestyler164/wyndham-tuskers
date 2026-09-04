import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson, authHeaders } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const formatDate = (value) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
};

function AdminGallery() {
  const [photos, setPhotos] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [drafts, setDrafts] = useState({});
  const role = localStorage.getItem('role');

  const loadPhotos = async () => {
    try {
      const data = await fetchJson('/gallery/all', { headers: authHeaders() });
      setPhotos(data);
      setDrafts(Object.fromEntries(data.map((photo) => [photo.id, {
        caption: photo.caption || '',
        sortOrder: String(photo.sortOrder ?? 0),
        published: photo.published !== false,
      }])));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      loadPhotos();
    }
  }, [role]);

  const updateDraft = (id, field, value) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  };

  const uploadPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setError('');
    setMessage('');
    setUploading(true);
    try {
      let uploadedCount = 0;
      for (const file of files) {
        const data = await fileToBase64(file);
        await fetchJson('/gallery/uploads', {
          method: 'POST',
          headers: { ...authHeaders() },
          body: JSON.stringify({
            fileName: file.name,
            data,
            published: true,
            sortOrder: photos.length + uploadedCount,
          }),
        });
        uploadedCount += 1;
      }
      setMessage(uploadedCount === 1 ? 'Photo uploaded.' : `${uploadedCount} photos uploaded.`);
      await loadPhotos();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const savePhoto = async (photo) => {
    const draft = drafts[photo.id];
    if (!draft) return;

    setError('');
    setMessage('');
    setSavingId(photo.id);
    try {
      await fetchJson(`/gallery/${photo.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders() },
        body: JSON.stringify({
          caption: draft.caption,
          published: draft.published,
          sortOrder: Number(draft.sortOrder) || 0,
        }),
      });
      setMessage('Gallery photo updated.');
      await loadPhotos();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  };

  const deletePhoto = async (photo) => {
    if (!window.confirm('Delete this gallery photo? This cannot be undone.')) return;
    setError('');
    setMessage('');
    try {
      await fetchJson(`/gallery/${photo.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      setMessage('Gallery photo deleted.');
      await loadPhotos();
    } catch (err) {
      setError(err.message);
    }
  };

  if (role !== 'admin') {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Gallery</p>
          <h1>Admin access required</h1>
          <Link className="btn btn-primary" to="/login">Admin Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page admin-gallery-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Gallery</h1>
          <p>Upload photos for the public Gallery page. Published photos appear immediately.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/admin/surveys">Back to admin portal</Link>
          <Link className="btn btn-primary" to="/gallery">View gallery</Link>
        </div>
      </section>

      {(message || error) && (
        <div className="message-card">
          {message && <p>{message}</p>}
          {error && <p>{error}</p>}
        </div>
      )}

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Upload photos</h2>
            <p>JPG, PNG or HEIC up to 5 MB each. HEIC files are converted automatically.</p>
          </div>
        </div>
        <label className="gallery-upload-field">
          Choose photos
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={uploadPhotos}
            disabled={uploading}
          />
        </label>
        {uploading && <p className="muted-text">Uploading photos…</p>}
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Gallery photos</h2>
            <p>{photos.length} photo{photos.length === 1 ? '' : 's'} managed. Lower sort order appears first.</p>
          </div>
        </div>

        {photos.length > 0 ? (
          <div className="admin-gallery-grid">
            {photos.map((photo) => {
              const draft = drafts[photo.id] || {
                caption: '',
                sortOrder: '0',
                published: true,
              };
              return (
                <article key={photo.id} className="admin-gallery-card">
                  <img src={photo.url} alt={draft.caption || photo.originalFileName || 'Gallery photo'} />
                  <div className="admin-gallery-card-body">
                    <label>
                      Caption
                      <input
                        value={draft.caption}
                        onChange={(event) => updateDraft(photo.id, 'caption', event.target.value)}
                        placeholder="Optional caption"
                      />
                    </label>
                    <div className="form-grid-two">
                      <label>
                        Sort order
                        <input
                          type="number"
                          value={draft.sortOrder}
                          onChange={(event) => updateDraft(photo.id, 'sortOrder', event.target.value)}
                        />
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={draft.published}
                          onChange={(event) => updateDraft(photo.id, 'published', event.target.checked)}
                        />
                        Published
                      </label>
                    </div>
                    <p className="muted-text">Uploaded {formatDate(photo.createdAt)}</p>
                    <div className="row-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => savePhoto(photo)}
                        disabled={savingId === photo.id || uploading}
                      >
                        {savingId === photo.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => deletePhoto(photo)}
                        disabled={savingId === photo.id || uploading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted-text">No gallery photos yet. Upload the first ones above.</p>
        )}
      </section>
    </main>
  );
}

export default AdminGallery;
