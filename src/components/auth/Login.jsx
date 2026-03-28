import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      // Surface a generic error message — do not reveal whether the email
      // exists, which would help an attacker enumerate valid accounts.
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await resetPassword(email);
      setMessage('Password reset email sent. Check your inbox.');
    } catch {
      setError('Could not send reset email. Check that the address is correct.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>{resetMode ? 'Reset Password' : 'Sign in'}</h1>
        <p className="auth-subtitle">HRIS Platform</p>

        {error && <p className="error-banner">{error}</p>}
        {message && <p className="success-banner">{message}</p>}

        <form onSubmit={resetMode ? handleReset : handleLogin}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          {!resetMode && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
          )}

          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting
              ? 'Please wait...'
              : resetMode
              ? 'Send reset link'
              : 'Sign in'}
          </button>
        </form>

        <button
          className="btn-link"
          onClick={() => {
            setResetMode(!resetMode);
            setError('');
            setMessage('');
          }}
        >
          {resetMode ? '← Back to sign in' : 'Forgot your password?'}
        </button>
      </div>
    </div>
  );
}
