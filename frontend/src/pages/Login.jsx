import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../api.js';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (response.ok) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('role', data.role || 'member');
      setMessage('Login successful. Welcome back!');
      setTimeout(() => navigate('/'), 1000);
    } else {
      setMessage(data.message || 'Unable to sign in.');
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Member Login</h1>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Login</button>
        </form>
        <p className="form-note">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="form-note">
          New here? <Link to="/register">Register</Link>
        </p>
        {message && <p className="message">{message}</p>}
      </section>
    </div>
  );
}

export default Login;
