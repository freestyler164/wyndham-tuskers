import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../api.js';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (response.ok) {
      setMessage('If your email exists, a reset link has been sent.');
    } else {
      setMessage(data.message || 'Unable to process request.');
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Reset password</h1>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Send reset link</button>
        </form>
        <p className="form-note">
          Back to <Link to="/login">login</Link>
        </p>
        {message && <p className="message">{message}</p>}
      </section>
    </div>
  );
}

export default ForgotPassword;
