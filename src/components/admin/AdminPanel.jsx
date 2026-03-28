import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

/**
 * AdminPanel — visible only to users with the 'admin' Custom Claim.
 * Role is verified server-side by the ProtectedRoute and again in the
 * Cloud Function when admin actions are called.
 */
export function AdminPanel() {
  const { currentUser, logout } = useAuth();
  const [targetUid, setTargetUid] = useState('');
  const [result, setResult] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePromoteAdmin(e) {
    e.preventDefault();
    setResult('');
    setSubmitting(true);
    try {
      const setAdminRole = httpsCallable(functions, 'setAdminRole');
      await setAdminRole({ targetUid });
      setResult(`Successfully promoted ${targetUid} to admin.`);
      setTargetUid('');
    } catch (err) {
      setResult(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Admin Panel — HRIS Platform</h1>
        <div className="header-actions">
          <span className="user-label">{currentUser?.email}</span>
          <button onClick={logout} className="btn-secondary btn-sm">Sign out</button>
        </div>
      </header>

      <main className="dashboard-body">
        <section>
          <h2>Promote user to admin</h2>
          <p className="helper-text">
            Enter the Firebase UID of the user to promote. Role changes take effect
            on their next sign-in (token refresh).
          </p>

          {result && <p className={result.startsWith('Error') ? 'error-banner' : 'success-banner'}>{result}</p>}

          <form onSubmit={handlePromoteAdmin} className="employee-form">
            <label>
              User UID
              <input
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                placeholder="Firebase Auth UID"
                required
              />
            </label>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Promoting...' : 'Promote to admin'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
