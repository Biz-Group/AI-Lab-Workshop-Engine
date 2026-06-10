'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Pencil, Trash2, Copy, MoreHorizontal, ChevronDown, QrCode, RefreshCw, RotateCcw } from 'lucide-react';
import { Card, Button, Modal, ConfirmModal, Input, QrCodeModal } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SessionRow {
  id: string;
  join_code: string;
  status: string;
  created_at: string;
  client_name: string | null;
  department: string | null;
  location: string | null;
  poc_name: string | null;
  poc_email: string | null;
  event_type: string | null;
  event_date: string | null;
  template_id: string;
  template_name: string;
}

type SortKey = 'client_name' | 'event_type' | 'event_date' | 'status' | 'location' | 'created_at';
type SortDir = 'asc' | 'desc';

const EVENT_LABELS: Record<string, string> = {
  keynote: 'Keynote',
  halfday: 'Half Day',
  fullday: 'Full Day',
};

const STATUS_STYLES: Record<string, string> = {
  live: 'bg-green-100 text-green-700',
  published: 'bg-blue-100 text-blue-700',
  ended: 'bg-gray-100 text-gray-700',
  draft: 'bg-yellow-100 text-yellow-700',
};

interface SessionsTableProps {
  sessions: SessionRow[];
  clients: { id: string; name: string; poc_name: string | null; poc_email: string | null }[];
}

