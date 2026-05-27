import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, fetchJson, authHeaders } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';
import FormattedText from '../components/FormattedText.jsx';
import logoUrl from '../public/static/logos/wt_logo.png';

const chartColors = ['#c77757', '#6f8150', '#813d50', '#d6c5b7', '#2f3130', '#8d6d50'];

const formatDate = (value) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleDateString();
};

const formatFamily = (member) => {
  if (member.family) {
    const parts = [
      `${member.family.adults || 0} adults`,
      `${member.family.kidsUnder5 || 0} under 5`,
      `${member.family.kidsOver5 || 0} over 5`,
    ];
    return parts.join(', ');
  }
  return member.familyCount || '-';
};

const formatInterests = (member) => {
  const values = member.gamesInterested?.length
    ? member.gamesInterested
    : member.sportsNextYear?.length
    ? member.sportsNextYear
    : member.interests;
  return values?.length ? values.join(', ') : '-';
};

const buildChart = (totals) => {
  const entries = Object.entries(totals || {});
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return '#e5dfd8';

  let cursor = 0;
  const segments = entries.map(([value, count], index) => {
    const start = cursor;
    const end = cursor + (count / total) * 100;
    cursor = end;
    return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
  });

  return `conic-gradient(${segments.join(', ')})`;
};

