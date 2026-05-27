import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, fetchJson } from '../api.js';
import SiteNav from '../components/SiteNav.jsx';

const gameOptions = [
  'Cricket',
  'Volleyball',
  'Basketball',
  'Badminton',
  'Table tennis',
  'Carroms',
  'Cards',
  'Cultural activities',
];

const separateSubscriptionGames = new Set(['Badminton', 'Volleyball']);

function Register({ previewMode = false }) {
  const [form, setForm] = useState({
    fullName: '',
    suburb: '',
    postcode: '',
    email: '',
    phone: '',
    familyAdults: '',
    familyKidsUnder5: '',
    familyKidsOver5: '',
    gamesInterested: [],
    previousMember: '',
    appliedBefore: false,
    subscribedIndoorGames: false,
    indoorGamesAlreadyMember: false,
    onamEoi: false,
    membershipFeeDisclaimerAccepted: false,
    membershipCriteriaAccepted: false,
  });
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(previewMode);
  const [configLoaded, setConfigLoaded] = useState(previewMode);

  useEffect(() => {
    if (previewMode) return;
    fetchJson('/config')
      .then((config) => setRegistrationOpen(Boolean(config.enableMemberRegistration)))
      .catch(() => setRegistrationOpen(false))
      .finally(() => setConfigLoaded(true));
  }, [previewMode]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleGame = (game) => {
    setForm((current) => ({
      ...current,
      gamesInterested: current.gamesInterested.includes(game)
        ? current.gamesInterested.filter((item) => item !== game)
        : [...current.gamesInterested, game],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    const endpoint = previewMode ? '/auth/signup-preview-2026' : '/auth/signup';
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        fullName: form.fullName,
        suburb: form.suburb,
        postcode: form.postcode,
        phone: form.phone,
        family: {
          adults: form.familyAdults,
          kidsUnder5: form.familyKidsUnder5,
          kidsOver5: form.familyKidsOver5,
        },
        gamesInterested: form.gamesInterested,
        previousMember: form.previousMember === 'yes',
        appliedBefore: form.appliedBefore,
        subscribedIndoorGames: form.subscribedIndoorGames,
        indoorGamesAlreadyMember: form.indoorGamesAlreadyMember,
        onamEoi: form.onamEoi,
        membershipFeeDisclaimerAccepted: form.membershipFeeDisclaimerAccepted,
        membershipCriteriaAccepted: form.membershipCriteriaAccepted,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      setMessage('Membership application submitted. Your account is pending committee approval.');
      setSubmitted(true);
      setForm((current) => ({
        ...current,
        fullName: '',
        suburb: '',
        postcode: '',
        email: '',
        phone: '',
        familyAdults: '',
        familyKidsUnder5: '',
        familyKidsOver5: '',
        gamesInterested: [],
        previousMember: '',
        appliedBefore: false,
        subscribedIndoorGames: false,
        indoorGamesAlreadyMember: false,
        onamEoi: false,
        membershipFeeDisclaimerAccepted: false,
        membershipCriteriaAccepted: false,
      }));
    } else {
      setMessage(data.message || 'Unable to submit membership application.');
    }
  };

  if (submitted) {
    return (
      <main className="page-shell">
        <SiteNav />
        <div className="auth-shell form-auth-shell">
          <div className="auth-card">
            <p className="eyebrow">Membership application</p>
            <h1>Application submitted</h1>
            <p>{message}</p>
            <Link className="btn btn-primary" to="/">Take me home</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="auth-shell membership-shell">
      <section className="auth-card membership-card">
        <p className="eyebrow">Wyndham Tuskers</p>
        <h1>Membership application</h1>
        <Link className="back-link" to="/">Back to home</Link>
        {previewMode && <p className="form-note preview-note">Hidden preview form. Public registration is still controlled by the site flag.</p>}
        {configLoaded && !registrationOpen ? (
          <>
            <p className="form-note">Member registration is currently closed.</p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="membership-form">
            <div className="form-grid-two">
              <label>
                <span>Name</span>
                <input value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} required />
              </label>
              <label>
                <span>Mobile</span>
                <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} required />
              </label>
              <label>
                <span>Previous member</span>
                <select value={form.previousMember} onChange={(event) => updateField('previousMember', event.target.value)} required>
                  <option value="">Select one</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>

            <div className="form-grid-two">
              <label>
                <span>Suburb</span>
                <input value={form.suburb} onChange={(event) => updateField('suburb', event.target.value)} required />
              </label>
              <label>
                <span>Postcode</span>
                <input inputMode="numeric" value={form.postcode} onChange={(event) => updateField('postcode', event.target.value)} required />
              </label>
            </div>

            <fieldset className="membership-fieldset">
              <legend>Family members</legend>
              <div className="form-grid-two">
                <label>
                  <span>Adults</span>
                  <input type="number" min="0" value={form.familyAdults} onChange={(event) => updateField('familyAdults', event.target.value)} required />
                </label>
                <label>
                  <span>Kids under 5</span>
                  <input type="number" min="0" value={form.familyKidsUnder5} onChange={(event) => updateField('familyKidsUnder5', event.target.value)} required />
                </label>
                <label>
                  <span>Kids 5 and above</span>
                  <input type="number" min="0" value={form.familyKidsOver5} onChange={(event) => updateField('familyKidsOver5', event.target.value)} required />
                </label>
              </div>
            </fieldset>

            <label>
              <span>Games interested</span>
              <div className="choice-card-grid">
                {gameOptions.map((game) => (
                  <label key={game} className="choice-card">
                    <input
                      type="checkbox"
                      checked={form.gamesInterested.includes(game)}
                      onChange={() => toggleGame(game)}
                    />
                    <span>
                      {game}
                      {separateSubscriptionGames.has(game) && <sup>*</sup>}
                    </span>
                  </label>
                ))}
              </div>
              <p className="field-note">
                * Badminton and volleyball are managed through a separate subscription to help cover venue hire and
                session running costs.
              </p>
            </label>

            <div className="membership-checks">
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.appliedBefore}
                  onChange={(event) => updateField('appliedBefore', event.target.checked)}
                />
                <span>Have you applied before?</span>
              </label>
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.subscribedIndoorGames}
                  onChange={(event) => updateField('subscribedIndoorGames', event.target.checked)}
                />
                <span>Please keep me updated about indoor games sessions and activities.</span>
              </label>
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.indoorGamesAlreadyMember}
                  onChange={(event) => updateField('indoorGamesAlreadyMember', event.target.checked)}
                />
                <span>I am already part of the club's indoor games group.</span>
              </label>
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.onamEoi}
                  onChange={(event) => updateField('onamEoi', event.target.checked)}
                />
                <span>I am interested in participating in the Aug 8 Onam celebration.</span>
              </label>
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.membershipFeeDisclaimerAccepted}
                  onChange={(event) => updateField('membershipFeeDisclaimerAccepted', event.target.checked)}
                  required
                />
                <span>I understand membership fees are set by the club and must be paid in full once communicated.</span>
              </label>
            </div>

            <section className="membership-disclaimer">
              <h2>Membership review</h2>
              <p>
                Submitting this form does not automatically confirm club membership. Applications are reviewed by the club
                committee in line with the current member acceptance criteria.
              </p>
              <p>
                The review may consider factors such as proximity to Wyndham Vale, previous involvement with club activities,
                acceptance of club rules, and genuine interest in participating in club sports, games and community events.
              </p>
              <label className="survey-checkbox">
                <input
                  type="checkbox"
                  checked={form.membershipCriteriaAccepted}
                  onChange={(event) => updateField('membershipCriteriaAccepted', event.target.checked)}
                  required
                />
                <span>I understand that my application will be reviewed against the club's membership criteria before membership is confirmed.</span>
              </label>
            </section>

            <button type="submit" className="btn btn-primary">Submit application</button>
          </form>
        )}
        {message && <p className="message">{message}</p>}
      </section>
    </div>
  );
}

export default Register;
