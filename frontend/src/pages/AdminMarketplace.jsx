import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJson, authHeaders } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import logoUrl from '../public/static/logos/wt_logo.png';

const categories = [
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

const emptyBusiness = {
  id: '',
  name: '',
  category: 'Food & Catering',
  description: '',
  fullDescription: '',
  services: [],
  contactPerson: '',
  phone: '',
  email: '',
  website: '',
  whatsapp: '',
  logoUrl: '',
  bannerUrl: '',
  gallery: [],
  featured: false,
  active: true,
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

const servicesToText = (services) => (Array.isArray(services) ? services.join('\n') : '');
const textToServices = (value) => String(value || '')
  .split(/\r?\n|,/)
  .map((item) => item.trim())
  .filter(Boolean);

function AdminMarketplace() {
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState(emptyBusiness);
  const [servicesText, setServicesText] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const role = localStorage.getItem('role');

  const loadBusinesses = async () => {
    try {
      const data = await fetchJson('/marketplace/all', { headers: authHeaders() });
      setBusinesses(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      loadBusinesses();
    }
  }, [role]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return businesses.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!query) return true;
      return [
        item.name,
        item.category,
        item.description,
        item.contactPerson,
        ...(item.services || []),
      ].join(' ').toLowerCase().includes(query);
    });
  }, [businesses, category, search]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const openNewBusiness = () => {
    setEditingId('');
    setForm(emptyBusiness);
    setServicesText('');
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const editBusiness = (business) => {
    setEditingId(business.id);
    setForm({ ...emptyBusiness, ...business, gallery: business.gallery || [] });
    setServicesText(servicesToText(business.services));
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId('');
    setForm(emptyBusiness);
    setServicesText('');
  };

  const uploadPhoto = async (file) => {
    const data = await fileToBase64(file);
    const result = await fetchJson('/marketplace/uploads', {
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

  const uploadSingleImage = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      updateField(field, url);
      setMessage('Image uploaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const uploadGallery = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => ({
        url: await uploadPhoto(file),
        caption: '',
      })));
      setForm((current) => ({ ...current, gallery: [...(current.gallery || []), ...uploaded] }));
      setMessage('Gallery images uploaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const saveBusiness = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const payload = {
        ...form,
        services: textToServices(servicesText),
      };

      await fetchJson(editingId ? `/marketplace/${editingId}` : '/marketplace', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(payload),
      });

      setMessage(editingId ? 'Business listing updated.' : 'Business listing added.');
      closeForm();
      loadBusinesses();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteBusiness = async (business) => {
    if (!window.confirm(`Delete ${business.name}? This cannot be undone.`)) return;
    setError('');
    setMessage('');
    try {
      await fetchJson(`/marketplace/${business.id}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      setMessage('Business listing deleted.');
      loadBusinesses();
    } catch (err) {
      setError(err.message);
    }
  };

  const quickUpdate = async (business, changes) => {
    setError('');
    setMessage('');
    try {
      await fetchJson(`/marketplace/${business.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders() },
        body: JSON.stringify({ ...business, ...changes }),
      });
      setMessage('Business listing updated.');
      loadBusinesses();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeGalleryImage = (index) => {
    setForm((current) => ({
      ...current,
      gallery: current.gallery.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  if (role !== 'admin') {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Member Marketplace</p>
          <h1>Admin access required</h1>
          <Link className="btn btn-primary" to="/login">Admin Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page admin-marketplace-page">
      <SiteNav />

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Admin portal</p>
          <h1>Member Marketplace</h1>
          <p>Add and manage businesses owned by Wyndham Tuskers members and families.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="btn btn-secondary" to="/admin/surveys">Back to admin portal</Link>
          <Link className="btn btn-secondary" to="/marketplace">View marketplace</Link>
          <button className="btn btn-primary" type="button" onClick={openNewBusiness}>Add business</button>
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
            <h2>Business listings</h2>
            <p>Published active listings appear on the public marketplace page.</p>
          </div>
        </div>

        <div className="table-toolbar members-toolbar">
          <label className="member-search">
            <span>Search listings</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Business, category, contact..."
            />
          </label>
          <label className="page-size-control marketplace-filter-control">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="All">All</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><span>{item.description}</span></td>
                  <td>{item.category}</td>
                  <td>{item.contactPerson}</td>
                  <td>
                    <div className="status-stack">
                      <span className={`status-pill ${item.active ? 'active' : 'inactive'}`}>{item.active ? 'Active' : 'Hidden'}</span>
                      {item.featured && <span className="featured-badge">Featured</span>}
                    </div>
                  </td>
                  <td>{formatDate(item.updatedAt || item.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => editBusiness(item)}>Edit</button>
                      <button className="btn btn-secondary" type="button" onClick={() => quickUpdate(item, { active: !item.active })}>
                        {item.active ? 'Hide' : 'Publish'}
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => quickUpdate(item, { featured: !item.featured })}>
                        {item.featured ? 'Unfeature' : 'Feature'}
                      </button>
                      {item.active && <Link className="btn btn-secondary" to={`/marketplace/${item.id}`}>Open</Link>}
                      <button className="btn btn-ghost" type="button" onClick={() => deleteBusiness(item)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBusinesses.length === 0 && (
                <tr>
                  <td colSpan="6">No marketplace listings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" role="presentation" onClick={closeForm}>
          <section className="analytics-modal marketplace-admin-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-brand">
                  <img src={logoUrl} alt="" />
                  <p className="eyebrow">Member Marketplace</p>
                </div>
                <h2>{editingId ? 'Edit business' : 'Add business'}</h2>
                <p className="muted-text">Create a public listing for a member-owned business or family service.</p>
              </div>
              <button className="btn btn-ghost" type="button" onClick={closeForm}>Close</button>
            </div>

            <form className="compact-form marketplace-admin-form" onSubmit={saveBusiness}>
              <div className="form-grid-two">
                <label>
                  Business name
                  <input value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
                </label>
                <label>
                  Category
                  <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>

              <label>
                Short description
                <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} required />
              </label>

              <label>
                Full description
                <textarea className="news-body-input" value={form.fullDescription} onChange={(event) => updateField('fullDescription', event.target.value)} />
              </label>

              <label>
                Services offered
                <textarea value={servicesText} onChange={(event) => setServicesText(event.target.value)} placeholder="One service per line" />
              </label>

              <div className="form-grid-two">
                <label>
                  Contact person
                  <input value={form.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} required />
                </label>
                <label>
                  Phone
                  <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                </label>
              </div>

              <div className="form-grid-two">
                <label>
                  Email
                  <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                </label>
                <label>
                  WhatsApp number
                  <input value={form.whatsapp} onChange={(event) => updateField('whatsapp', event.target.value)} />
                </label>
              </div>

              <label>
                Website or social link
                <input value={form.website} onChange={(event) => updateField('website', event.target.value)} placeholder="https://..." />
              </label>

              <div className="photo-upload-grid">
                <label>
                  Logo
                  <input type="file" accept="image/*" onChange={(event) => uploadSingleImage(event, 'logoUrl')} disabled={uploading} />
                </label>
                <label>
                  Logo URL
                  <input value={form.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} />
                </label>
              </div>

              <div className="photo-upload-grid">
                <label>
                  Banner image
                  <input type="file" accept="image/*" onChange={(event) => uploadSingleImage(event, 'bannerUrl')} disabled={uploading} />
                </label>
                <label>
                  Banner URL
                  <input value={form.bannerUrl} onChange={(event) => updateField('bannerUrl', event.target.value)} />
                </label>
              </div>

              <label>
                Gallery images
                <input type="file" accept="image/*" multiple onChange={uploadGallery} disabled={uploading} />
              </label>

              {form.gallery?.length > 0 && (
                <div className="supporting-photo-admin-grid">
                  {form.gallery.map((photo, index) => (
                    <article key={`${photo.url}-${index}`}>
                      <img src={photo.url} alt="" />
                      <input
                        value={photo.caption || ''}
                        onChange={(event) => {
                          const caption = event.target.value;
                          setForm((current) => ({
                            ...current,
                            gallery: current.gallery.map((item, itemIndex) => (
                              itemIndex === index ? { ...item, caption } : item
                            )),
                          }));
                        }}
                        placeholder="Caption"
                      />
                      <button className="btn btn-ghost" type="button" onClick={() => removeGalleryImage(index)}>Remove</button>
                    </article>
                  ))}
                </div>
              )}

              <div className="form-grid-two checkbox-grid">
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.featured} onChange={(event) => updateField('featured', event.target.checked)} />
                  <span>Feature this business</span>
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.active} onChange={(event) => updateField('active', event.target.checked)} />
                  <span>Show publicly</span>
                </label>
              </div>

              <button className="btn btn-primary" type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : editingId ? 'Update business' : 'Add business'}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminMarketplace;
