import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { Login } from './components/auth/Login';
import { EmployerDashboard } from './components/employees/EmployerDashboard';
import { AdminPanel } from './components/admin/AdminPanel';
import './styles/index.css';

function Unauthorized() {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Access denied</h2>
        <p>You do not have permission to view this page.</p>
        <a href="/dashboard">Go to dashboard</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Employer-only routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredRole="employer">
                <EmployerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin-only routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPanel />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
