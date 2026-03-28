import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { EmployeeList } from './EmployeeList';
import { DocumentUpload } from '../documents/DocumentUpload';
import { DocumentList } from '../documents/DocumentList';

export function EmployerDashboard() {
  const { currentUser, logout } = useAuth();
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState('employees');

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>HRIS Platform</h1>
        <div className="header-actions">
          <span className="user-label">{currentUser?.email}</span>
          <button onClick={handleLogout} className="btn-secondary btn-sm">
            Sign out
          </button>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={activeTab === 'employees' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('employees')}
        >
          Employees
        </button>
        <button
          className={activeTab === 'documents' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('documents')}
          disabled={!selectedEmployee}
          title={!selectedEmployee ? 'Select an employee first' : ''}
        >
          Documents {selectedEmployee ? `— ${selectedEmployee.fullName}` : ''}
        </button>
      </nav>

      <main className="dashboard-body">
        {activeTab === 'employees' && (
          <EmployeeList
            onSelectEmployee={(emp) => {
              setSelectedEmployee(emp);
              setActiveTab('documents');
            }}
          />
        )}

        {activeTab === 'documents' && selectedEmployee && (
          <div>
            <button
              className="btn-link"
              onClick={() => {
                setSelectedEmployee(null);
                setActiveTab('employees');
              }}
            >
              ← Back to employees
            </button>
            <DocumentUpload
              employee={selectedEmployee}
              onSuccess={() => {}}
            />
            <DocumentList employeeId={selectedEmployee.id} />
          </div>
        )}
      </main>
    </div>
  );
}
