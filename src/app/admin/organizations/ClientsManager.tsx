'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Users2, Pencil } from 'lucide-react';
import { Card, CardContent, Button, Input, Modal, ConfirmModal } from '@/components/ui';
import toast from 'react-hot-toast';

interface Client {
  id: string;
  name: string;
  poc_name: string | null;
  poc_email: string | null;
  created_at: string;
}

export function ClientsManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState('');
  const [formPocName, setFormPocName] = useState('');
  const [formPocEmail, setFormPocEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      if (data.success) setClients(data.data);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const openAdd = () => {
    setEditingClient(null);
    setFormName('');
    setFormPocName('');
    setFormPocEmail('');
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setFormName(c.name);
    setFormPocName(c.poc_name || '');
    setFormPocEmail(c.poc_email || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) return;
    setIsSaving(true);
    try {
      if (editingClient) {
        // Delete old entry then recreate with updated fields
        await fetch(`/api/admin/clients/${editingClient.id}`, { method: 'DELETE' });
      }
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          poc_name: formPocName.trim() || undefined,
          poc_email: formPocEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await loadClients();
      setShowForm(false);
      toast.success(editingClient ? 'Client updated' : 'Client added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save client');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteClient) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${deleteClient.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setClients(prev => prev.filter(c => c.id !== deleteClient.id));
      setDeleteClient(null);
      toast.success('Client removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Approved Clients</h3>
              <p className="text-sm text-gray-500">Manage clients and their default POC details</p>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Client
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading clients…</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="py-8 text-center">
              <Users2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-500">No approved clients yet. Click &quot;Add Client&quot; to get started.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Client Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">POC Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">POC Email</th>
                    <th className="px-4 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{client.name}</td>
                      <td className="px-4 py-2.5 text-gray-700">{client.poc_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{client.poc_email || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(client)}
                            className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                            title="Edit client"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteClient(client)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Remove client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingClient ? 'Edit Client' : 'Add Client'}
      >
        <div className="p-6 space-y-4">
          <Input
            label="Client Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Acme Corporation"
            required
            disabled={!!editingClient}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="POC Name"
              value={formPocName}
              onChange={(e) => setFormPocName(e.target.value)}
              placeholder="e.g. Jane Smith"
            />
            <Input
              label="POC Email"
              type="email"
              value={formPocEmail}
              onChange={(e) => setFormPocEmail(e.target.value)}
              placeholder="e.g. jane@acme.com"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={isSaving} disabled={!formName.trim()}>
              {editingClient ? 'Save Changes' : 'Add Client'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteClient}
        onClose={() => setDeleteClient(null)}
        onConfirm={handleDelete}
        title="Remove Client"
        description={`Remove "${deleteClient?.name}" from the approved clients list? Existing sessions using this client name will not be affected.`}
        confirmText="Remove"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}
