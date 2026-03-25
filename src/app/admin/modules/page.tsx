'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, ListChecks, Pencil, Trash2, Clock } from 'lucide-react';
import { Card, CardContent, Button, Input, TextArea, Modal, ConfirmModal } from '@/components/ui';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface LibraryActivitySummary {
  id: string;
  title: string;
  objective: string | null;
  step_count: number;
  created_at: string;
  updated_at: string;
}

interface TemplateModule {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  step_count: number;
}

interface TemplateGroup {
  id: string;
  name: string;
  modules: TemplateModule[];
}

export default function ModulesPage() {
  const [activities, setActivities] = useState<LibraryActivitySummary[]>([]);
  const [templates, setTemplates] = useState<TemplateGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadActivities = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/library?include_templates=true');
      const data = await res.json();
      if (data.success) {
        setActivities(data.data.library);
        setTemplates(data.data.templates);
      }
    } catch {
      toast.error('Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          objective: objective.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity created');
      setActivities(prev => [{ ...data.data, step_count: 0 }, ...prev]);
      setTitle('');
      setObjective('');
      setIsCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create activity');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/library/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity deleted');
      setActivities(prev => prev.filter(a => a.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Activities</h1>
          <p className="text-white/80">
            {activities.length} library activit{activities.length !== 1 ? 'ies' : 'y'}
            {templates.length > 0 && ` · ${templates.reduce((sum, t) => sum + t.modules.length, 0)} in templates`}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Activity
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading activities…</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Library Activities Section */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-white">Library</h2>
            </div>
            {activities.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Layers className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                  <h3 className="text-base font-semibold text-gray-900 mb-2">No Library Activities Yet</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Create reusable activities that can be added to any template, or save activities from existing templates.
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)} variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Activity
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {activities.map((activity) => (
                  <Card key={activity.id} className="hover:shadow-sm transition-shadow">
                    <div className="p-4 flex items-center justify-between">
                      <Link
                        href={`/admin/modules/${activity.id}`}
                        className="flex items-center gap-4 flex-1 min-w-0"
                      >
                        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{activity.title}</h3>
                          {activity.objective && (
                            <p className="text-sm text-gray-500 mt-0.5 truncate">{activity.objective}</p>
                          )}
                        </div>
                      </Link>
                      <div className="flex items-center gap-3 ml-4">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          <ListChecks className="w-3 h-3" />
                          {activity.step_count} step{activity.step_count !== 1 ? 's' : ''}
                        </span>
                        <Link
                          href={`/admin/modules/${activity.id}`}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Edit activity"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => setDeleteId(activity.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete activity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Template Activities Section */}
          {templates.filter(t => t.modules.length > 0).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-white">Template Activities</h2>
                <span className="text-sm text-white/60">
                  ({templates.reduce((sum, t) => sum + t.modules.length, 0)} across {templates.filter(t => t.modules.length > 0).length} template{templates.filter(t => t.modules.length > 0).length !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="space-y-6">
                {templates.filter(t => t.modules.length > 0).map((template) => (
                  <div key={template.id}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wide">
                        {template.name}
                      </h3>
                      <Link
                        href={`/admin/templates/${template.id}`}
                        className="text-xs text-brand-400 hover:text-brand-300"
                      >
                        Edit Template
                      </Link>
                    </div>
                    <div className="grid gap-3">
                      {template.modules.map((mod) => (
                        <Card key={mod.id} className="hover:shadow-sm transition-shadow">
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-sm font-semibold">
                                {mod.order_index + 1}
                              </div>
                              <div>
                                <h3 className="font-medium text-gray-900">{mod.title}</h3>
                                {mod.objective && (
                                  <p className="text-sm text-gray-500 mt-0.5">{mod.objective}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-500">
                                {mod.step_count} step{mod.step_count !== 1 ? 's' : ''}
                              </span>
                              <Link
                                href={`/admin/templates/${template.id}`}
                                className="text-xs text-gray-400 hover:text-brand-600 font-medium"
                              >
                                View
                              </Link>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Activity Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => { setIsCreateOpen(false); setTitle(''); setObjective(''); }} title="Create Library Activity">
        <div className="space-y-4">
          <Input
            label="Activity Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AI Brainstorming Exercise"
          />
          <TextArea
            label="Objective (optional)"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder="What participants will learn or achieve"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setIsCreateOpen(false); setTitle(''); setObjective(''); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || isSaving}>
              {isSaving ? 'Creating...' : 'Create Activity'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Activity"
        description="Are you sure you want to delete this library activity? This will remove all its steps and prompt blocks. This cannot be undone."
        confirmText={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
