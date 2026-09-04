import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson, authHeaders } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import FormattedText from '../components/FormattedText.jsx';

const emptyPost = {
  slug: '',
  title: '',
  excerpt: '',
  body: '',
  author: 'Wyndham Tuskers Committee',
  category: 'Club news',
  coverImageUrl: '',
  supportingPhotos: [],
  status: 'published',
  publishedAt: new Date().toISOString().slice(0, 16),
};

const formatDate = (value) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleDateString();
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

function AdminNews() {
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState(emptyPost);
  const [editingSlug, setEditingSlug] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const role = localStorage.getItem('role');

  const sortedPosts = useMemo(() => [...posts].sort((a, b) => (
    new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0)
  )), [posts]);

  const loadPosts = async () => {
    try {
      const data = await fetchJson('/news/all', { headers: authHeaders() });
      setPosts(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      loadPosts();
    }
  }, [role]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const uploadPhoto = async (file) => {
    const data = await fileToBase64(file);
    const result = await fetchJson('/news/uploads', {
      method: 'POST',
      headers: { ...authHeaders() },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        data,
      }),
    });
    return result.url;
  };

  const uploadCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      updateField('coverImageUrl', url);
      setMessage('Cover photo uploaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const uploadSupportingPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => ({
        url: await uploadPhoto(file),
        caption: '',
      })));
      setForm((current) => ({
        ...current,
        supportingPhotos: [...(current.supportingPhotos || []), ...uploaded],
      }));
      setMessage('Supporting photos uploaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const savePost = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : new Date().toISOString(),
      };
      await fetchJson(editingSlug ? `/news/${editingSlug}` : '/news', {
        method: editingSlug ? 'PATCH' : 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(payload),
      });
      setForm(emptyPost);
      setEditingSlug('');
      setMessage(editingSlug ? 'Club news post updated.' : 'Club news post published.');
      loadPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const editPost = (post) => {
    setEditingSlug(post.slug);
    setForm({
      ...emptyPost,
      ...post,
      supportingPhotos: post.supportingPhotos || [],
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : emptyPost.publishedAt,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePost = async (slug) => {
    if (!window.confirm('Delete this club news post?')) return;
    setError('');
    setMessage('');
    try {
      await fetchJson(`/news/${slug}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      setMessage('Club news post deleted.');
      loadPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeSupportingPhoto = (index) => {
    setForm((current) => ({
      ...current,
      supportingPhotos: current.supportingPhotos.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  if (role !== 'admin') {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Club news</p>
          <h1>Admin access required</h1>
          <Link className="btn btn-primary" to="/login">Admin Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page admin-news-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Club news</h1>
          <p>Create, publish and update news articles for the public Club News page.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/admin/surveys">Back to admin portal</Link>
          <Link className="btn btn-primary" to="/club-news">View club news</Link>
        </div>
      </section>

      {(message || error) && (
        <div className="message-card">
          {message && <p>{message}</p>}
          {error && <p>{error}</p>}
        </div>
      )}

      <section className="admin-panel news-editor-panel">
        <div className="panel-header">
          <div>
            <h2>{editingSlug ? 'Edit article' : 'Create article'}</h2>
            <p>Use simple formatting in the body: **bold**, *italic*, blank lines and bullet lists.</p>
          </div>
          {editingSlug && (
            <button className="btn btn-ghost" type="button" onClick={() => { setEditingSlug(''); setForm(emptyPost); }}>
              New article
            </button>
          )}
        </div>

        <form className="compact-form news-editor-form" onSubmit={savePost}>
          <div className="form-grid-two">
            <label>
              Title
              <input value={form.title} onChange={(event) => updateField('title', event.target.value)} required />
            </label>
            <label>
              Slug
              <input value={form.slug} onChange={(event) => updateField('slug', event.target.value)} placeholder="auto-created from title" />
            </label>
          </div>

          <div className="form-grid-two">
            <label>
              Author
              <input value={form.author} onChange={(event) => updateField('author', event.target.value)} />
            </label>
            <label>
              Category
              <input value={form.category} onChange={(event) => updateField('category', event.target.value)} />
            </label>
          </div>

          <label>
            Short excerpt
            <textarea value={form.excerpt} onChange={(event) => updateField('excerpt', event.target.value)} required />
          </label>

          <label>
            Article body
            <textarea className="news-body-input" value={form.body} onChange={(event) => updateField('body', event.target.value)} required />
          </label>

          <div className="form-grid-two">
            <label>
              Publish date
              <input type="datetime-local" value={form.publishedAt} onChange={(event) => updateField('publishedAt', event.target.value)} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
          </div>

          <div className="photo-upload-grid">
            <label>
              Cover photo
              <input type="file" accept="image/*" onChange={uploadCover} disabled={uploading} />
            </label>
            <label>
              Cover photo URL
              <input value={form.coverImageUrl} onChange={(event) => updateField('coverImageUrl', event.target.value)} required />
            </label>
          </div>

          <label>
            Supporting photos
            <input type="file" accept="image/*" multiple onChange={uploadSupportingPhotos} disabled={uploading} />
          </label>

          {form.supportingPhotos?.length > 0 && (
            <div className="supporting-photo-admin-grid">
              {form.supportingPhotos.map((photo, index) => (
                <article key={`${photo.url}-${index}`}>
                  <img src={photo.url} alt="" />
                  <input
                    value={photo.caption || ''}
                    onChange={(event) => {
                      const caption = event.target.value;
                      setForm((current) => ({
                        ...current,
                        supportingPhotos: current.supportingPhotos.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, caption } : item
                        )),
                      }));
                    }}
                    placeholder="Caption"
                  />
                  <button className="btn btn-ghost" type="button" onClick={() => removeSupportingPhoto(index)}>Remove</button>
                </article>
              ))}
            </div>
          )}

          <div className="article-preview">
            <span className="eyebrow">Preview</span>
            <h3>{form.title || 'Article title'}</h3>
            <FormattedText text={form.body || 'Article body preview appears here.'} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : editingSlug ? 'Update article' : 'Publish article'}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <div>
            <h2>Articles</h2>
            <p>Published articles appear on the Club News page.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Status</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPosts.map((item) => (
                <tr key={item.slug}>
                  <td><strong>{item.title}</strong><span>{item.slug}</span></td>
                  <td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
                  <td>{formatDate(item.publishedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => editPost(item)}>Edit</button>
                      {item.status === 'published' && <Link className="btn btn-secondary" to={`/club-news/${item.slug}`}>Open</Link>}
                      <button className="btn btn-ghost" type="button" onClick={() => deletePost(item.slug)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedPosts.length === 0 && (
                <tr>
                  <td colSpan="4">No club news articles yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default AdminNews;