const formatNumber = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function AdminSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [events, setEvents] = useState([]);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [members, setMembers] = useState([]);
  const [newEvent, setNewEvent] = useState({ title: '', eventDate: '', location: '', summary: '' });
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [fullResponses, setFullResponses] = useState(null);
  const [responsesError, setResponsesError] = useState('');
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [showResponses, setShowResponses] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(25);
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const role = localStorage.getItem('role');

  const activeSurveys = useMemo(
    () => [...surveys].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [surveys],
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => String(a.eventDate || '').localeCompare(String(b.eventDate || ''))),
    [events],
  );

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const sortedMembers = [...members].sort((a, b) => (
      String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || ''))
    ));

    if (!query) return sortedMembers;

    return sortedMembers.filter((member) => {
      const searchable = [
        member.fullName,
        member.email,
        member.phone,
        member.address,
        member.suburb,
        member.postcode,
        member.role,
        member.membershipStatus,
        member.membershipYear,
        member.previousMember ? 'previous member' : '',
        member.appliedBefore ? 'applied before' : '',
        member.indoorGamesSubscribed ? 'indoor games' : '',
        member.indoorGamesAlreadyMember ? 'indoor games member' : '',
        member.onamEoi ? 'onam eoi' : '',
        member.partner?.name,
        member.partner?.phone,
        formatFamily(member),
        formatInterests(member),
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [members, memberSearch]);

  const memberPageCount = Math.max(1, Math.ceil(filteredMembers.length / memberPageSize));
  const pagedMembers = useMemo(() => {
    const start = (memberPage - 1) * memberPageSize;
    return filteredMembers.slice(start, start + memberPageSize);
  }, [filteredMembers, memberPage, memberPageSize]);
  const memberRangeStart = filteredMembers.length === 0 ? 0 : (memberPage - 1) * memberPageSize + 1;
  const memberRangeEnd = Math.min(memberPage * memberPageSize, filteredMembers.length);
  const formatLocation = (member) => [member.suburb, member.postcode].filter(Boolean).join(' ') || member.address || 'Location not provided';

  const loadSurveys = async () => {
    try {
      const data = await fetchJson('/surveys/all', { headers: authHeaders() });
      setSurveys(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadPendingRegistrations = async () => {
    try {
      const data = await fetchJson('/auth/pending-registrations', { headers: authHeaders() });
      setPendingRegistrations(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadMembers = async () => {
    try {
      const data = await fetchJson('/auth/members', { headers: authHeaders() });
      setMembers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadEvents = async () => {
    try {
      const data = await fetchJson('/events/all', { headers: authHeaders() });
      setEvents(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (role === 'admin') {
      loadSurveys();
      loadEvents();
      loadPendingRegistrations();
      loadMembers();
    }
  }, [role]);

  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, memberPageSize]);

  useEffect(() => {
    if (memberPage > memberPageCount) {
      setMemberPage(memberPageCount);
    }
  }, [memberPage, memberPageCount]);

  const createEvent = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await fetchJson('/events', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(newEvent),
      });
      setNewEvent({ title: '', eventDate: '', location: '', summary: '' });
      setMessage('Event added.');
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  };

  const updateEventStatus = async (event, eventId, status) => {
    event.stopPropagation();
    setError('');
    try {
      await fetchJson(`/events/${eventId}`, {
        method: 'PATCH',
        headers: { ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteEvent = async (event, eventId) => {
    event.stopPropagation();
    if (!window.confirm('Delete this event?')) return;
    setError('');
    try {
      await fetchJson(`/events/${eventId}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  };

  const updateSurveyStatus = async (event, surveyId, status) => {
    event.stopPropagation();
    setError('');
    try {
      await fetchJson(`/surveys/${surveyId}`, {
        method: 'PATCH',
        headers: { ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      loadSurveys();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteSurvey = async (event, surveyId) => {
    event.stopPropagation();
    if (!window.confirm('Delete this survey? This cannot be undone.')) return;
    setError('');
    try {
      await fetchJson(`/surveys/${surveyId}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      loadSurveys();
    } catch (err) {
      setError(err.message);
    }
  };

  const openAnalytics = async (surveyId) => {
    setAnalytics(null);
    setAnalyticsError('');
    setFullResponses(null);
    setResponsesError('');
    setShowResponses(false);
    setAnalyticsLoading(true);
    try {
      const data = await fetchJson(`/surveys/${surveyId}/analytics`, { headers: authHeaders() });
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadFullResponses = async (surveyId) => {
    setResponsesError('');
    setResponsesLoading(true);
    try {
      const data = await fetchJson(`/surveys/${surveyId}/responses`, { headers: authHeaders() });
      setFullResponses(data);
    } catch (err) {
      setResponsesError(err.message);
    } finally {
      setResponsesLoading(false);
    }
  };

  const toggleFullResponses = async () => {
    if (!analytics?.surveyId) return;
    if (showResponses) {
      setShowResponses(false);
      return;
    }
    setShowResponses(true);
    if (!fullResponses) {
      await loadFullResponses(analytics.surveyId);
    }
  };

  const exportResponsesCsv = async (event, survey) => {
    event?.stopPropagation();
    if (!survey?.id && !survey?.surveyId) return;
    setError('');
    setResponsesError('');

    try {
      const surveyId = survey.id || survey.surveyId;
      const response = await fetch(`${API_URL}/surveys/${surveyId}/responses.csv`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Unable to export responses.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `${String(survey.title || 'form')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'form'}-responses.csv`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setResponsesError(err.message);
      setError(err.message);
    }
  };

  const closeAnalytics = () => {
    setAnalytics(null);
    setAnalyticsError('');
    setAnalyticsLoading(false);
    setFullResponses(null);
    setResponsesError('');
    setResponsesLoading(false);
    setShowResponses(false);
  };

  const approveRegistration = async (email) => {
    setError('');
    try {
      await fetchJson(`/auth/approve-registration/${encodeURIComponent(email)}`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      loadPendingRegistrations();
      loadMembers();
      setSelectedRegistration(null);
      setMessage('Registration approved.');
    } catch (err) {
      setError(err.message);
    }
  };

  const rejectRegistration = async (email) => {
    if (!window.confirm('Reject this registration? This cannot be undone.')) return;
    setError('');
    try {
      await fetchJson(`/auth/reject-registration/${encodeURIComponent(email)}`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      loadPendingRegistrations();
      setSelectedRegistration(null);
      setMessage('Registration rejected.');
    } catch (err) {
      setError(err.message);
    }
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await fetchJson(`/auth/create-admin/${encodeURIComponent(newAdminEmail)}`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify({ email: newAdminEmail, password: newAdminPassword }),
      });
      setNewAdminEmail('');
      setNewAdminPassword('');
      setMessage('Admin account created successfully.');
      loadMembers();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMember = async (email) => {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;
    setError('');
    setMessage('');

    try {
      await fetchJson(`/auth/members/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      });
      setMessage('Member deleted.');
      loadMembers();
    } catch (err) {
      setError(err.message);
    }
  };

  if (role !== 'admin') {
    return (
      <main className="page-shell">
        <SiteNav />
        <section className="empty-state">
          <p className="eyebrow">Admin portal</p>
          <h1>Admin access required</h1>
          <p>Log in as an administrator to manage surveys and members.</p>
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
          <h1>Community management</h1>
          <p>Create community forms, track responses, approve requests and manage member details.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/surveys/new">Create a new form</Link>
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
              <h2>Active forms</h2>
              <p>Click a form row to view response analytics.</p>
            </div>
        </div>

        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Form</th>
                <th>Status</th>
                <th>Questions</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeSurveys.map((survey) => (
                <tr key={survey.id} onClick={() => openAnalytics(survey.id)} tabIndex="0">
                  <td>
                    <strong>{survey.title}</strong>
                    {survey.description ? <FormattedText text={survey.description} className="table-description" /> : <span>No description</span>}
                  </td>
                  <td><span className={`status-pill ${survey.status}`}>{survey.status}</span></td>
                  <td>{survey.questions?.length || 0}</td>
                  <td>{formatDate(survey.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={(event) => updateSurveyStatus(event, survey.id, survey.status === 'active' ? 'inactive' : 'active')}
                      >
                        {survey.status === 'active' ? 'Take offline' : 'Publish'}
                      </button>
                      <Link className="btn btn-secondary" to={`/admin/surveys/${survey.id}/edit`} onClick={(event) => event.stopPropagation()}>
                        Edit
                      </Link>
                      <button className="btn btn-secondary" type="button" onClick={(event) => exportResponsesCsv(event, survey)}>
                        Export CSV
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={(event) => deleteSurvey(event, survey.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {activeSurveys.length === 0 && (
                <tr>
                  <td colSpan="5">No forms found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel events-admin-panel">
        <div className="panel-header">
          <div>
            <h2>Upcoming events</h2>
            <p>Feed the home page calendar tile from the events table.</p>
          </div>
        </div>

        <form className="compact-form event-form" onSubmit={createEvent}>
          <label>Title</label>
          <input
            value={newEvent.title}
            onChange={(event) => setNewEvent((current) => ({ ...current, title: event.target.value }))}
            placeholder="Cards and carroms evening"
            required
          />
          <label>Date</label>
          <input
            type="date"
            value={newEvent.eventDate}
            onChange={(event) => setNewEvent((current) => ({ ...current, eventDate: event.target.value }))}
            required
          />
          <label>Location</label>
          <input
            value={newEvent.location}
            onChange={(event) => setNewEvent((current) => ({ ...current, location: event.target.value }))}
            placeholder="Wyndham community venue"
          />
          <label>Summary</label>
          <input
            value={newEvent.summary}
            onChange={(event) => setNewEvent((current) => ({ ...current, summary: event.target.value }))}
            placeholder="Short note for the home page"
          />
          <button type="submit" className="btn btn-primary">Add event</button>
        </form>

        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.title}</strong><span>{event.summary || 'No summary'}</span></td>
                  <td>{formatDate(event.eventDate)}</td>
                  <td>{event.location || '-'}</td>
                  <td><span className={`status-pill ${event.status}`}>{event.status}</span></td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={(clickEvent) => updateEventStatus(clickEvent, event.id, event.status === 'active' ? 'inactive' : 'active')}
                      >
                        {event.status === 'active' ? 'Hide' : 'Show'}
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={(clickEvent) => deleteEvent(clickEvent, event.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedEvents.length === 0 && (
                <tr>
                  <td colSpan="5">No events found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-panel">
          <div className="panel-header">
            <div>
              <h2>Pending registrations</h2>
              <p>Approve or reject member account requests.</p>
            </div>
          </div>
          {pendingRegistrations.length > 0 ? (
            <div className="table-wrap pending-table-wrap">
              <table className="survey-table pending-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Family</th>
                    <th>Interests</th>
                    <th>Submitted</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRegistrations.map((registration) => (
                    <tr
                      key={registration.email}
                      onClick={() => setSelectedRegistration(registration)}
                      tabIndex="0"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedRegistration(registration);
                        }
                      }}
                    >
                      <td>
                        <strong>{registration.fullName || registration.email}</strong>
                        <span>{registration.email}</span>
                      </td>
                      <td>{formatLocation(registration)}</td>
                      <td>{formatFamily(registration)}</td>
                      <td>{formatInterests(registration)}</td>
                      <td>{formatDate(registration.createdAt)}</td>
                      <td><span className="status-pill pending">Open</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">No pending registrations.</p>
          )}
        </article>

        <article className="admin-panel">
          <div className="panel-header">
            <div>
              <h2>Create new admin</h2>
              <p>Add another administrator account.</p>
            </div>
          </div>
          <form onSubmit={createAdmin} className="compact-form">
            <label>Email</label>
            <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} required />
            <button type="submit" className="btn btn-primary">Create admin account</button>
          </form>
        </article>
      </section>

      <section className="admin-panel members-panel">
        <div className="panel-header">
          <div>
            <h2>Members</h2>
            <p>Approved member details stored in the members table.</p>
          </div>
        </div>
        <div className="table-toolbar members-toolbar">
          <label className="member-search">
            <span>Search members</span>
            <input
              type="search"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Name, email, phone, sport..."
            />
          </label>
          <label className="page-size-control">
            <span>Rows</span>
            <select
              value={memberPageSize}
              onChange={(event) => setMemberPageSize(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="survey-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Family</th>
                <th>Interests</th>
                <th>Approved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedMembers.map((member) => (
                <tr key={member.email}>
                  <td><strong>{member.fullName || 'Not provided'}</strong><span>{member.role}</span></td>
                  <td>{member.email}</td>
                  <td>{member.phone || '-'}</td>
                  <td>{member.address || [member.suburb, member.postcode].filter(Boolean).join(' ') || '-'}</td>
                  <td>{formatFamily(member)}</td>
                  <td>{formatInterests(member)}</td>
                  <td>{formatDate(member.approvedAt || member.importedAt || member.updatedAt || member.createdAt)}</td>
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => deleteMember(member.email)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan="8">{members.length === 0 ? 'No approved members found.' : 'No members match your search.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <p>
            Showing {memberRangeStart}-{memberRangeEnd} of {filteredMembers.length}
            {filteredMembers.length !== members.length ? ` filtered from ${members.length}` : ''}
          </p>
          <div className="pagination-controls">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setMemberPage((page) => Math.max(1, page - 1))}
              disabled={memberPage <= 1}
            >
              Previous
            </button>
            <span>Page {memberPage} of {memberPageCount}</span>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setMemberPage((page) => Math.min(memberPageCount, page + 1))}
              disabled={memberPage >= memberPageCount}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {selectedRegistration && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedRegistration(null)}>
          <section className="analytics-modal registration-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-brand">
                  <img src={logoUrl} alt="" />
                  <p className="eyebrow">Pending registration</p>
                </div>
                <h2>{selectedRegistration.fullName || selectedRegistration.email}</h2>
                <p className="muted-text">{selectedRegistration.email}</p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" type="button" onClick={() => approveRegistration(selectedRegistration.email)}>
                  Approve
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => rejectRegistration(selectedRegistration.email)}>
                  Reject
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setSelectedRegistration(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="registration-detail-grid">
              <article>
                <span>Name</span>
                <strong>{selectedRegistration.fullName || '-'}</strong>
              </article>
              <article>
                <span>Email</span>
                <strong>{selectedRegistration.email}</strong>
              </article>
              <article>
                <span>Mobile</span>
                <strong>{selectedRegistration.phone || '-'}</strong>
              </article>
              <article>
                <span>Suburb</span>
                <strong>{formatLocation(selectedRegistration)}</strong>
              </article>
              <article>
                <span>Family</span>
                <strong>{formatFamily(selectedRegistration)}</strong>
              </article>
              <article>
                <span>Games interested</span>
                <strong>{formatInterests(selectedRegistration)}</strong>
              </article>
              <article>
                <span>Previous member</span>
                <strong>{selectedRegistration.previousMember ? 'Yes' : 'No'}</strong>
              </article>
              <article>
                <span>Applied before</span>
                <strong>{selectedRegistration.appliedBefore ? 'Yes' : 'No'}</strong>
              </article>
              <article>
                <span>Submitted</span>
                <strong>{formatDate(selectedRegistration.createdAt)}</strong>
              </article>
            </div>

            <div className="registration-detail-notes">
              <article>
                <h3>Activity interests</h3>
                <p>{selectedRegistration.indoorGamesSubscribed ? 'Wants indoor games updates.' : 'No indoor games update request.'}</p>
                <p>{selectedRegistration.indoorGamesAlreadyMember ? 'Already part of the indoor games group.' : 'Not marked as an existing indoor games member.'}</p>
                <p>{selectedRegistration.onamEoi ? 'Interested in Aug 8 Onam participation.' : 'No Onam participation EOI selected.'}</p>
              </article>
              <article>
                <h3>Membership review</h3>
                <p>{selectedRegistration.membershipFeeDisclaimerAccepted ? 'Membership fee acknowledgement accepted.' : 'Membership fee acknowledgement not accepted.'}</p>
                <p>{selectedRegistration.membershipCriteriaAccepted ? 'Membership review criteria accepted.' : 'Membership review criteria not accepted.'}</p>
                <p>{selectedRegistration.appliedBefore ? 'Applicant has applied before.' : 'No previous application declared.'}</p>
              </article>
            </div>
          </section>
        </div>
      )}

      {(analyticsLoading || analytics || analyticsError) && (
        <div className="modal-backdrop" role="presentation" onClick={closeAnalytics}>
          <section className="analytics-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-brand">
                  <img src={logoUrl} alt="" />
                  <p className="eyebrow">Form analytics</p>
                </div>
                <h2>{analytics?.title || 'Loading analytics'}</h2>
              </div>
              <div className="modal-actions">
                {analytics && (
                  <>
                    <button className="btn btn-secondary" type="button" onClick={() => exportResponsesCsv(null, analytics)}>
                      Export CSV
                    </button>
                    <button className="btn btn-primary" type="button" onClick={toggleFullResponses}>
                      {showResponses ? 'Hide full responses' : 'View full responses'}
                    </button>
                  </>
                )}
                <button className="btn btn-ghost" type="button" onClick={closeAnalytics}>
                  Close
                </button>
              </div>
            </div>

            {analyticsLoading && <p className="muted-text">Loading response data...</p>}
            {analyticsError && <p className="message error-message">{analyticsError}</p>}
            {responsesError && <p className="message error-message">{responsesError}</p>}

            {analytics && (
              <>
                <div className="analytics-summary">
                  <span>{analytics.totalResponses}</span>
                  <p>Total responses</p>
                </div>

                <div className="chart-grid">
                  {analytics.questionStats.map((question) => {
                    const entries = Object.entries(question.totals || {});
                    const total = entries.reduce((sum, [, count]) => sum + count, 0);
                    return (
                      <article key={question.questionId} className="chart-card">
                        <h3>{question.text}</h3>
                        {question.analysisMode === 'none' ? (
                          <p className="muted-text analysis-note">No analysis configured for this field.</p>
                        ) : question.analysisMode === 'sum' ? (
                          <div className="numeric-summary">
                            <div>
                              <span>{formatNumber(question.numeric?.sum)}</span>
                              <p>Total</p>
                            </div>
                            <div>
                              <span>{formatNumber(question.numeric?.average)}</span>
                              <p>Average</p>
                            </div>
                            <div>
                              <span>{question.numeric?.count || 0}</span>
                              <p>Answers</p>
                            </div>
                          </div>
                        ) : question.analysisMode === 'list' ? (
                          <div className="response-list">
                            {question.responses?.length ? question.responses.map((response, index) => (
                              <p key={`${response}-${index}`}>{response}</p>
                            )) : <p className="muted-text">No answers yet.</p>}
                          </div>
                        ) : (
                          <div className="chart-layout">
                            <div className="pie-chart" style={{ background: buildChart(question.totals) }}>
                              <span>{total}</span>
                            </div>
                            <div className="legend">
                              {entries.length > 0 ? entries.map(([value, count], index) => (
                                <div key={value}>
                                  <i style={{ background: chartColors[index % chartColors.length] }} />
                                  <span>{value}</span>
                                  <strong>{count}</strong>
                                </div>
                              )) : <p className="muted-text">No answers yet.</p>}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                {showResponses && (
                  <section className="full-responses">
                    <div className="panel-header">
                      <div>
                        <h3>Full responses</h3>
                        <p>Every submitted answer for this form.</p>
                      </div>
                    </div>
                    {responsesLoading && <p className="muted-text">Loading full responses...</p>}
                    {fullResponses && (
                      <div className="table-wrap response-table-wrap">
                        <table className="survey-table response-table">
                          <thead>
                            <tr>
                              <th>Submitted</th>
                              {fullResponses.questions.map((question) => (
                                <th key={question.id}>{question.text}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fullResponses.responses.map((response) => (
                              <tr key={response.responseId}>
                                <td>{formatDate(response.submittedAt)}</td>
                                {response.answers.map((answer) => (
                                  <td key={answer.questionId} className="response-value">
                                    {answer.value || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {fullResponses.responses.length === 0 && (
                              <tr>
                                <td colSpan={fullResponses.questions.length + 1}>No responses submitted yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminSurveys;
