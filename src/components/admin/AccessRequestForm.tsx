'use client';

import { useState, useEffect } from 'react';
import { Send, CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Organization {
  id: string;
  name: string;
}

export function AccessRequestForm() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pendingOrgs, setPendingOrgs] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch('/api/auth/request-access');
        const data = await res.json();

        if (data.success) {
          setOrganizations(data.data.organizations);
          setPendingOrgs(data.data.pendingRequestOrgs);
          if (data.data.organizations.length === 1) {
            setSelectedOrg(data.data.organizations[0].id);
          }
          // Check if user already has pending for all orgs
          if (data.data.organizations.length > 0 &&
            data.data.pendingRequestOrgs.length >= data.data.organizations.length) {
            setSubmitted(true);
          }
        } else if (res.status === 409) {
          // Already a team member — shouldn't be here
          window.location.href = '/admin';
        }
      } catch {
        toast.error('Failed to load organizations');
      } finally {
        setLoading(false);
      }
    }
    fetchOrgs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !displayName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: selectedOrg,
          display_name: displayName.trim(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSubmitted(true);
        toast.success('Access request submitted!');
      } else {
        toast.error(data.error || 'Failed to submit request');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center max-w-md p-6">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Request Submitted</h2>
        <p className="text-white/80">
          Your access request has been sent to the organization owner.
          You&apos;ll be able to access the dashboard once approved.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center max-w-md p-6">
      <h1 className="text-2xl font-bold text-white mb-4">Request Access</h1>
      <p className="text-white/80 mb-6">
        Your account is not yet linked to an organization.
        Submit a request to get access to the dashboard.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div>
          <label className="block text-sm font-medium text-white/90 mb-1">
            Your Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
            required
            maxLength={100}
            className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {organizations.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">
              Organization
            </label>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="" className="text-gray-900">Select an organization</option>
              {organizations.map(org => (
                <option
                  key={org.id}
                  value={org.id}
                  disabled={pendingOrgs.includes(org.id)}
                  className="text-gray-900"
                >
                  {org.name} {pendingOrgs.includes(org.id) ? '(pending)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {organizations.length === 1 && (
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">
              Organization
            </label>
            <p className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white">
              {organizations[0].name}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !displayName.trim() || !selectedOrg}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Request Access
        </button>
      </form>
    </div>
  );
}
