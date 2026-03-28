import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ProtectedRoute wraps any route that requires authentication and/or a
 * specific role.
 *
 * Usage:
 *   <ProtectedRoute requiredRole="employer">
 *     <EmployerDashboard />
 *   </ProtectedRoute>
 *
 *   <ProtectedRoute requiredRole="admin">
 *     <AdminPanel />
 *   </ProtectedRoute>
 *
 * Role is read from the Firebase ID token's Custom Claims — NOT from any
 * Firestore document — so it cannot be spoofed by a client-side write.
 */
export function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, userRole, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!currentUser) {
    // Redirect to login, preserving the intended destination so the user
    // lands on the right page after authentication.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && userRole !== requiredRole) {
    // User is authenticated but does not hold the required role.
    // Admin can access employer routes (superset), but not vice versa.
    if (requiredRole === 'employer' && userRole === 'admin') {
      return children;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
