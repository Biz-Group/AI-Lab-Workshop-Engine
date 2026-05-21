'use client';

import { useState, useCallback } from 'react';
import { UserCheck, UserX, Shield, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface TeamMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: string;
}

interface AccessRequestItem {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  requested_role: string;
  status: string;
  created_at: string;
}

interface UnlinkedUser {
  user_id: string;
  email: string;
  created_at: string;
}

interface TeamManagerProps {
  initialMembers: TeamMember[];
  initialRequests: AccessRequestItem[];
  unlinkedUsers: UnlinkedUser[];
  currentUserId: string;
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner', description: 'Full access, manages team' },
  { value: 'admin', label: 'Admin', description: 'Manages templates & sessions' },
  { value: 'facilitator', label: 'Facilitator', description: 'Runs sessions only' },
] as const;

export function TeamManager({ initialMembers, initialRequests, unlinkedUsers: initialUnlinked, currentUserId }: TeamManagerProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [requests, setRequests] = useState<AccessRequestItem[]>(initialRequests);
  const [unlinked, setUnlinked] = useState<UnlinkedUser[]>(initialUnlinked);
  const [loading, setLoading] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<Record<string, string>>({});
  const [addRole, setAddRole] = useState<Record<string, string>>({});
  const [addName, setAddName] = useState<Record<string, string>>({});

  const handleApprove = useCallback(async (requestId: string) => {
    const role = approveRole[requestId] || 'facilitator';
    setLoading(requestId);

    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, role }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to approve');
        return;
      }

      // Move from requests to members
      const approved = requests.find(r => r.id === requestId);
      if (approved) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
        setMembers(prev => [...prev, {
          id: crypto.randomUUID(),
          user_id: approved.user_id,
          display_name: approved.display_name,
          email: approved.email,
          role,
          created_at: new Date().toISOString(),
        }]);
      }
      toast.success(`${approved?.display_name} approved as ${role}`);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(null);
    }
  }, [approveRole, requests]);

  const handleDeny = useCallback(async (requestId: string) => {
    setLoading(requestId);

    try {
      const res = await fetch('/api/admin/team/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to deny');
        return;
      }

      const denied = requests.find(r => r.id === requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      toast.success(`${denied?.display_name}'s request denied`);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(null);
    }
  }, [requests]);

  const handleRoleChange = useCallback(async (facilitatorId: string, newRole: string) => {
    setLoading(facilitatorId);

    try {
      const res = await fetch('/api/admin/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilitator_id: facilitatorId, role: newRole }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to update role');
        return;
      }

      setMembers(prev => prev.map(m =>
        m.id === facilitatorId ? { ...m, role: newRole } : m
      ));
      toast.success('Role updated');
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(null);
    }
  }, []);

  const handleRemove = useCallback(async (facilitatorId: string, name: string) => {
    if (!confirm(`Remove ${name} from the team? This cannot be undone.`)) return;

    setLoading(facilitatorId);

    try {
      const res = await fetch('/api/admin/team', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilitator_id: facilitatorId }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to remove');
        return;
      }

      setMembers(prev => prev.filter(m => m.id !== facilitatorId));
      toast.success(`${name} removed from team`);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(null);
    }
  }, []);

  const handleAddUser = useCallback(async (userId: string, email: string) => {
    const role = addRole[userId] || 'facilitator';
    const displayName = addName[userId]?.trim() || email.split('@')[0];
    setLoading(userId);

    try {
      const res = await fetch('/api/admin/team/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role, display_name: displayName }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to add user');
        return;
      }

      setUnlinked(prev => prev.filter(u => u.user_id !== userId));
      setMembers(prev => [...prev, {
        id: data.data.id || crypto.randomUUID(),
        user_id: userId,
        display_name: displayName,
        email,
        role,
        created_at: new Date().toISOString(),
      }]);
      toast.success(`${displayName} added to team`);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(null);
    }
  }, [addRole, addName]);

  return (
    <div className="space-y-8">
      {/* Unlinked Registered Users Section */}
      {unlinked.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Registered Users (Not Yet on Team)
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
              {unlinked.length}
            </span>
          </h2>
          <div className="space-y-3">
            {unlinked.map(u => (
              <div
                key={u.user_id}
                className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{u.email}</p>
                  <p className="text-sm text-gray-500">
                    Signed up {new Date(u.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Display name"
                    value={addName[u.user_id] || ''}
                    onChange={(e) => setAddName(prev => ({ ...prev, [u.user_id]: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <div className="relative">
                    <select
                      value={addRole[u.user_id] || 'facilitator'}
                      onChange={(e) => setAddRole(prev => ({ ...prev, [u.user_id]: e.target.value }))}
                      className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => handleAddUser(u.user_id, u.email)}
                    disabled={loading === u.user_id}
                    className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    Add to Team
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending Requests Section */}
      {requests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-600" />
            Pending Requests
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              {requests.length}
            </span>
          </h2>

          <div className="space-y-3">
            {requests.map(req => (
              <div
                key={req.id}
                className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{req.display_name}</p>
                  <p className="text-sm text-gray-600">{req.email}</p>
                  <p className="text-sm text-gray-500">
                    Requested {new Date(req.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Role selector for approval */}
                  <div className="relative">
                    <select
                      value={approveRole[req.id] || 'facilitator'}
                      onChange={(e) => setApproveRole(prev => ({ ...prev, [req.id]: e.target.value }))}
                      className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={loading === req.id}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    Approve
                  </button>

                  <button
                    onClick={() => handleDeny(req.id)}
                    disabled={loading === req.id}
                    className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <UserX className="w-4 h-4" />
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team Members Section */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          Team Members
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-brand-50 text-brand-700 rounded-full">
            {members.length}
          </span>
        </h2>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Role</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {members.map(member => {
                  const isSelf = member.user_id === currentUserId;
                  return (
                    <tr key={member.id} className="hover:bg-white/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                            <span className="text-brand-700 font-semibold text-sm">
                              {member.display_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">
                            {member.display_name}
                            {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {member.email}
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            member.role === 'owner' && 'bg-purple-100 text-purple-800',
                            member.role === 'admin' && 'bg-blue-100 text-blue-800',
                            member.role === 'facilitator' && 'bg-gray-100 text-gray-800',
                          )}>
                            {member.role}
                          </span>
                        ) : (
                          <div className="relative inline-block">
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              disabled={loading === member.id}
                              className={cn(
                                'appearance-none border rounded-full px-3 py-1 pr-7 text-xs font-medium focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50',
                                member.role === 'owner' && 'bg-purple-100 text-purple-800 border-purple-200',
                                member.role === 'admin' && 'bg-blue-100 text-blue-800 border-blue-200',
                                member.role === 'facilitator' && 'bg-gray-100 text-gray-800 border-gray-200',
                              )}
                            >
                              {ROLE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(member.created_at).toLocaleDateString('en-US')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isSelf && (
                          <button
                            onClick={() => handleRemove(member.id, member.display_name)}
                            disabled={loading === member.id}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Remove from team"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