export function SessionsTable({ sessions: initialSessions, clients }: SessionsTableProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editSession, setEditSession] = useState<SessionRow | null>(null);
  const [deleteSession, setDeleteSession] = useState<SessionRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const openMenu = useCallback((id: string, btnEl: HTMLButtonElement) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }
    const rect = btnEl.getBoundingClientRect();
    const menuHeight = 88;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    setMenuPos({ top, left: rect.right - 144 });
    setOpenMenuId(id);
  }, [openMenuId]);

  // Edit form state
  const [editForm, setEditForm] = useState({
    client_name: '',
    department: '',
    location: '',
    poc_name: '',
    poc_email: '',
    event_type: 'keynote' as string,
    event_date: '',
  });

  // Client dropdown state for edit modal
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clients, clientSearch]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) => {
      let aVal = a[sortKey] ?? '';
      let bVal = b[sortKey] ?? '';

      if (sortKey === 'event_date' || sortKey === 'created_at') {
        const aTime = aVal ? new Date(aVal as string).getTime() : 0;
        const bTime = bVal ? new Date(bVal as string).getTime() : 0;
        return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
      }

      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sessions, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-brand-600" />;
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: 'client_name', label: 'Client' },
    { key: 'event_type', label: 'Type' },
    { key: 'location', label: 'Location' },
    { key: 'event_date', label: 'Event Date' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Created' },
  ];

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Join code "${code}" copied!`);
  };

  const openEdit = (s: SessionRow) => {
    setEditForm({
      client_name: s.client_name || '',
      department: s.department || '',
      location: s.location || '',
      poc_name: s.poc_name || '',
      poc_email: s.poc_email || '',
      event_type: s.event_type || 'keynote',
      event_date: s.event_date ? new Date(s.event_date).toISOString().slice(0, 16) : '',
    });
    setClientSearch('');
    setClientDropdownOpen(false);
    setEditSession(s);
    setOpenMenuId(null);
  };

  const handleSaveEdit = async () => {
    if (!editSession) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/sessions/${editSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: editForm.client_name,
          department: editForm.department,
          location: editForm.location,
          poc_name: editForm.poc_name,
          poc_email: editForm.poc_email || undefined,
          event_type: editForm.event_type,
          event_date: editForm.event_date ? new Date(editForm.event_date).toISOString() : undefined,
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      // Update local state
      setSessions(prev => prev.map(s => 
        s.id === editSession.id 
          ? { ...s, ...editForm, event_date: editForm.event_date ? new Date(editForm.event_date).toISOString() : s.event_date }
          : s
      ));
      setEditSession(null);
      toast.success('Session updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update session');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteSession) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/sessions/${deleteSession.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setSessions(prev => prev.filter(s => s.id !== deleteSession.id));
      setDeleteSession(null);
      toast.success('Session deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="overflow-visible">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 whitespace-nowrap">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 font-medium text-gray-600">
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                    >
                      {col.label}
                      <SortIcon column={col.key} />
                    </button>
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Template</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">POC</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors whitespace-nowrap">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{s.client_name || '—'}</div>
                    {s.department && (
                      <div className="text-xs text-gray-500">{s.department}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.event_type ? EVENT_LABELS[s.event_type] || s.event_type : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.location || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.event_date ? formatDateTime(s.event_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[s.status] || 'bg-gray-100 text-gray-700'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDateTime(s.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-sm">
                    {s.template_name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyCode(s.join_code)}
                        className="inline-flex items-center gap-1 font-mono font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                        title="Copy join code"
                      >
                        {s.join_code}
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setQrCode(s.join_code)}
                        className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                        title="Show QR code"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{s.poc_name || '—'}</div>
                    {s.poc_email && (
                      <div className="text-xs text-gray-500">{s.poc_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 relative">
                      <Link
                        href={`/session/${s.id}/presenter`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded text-sm font-medium transition-colors"
                        title="Open presenter view"
                      >
                        Open
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <div>
                        <button
                          onClick={(e) => openMenu(s.id, e.currentTarget)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="More actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating dropdown menu - rendered outside table to avoid overflow clipping */}
      {openMenuId && menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              onClick={() => {
                const s = sessions.find(x => x.id === openMenuId);
                if (s) openEdit(s);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Details
            </button>
            {(() => {
              const s = sessions.find(x => x.id === openMenuId);
              if (s && s.status === 'ended') {
                return (
                  <button
                    onClick={async () => {
                      if (!s) return;
                      setOpenMenuId(null);
                      try {
                        const res = await fetch(`/api/admin/sessions/${s.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'published', ended_at: null })
                        });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.error);
                        toast.success('Session reopened as published');
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Failed to reopen session');
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reopen Session
                  </button>
                );
              }
              if (s && (s.status === 'draft' || s.status === 'published')) {
                return (
                  <button
                    onClick={async () => {
                      if (!s) return;
                      setSyncingId(s.id);
                      setOpenMenuId(null);
                      try {
                        const res = await fetch(`/api/admin/sessions/${s.id}/resync`, { method: 'POST' });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.error);
                        toast.success('Session resynced to template');
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Failed to resync');
                      } finally {
                        setSyncingId(null);
                      }
                    }}
                    disabled={syncingId === s.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingId === s.id ? 'animate-spin' : ''}`} />
                    Resync to Template
                  </button>
                );
              }
              return null;
            })()}
            <button
              onClick={() => {
                const s = sessions.find(x => x.id === openMenuId);
                if (s) { setDeleteSession(s); setOpenMenuId(null); }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Edit Session Modal */}
      <Modal
        isOpen={!!editSession}
        onClose={() => setEditSession(null)}
        title="Edit Session Details"
        size="lg"
      >
        <div className="p-6 space-y-4">
          {/* Client Name — searchable dropdown */}
          <div ref={clientRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <button
              type="button"
              onClick={() => { setClientDropdownOpen(!clientDropdownOpen); setClientSearch(''); }}
              className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition-colors"
            >
              <span className={editForm.client_name ? 'text-gray-900' : 'text-gray-400'}>
                {editForm.client_name || 'Select a client...'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {clientDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients..."
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto max-h-36">
                  {filteredClients.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No clients found</div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setEditForm(f => ({
                            ...f,
                            client_name: c.name,
                            poc_name: c.poc_name || f.poc_name,
                            poc_email: c.poc_email || f.poc_email,
                          }));
                          setClientDropdownOpen(false);
                          setClientSearch('');
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors ${
                          editForm.client_name === c.name ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <Input
            label="Department"
            value={editForm.department}
            onChange={(e) => setEditForm(f => ({ ...f, department: e.target.value }))}
            placeholder="Optional department"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Location"
              value={editForm.location}
              onChange={(e) => setEditForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Event location"
            />
            <Input
              label="Point of Contact"
              value={editForm.poc_name}
              onChange={(e) => setEditForm(f => ({ ...f, poc_name: e.target.value }))}
              placeholder="POC name"
            />
          </div>
          <Input
            type="email"
            label="POC Email"
            value={editForm.poc_email}
            onChange={(e) => setEditForm(f => ({ ...f, poc_email: e.target.value }))}
            placeholder="poc@company.com"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
              <div className="flex gap-2">
                {(['keynote', 'halfday', 'fullday'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, event_type: type }))}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      editForm.event_type === type
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {EVENT_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            <Input
              type="datetime-local"
              label="Event Date & Time"
              value={editForm.event_date}
              onChange={(e) => setEditForm(f => ({ ...f, event_date: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setEditSession(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} isLoading={isSaving}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={!!qrCode}
        onClose={() => setQrCode(null)}
        joinCode={qrCode || ''}
        joinUrl={qrCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${qrCode}` : ''}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteSession}
        onClose={() => setDeleteSession(null)}
        onConfirm={handleDelete}
        title="Delete Session"
        description={`Are you sure you want to delete the session for "${deleteSession?.client_name || 'Unknown'}"? This will permanently remove all participant data, submissions, and analytics. This action cannot be undone.`}
        confirmText="Delete Session"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}
