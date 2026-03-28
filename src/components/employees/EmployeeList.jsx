import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_FORM = {
  fullName: '',
  nationalId: '',
  jobTitle: '',
  department: '',
  startDate: '',
  status: 'active',
};

export function EmployeeList() {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Real-time listener — updates UI whenever Firestore data changes.
  // The query filters by employerId so we never receive another employer's data
  // (Security Rules enforce this server-side as a second layer).
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'employees'),
      where('employerId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser]);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (editingId) {
        // Update — note: createdAt is not included so the Security Rule
        // blocking createdAt overwrites is satisfied automatically.
        await updateDoc(doc(db, 'employees', editingId), {
          fullName: form.fullName,
          jobTitle: form.jobTitle,
          department: form.department,
          startDate: form.startDate,
          status: form.status,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create — employerId is set to the current user's UID so Security
        // Rules allow the write and the record is scoped to this employer.
        await addDoc(collection(db, 'employees'), {
          ...form,
          employerId: currentUser.uid,
          linkedUserId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (err) {
      setError('Save failed. Please try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(employee) {
    setForm({
      fullName: employee.fullName,
      nationalId: employee.nationalId,
      jobTitle: employee.jobTitle,
      department: employee.department,
      startDate: employee.startDate,
      status: employee.status,
    });
    setEditingId(employee.id);
  }

  function cancelEdit() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this employee record? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'employees', id));
    } catch {
      setError('Delete failed.');
    }
  }

  if (loading) return <p>Loading employees...</p>;

  return (
    <div className="page-container">
      <h2>{editingId ? 'Edit Employee' : 'Add Employee'}</h2>

      {error && <p className="error-banner">{error}</p>}

      <form onSubmit={handleSubmit} className="employee-form">
        <label>
          Full name
          <input name="fullName" value={form.fullName} onChange={handleChange} required />
        </label>
        <label>
          National ID
          <input
            name="nationalId"
            value={form.nationalId}
            onChange={handleChange}
            required
            disabled={!!editingId}
            title={editingId ? 'National ID cannot be changed after creation' : ''}
          />
        </label>
        <label>
          Job title
          <input name="jobTitle" value={form.jobTitle} onChange={handleChange} required />
        </label>
        <label>
          Department
          <input name="department" value={form.department} onChange={handleChange} required />
        </label>
        <label>
          Start date
          <input
            type="date"
            name="startDate"
            value={form.startDate}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Status
          <select name="status" value={form.status} onChange={handleChange}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Add employee'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2>Employee Records</h2>
      {employees.length === 0 ? (
        <p>No employees yet. Add one above.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Job title</th>
              <th>Department</th>
              <th>Status</th>
              <th>Start date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.fullName}</td>
                <td>{emp.jobTitle}</td>
                <td>{emp.department}</td>
                <td>
                  <span className={`badge badge-${emp.status}`}>{emp.status}</span>
                </td>
                <td>{emp.startDate}</td>
                <td>
                  <button onClick={() => startEdit(emp)} className="btn-sm">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(emp.id)} className="btn-sm btn-danger">
                    Delete
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
