import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { API_URL } from '../api.js';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (password !== confirm) return setMessage('Passwords do not match.');

    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password }),
    });

    const data = await response.json();
    if (response.ok) {
      setMessage('Password reset successful. You can now log in.');
    } else {
      setMessage(data.message || 'Unable to reset password.');
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Create a new password</h1>
        <form onSubmit={handleSubmit}>
          <label>New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Reset password</button>
        </form>
        <p className="form-note">
          Back to <Link to="/login">login</Link>
        </p>
        {message && <p className="message">{message}</p>}
      </section>
    </div>
  );
}

export default ResetPassword;
