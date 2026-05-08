import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, fetchJson } from '../api.js';

function Register() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [suburb, setSuburb] = useState('');
  const [familyCount, setFamilyCount] = useState('');
  const [interests, setInterests] = useState([]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    fetchJson('/config')
      .then((config) => setRegistrationOpen(Boolean(config.enableMemberRegistration)))
      .catch(() => setRegistrationOpen(false))
      .finally(() => setConfigLoaded(true));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (password !== confirm) return setMessage('Passwords do not match.');

    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, phone, suburb, familyCount, interests }),
    });

    const data = await response.json();
    if (response.ok) {
      if (data.role === 'pending') {
        setMessage('Registration submitted. Your account is pending approval by an administrator. You will be notified once approved.');
      } else {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('role', data.role || 'member');
        setMessage('Registration complete. Welcome to the club!');
      }
    } else {
      setMessage(data.message || 'Unable to register.');
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Register</h1>
        {configLoaded && !registrationOpen ? (
          <>
            <p className="form-note">Member registration is currently closed.</p>
            <p className="form-note">
              Already a member? <Link to="/login">Log in</Link>
            </p>
          </>
        ) : (
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label>Suburb</label>
          <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Wyndham Vale, Tarneit, Point Cook..." />
          <label>Family members</label>
          <input type="number" min="1" value={familyCount} onChange={(e) => setFamilyCount(e.target.value)} />
          <label>Interests</label>
          <select
            multiple
            value={interests}
            onChange={(e) => setInterests(Array.from(e.target.selectedOptions, (option) => option.value))}
          >
            <option value="Onam celebrations">Onam celebrations</option>
            <option value="Cricket">Cricket</option>
            <option value="Volleyball">Volleyball</option>
            <option value="Basketball">Basketball</option>
            <option value="Badminton">Badminton</option>
            <option value="Card games">Card games</option>
            <option value="Cultural activities">Cultural activities</option>
          </select>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <label>Confirm Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Create account</button>
        </form>
        )}
        {(!configLoaded || registrationOpen) && (
          <p className="form-note">
            Already a member? <Link to="/login">Log in</Link>
          </p>
        )}
        {message && <p className="message">{message}</p>}
      </section>
    </div>
  );
}

export default Register;
