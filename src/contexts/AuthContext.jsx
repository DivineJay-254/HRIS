import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged fires on every auth event and on app load.
    // We force-refresh the token to ensure we always have the latest
    // Custom Claims — without forceRefresh, a role change made by a Cloud
    // Function would not be visible until the hour-long token expiry.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // getIdTokenResult with forceRefresh=true fetches the latest claims.
        // This is the only safe way to read roles — we do NOT read a Firestore
        // field because a client could modify that field to escalate their role.
        const idTokenResult = await user.getIdTokenResult(/* forceRefresh= */ true);
        setUserRole(idTokenResult.claims.role || null);
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email);

  const value = {
    currentUser,
    userRole,
    loading,
    login,
    logout,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
