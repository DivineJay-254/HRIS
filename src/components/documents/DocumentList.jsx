import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

/**
 * DocumentList — shows all documents for a given employee.
 *
 * On download, we call getDownloadURL() at request time with the user's
 * Firebase Auth token attached by the SDK. This is an authenticated request —
 * the Storage Security Rule verifies request.auth.uid == employerId before
 * returning the URL. The URL itself is a short-lived signed URL issued by
 * Firebase Storage (not a permanent public URL).
 *
 * We do NOT store the download URL in Firestore because:
 * 1. Firebase Storage download URLs are permanent by default — storing them
 *    creates a permanent backdoor around the Security Rules.
 * 2. If a document is deleted from Storage, the stored URL would still work
 *    until manually revoked, creating a stale-reference security hole.
 */
export function DocumentList({ employeeId }) {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    if (!currentUser || !employeeId) return;

    const q = query(
      collection(db, 'documents'),
      where('employeeId', '==', employeeId),
      where('employerId', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser, employeeId]);

  async function handleDownload(document) {
    setDownloadingId(document.id);
    try {
      // getDownloadURL attaches the user's ID token — Storage rules verify
      // the caller owns the path before issuing the URL.
      const url = await getDownloadURL(ref(storage, document.storagePath));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Download error:', err);
      alert('Could not retrieve file. You may not have permission or the file may have been removed.');
    } finally {
      setDownloadingId(null);
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(timestamp) {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleDateString();
  }

  if (loading) return <p>Loading documents...</p>;

  return (
    <div className="document-list">
      <h3>Documents</h3>
      {documents.length === 0 ? (
        <p>No documents uploaded yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>File name</th>
              <th>Uploaded</th>
              <th>Size</th>
              <th>Email status</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.fileName}</td>
                <td>{formatDate(doc.uploadedAt)}</td>
                <td>{formatBytes(doc.fileSize)}</td>
                <td>
                  <span className={`badge badge-${doc.emailStatus}`}>
                    {doc.emailStatus || 'unknown'}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="btn-sm"
                  >
                    {downloadingId === doc.id ? 'Loading...' : 'Download'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
