import React, { useState, useRef } from 'react';
import {
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { storage, db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * DocumentUpload — lets an authenticated employer upload a PDF for a specific
 * employee. Validates file type and size client-side before touching Storage.
 *
 * Security note on download URLs:
 * We do NOT call getDownloadURL() and store the result. A public download URL
 * is unauthenticated — anyone with the URL can download the file indefinitely.
 * Instead, we store the storagePath and generate authenticated access on demand
 * via the Firebase SDK (which attaches the user's ID token automatically) or
 * a short-lived signed URL from a Cloud Function (see README § Security Audit).
 */
export function DocumentUpload({ employee, onSuccess }) {
  const { currentUser } = useAuth();
  const fileInputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  function validateFile(file) {
    if (!file) return 'Please select a file.';
    if (file.type !== 'application/pdf') return 'Only PDF files are accepted.';
    if (file.size > MAX_FILE_SIZE_BYTES) return 'File must be 10 MB or smaller.';
    return null;
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError('');

    const file = fileInputRef.current?.files[0];
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setProgress(0);

    // Construct storage path: Documents/{employerId}/{employeeId}/{YYYY-MM}/{filename}
    const yearMonth = new Date().toISOString().slice(0, 7); // e.g. 2024-03
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `Documents/${currentUser.uid}/${employee.id}/${yearMonth}/${safeName}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: 'application/pdf',
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (uploadError) => {
        console.error('Upload error:', uploadError);
        setError('Upload failed. Please try again.');
        setUploading(false);
      },
      async () => {
        // Upload complete — write Firestore metadata document.
        // The Cloud Function onDocumentUploaded fires on this write and
        // sends the email notification.
        try {
          await addDoc(collection(db, 'documents'), {
            employeeId: employee.id,
            employerId: currentUser.uid,
            fileName: file.name,
            storagePath,
            uploadedBy: currentUser.uid,
            uploadedAt: serverTimestamp(),
            fileSize: file.size,
            createdAt: serverTimestamp(),
            emailStatus: 'pending',
          });
          setProgress(100);
          onSuccess?.();
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (firestoreError) {
          console.error('Firestore write error:', firestoreError);
          setError('File uploaded but metadata save failed. Contact support.');
        } finally {
          setUploading(false);
        }
      }
    );
  }

  return (
    <div className="upload-container">
      <h3>Upload document for {employee.fullName}</h3>

      {error && <p className="error-banner">{error}</p>}

      <form onSubmit={handleUpload}>
        <label>
          PDF file (max 10 MB)
          <input
            type="file"
            accept="application/pdf"
            ref={fileInputRef}
            disabled={uploading}
          />
        </label>

        {uploading && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <span>{progress}%</span>
          </div>
        )}

        <button type="submit" disabled={uploading} className="btn-primary">
          {uploading ? 'Uploading...' : 'Upload PDF'}
        </button>
      </form>
    </div>
  );
}
