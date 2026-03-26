'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layers, Plus, ListChecks, Pencil, Trash2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, Button, Input, TextArea, Modal, ConfirmModal } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
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

// Flattened row for the template activities table
interface TemplateActivityRow {
  moduleId: string;
  templateId: string;
  templateName: string;
  title: string;
  objective: string | null;
  step_count: number;
}

type LibrarySortKey = 'title' | 'step_count' | 'created_at';
type TemplateSortKey = 'templateName' | 'title' | 'step_count';
type SortDir = 'asc' | 'desc';

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

  // Library sort state
  const [libSortKey, setLibSortKey] = useState<LibrarySortKey>('created_at');
  const [libSortDir, setLibSortDir] = useState<SortDir>('desc');
  const [libMenuId, setLibMenuId] = useState<string | null>(null);
  const [libMenuPos, setLibMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Template sort state
  const [tmplSortKey, setTmplSortKey] = useState<TemplateSortKey>('templateName');
  const [tmplSortDir, setTmplSortDir] = useState<SortDir>('asc');
  const [tmplMenuId, setTmplMenuId] = useState<string | null>(null);
  const [tmplMenuPos, setTmplMenuPos] = useState<{ top: number; left: number } | null>(null);

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

  // Library sorting
  const toggleLibSort = (key: LibrarySortKey) => {
    if (libSortKey === key) {
      setLibSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setLibSortKey(key);
      setLibSortDir('asc');
    }
  };

  const sortedLibrary = useMemo(() => {
    return [...activities].sort((a, b) => {
      if (libSortKey === 'created_at') {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return libSortDir === 'asc' ? aTime - bTime : bTime - aTime;
      }
      if (libSortKey === 'step_count') {
        return libSortDir === 'asc' ? a.step_count - b.step_count : b.step_count - a.step_count;
      }
      const aVal = String(a[libSortKey]).toLowerCase();
      const bVal = String(b[libSortKey]).toLowerCase();
      if (aVal < bVal) return libSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return libSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activities, libSortKey, libSortDir]);

  const LibSortIcon = ({ column }: { column: LibrarySortKey }) => {
    if (libSortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return libSortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-brand-600" />;
  };

  // Template sorting
  const toggleTmplSort = (key: TemplateSortKey) => {
    if (tmplSortKey === key) {
      setTmplSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTmplSortKey(key);
      setTmplSortDir('asc');
    }
  };

  const templateRows = useMemo<TemplateActivityRow[]>(() => {
    return templates.flatMap(t =>
      t.modules.map(mod => ({
        moduleId: mod.id,
        templateId: t.id,
        templateName: t.name,
        title: mod.title,
        objective: mod.objective,
        step_count: mod.step_count,
      }))
    );
  }, [templates]);

  const sortedTemplateRows = useMemo(() => {
    return [...templateRows].sort((a, b) => {
      if (tmplSortKey === 'step_count') {
        return tmplSortDir === 'asc' ? a.step_count - b.step_count : b.step_count - a.step_count;
      }
      const aVal = String(a[tmplSortKey]).toLowerCase();
      const bVal = String(b[tmplSortKey]).toLowerCase();
      if (aVal < bVal) return tmplSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return tmplSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [templateRows, tmplSortKey, tmplSortDir]);

  const TmplSortIcon = ({ column }: { column: TemplateSortKey }) => {
    if (tmplSortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return tmplSortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-brand-600" />;
  };

  // Dropdown menus
  const openLibMenu = useCallback((id: string, btnEl: HTMLButtonElement) => {
    if (libMenuId === id) { setLibMenuId(null); return; }
    const rect = btnEl.getBoundingClientRect();
    const menuHeight = 88;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    setLibMenuPos({ top, left: rect.right - 144 });
    setLibMenuId(id);
  }, [libMenuId]);

  const openTmplMenu = useCallback((id: string, btnEl: HTMLButtonElement) => {
    if (tmplMenuId === id) { setTmplMenuId(null); return; }
    const rect = btnEl.getBoundingClientRect();
    const menuHeight = 44;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    setTmplMenuPos({ top, left: rect.right - 160 });
    setTmplMenuId(id);
  }, [tmplMenuId]);

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

  const libColumns: { key: LibrarySortKey; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'step_count', label: 'Steps' },
    { key: 'created_at', label: 'Created' },
  ];

  const tmplColumns: { key: TemplateSortKey; label: string }[] = [
    { key: 'templateName', label: 'Template' },
    { key: 'title', label: 'Title' },
    { key: 'step_count', label: 'Steps' },
  ];

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
          {/* Library Activities Table */}
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
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {libColumns.map((col) => (
                          <th key={col.key} className="text-left px-4 py-3 font-medium text-gray-600">
                            <button
                              type="button"
                              onClick={() => toggleLibSort(col.key)}
                              className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                            >
                              {col.label}
                              <LibSortIcon column={col.key} />
                            </button>
                          </th>
                        ))}
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Objective</th>
                        <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedLibrary.map((activity) => (
                        <tr key={activity.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{activity.title}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                              {activity.step_count}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {formatDateTime(activity.created_at)}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm max-w-xs truncate">
                            {activity.objective || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <button
                                onClick={(e) => openLibMenu(activity.id, e.currentTarget)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="More actions"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

          {/* Library dropdown menu */}
          {libMenuId && libMenuPos && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLibMenuId(null)} />
              <div
                className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36"
                style={{ top: libMenuPos.top, left: libMenuPos.left }}
              >
                <Link
                  href={`/admin/modules/${libMenuId}`}
                  onClick={() => setLibMenuId(null)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Link>
                <button
                  onClick={() => {
                    setDeleteId(libMenuId);
                    setLibMenuId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}

          {/* Template Activities Table */}
          {templateRows.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-white">Template Activities</h2>
                <span className="text-sm text-white/60">
                  ({templateRows.length} across {templates.filter(t => t.modules.length > 0).length} template{templates.filter(t => t.modules.length > 0).length !== 1 ? 's' : ''})
                </span>
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {tmplColumns.map((col) => (
                          <th key={col.key} className="text-left px-4 py-3 font-medium text-gray-600">
                            <button
                              type="button"
                              onClick={() => toggleTmplSort(col.key)}
                              className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                            >
                              {col.label}
                              <TmplSortIcon column={col.key} />
                            </button>
                          </th>
                        ))}
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Objective</th>
                        <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedTemplateRows.map((row) => (
                        <tr key={row.moduleId} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{row.templateName}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.title}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                              {row.step_count}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm max-w-xs truncate">
                            {row.objective || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <button
                                onClick={(e) => openTmplMenu(row.moduleId, e.currentTarget)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                title="More actions"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Template dropdown menu */}
              {tmplMenuId && tmplMenuPos && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTmplMenuId(null)} />
                  <div
                    className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40"
                    style={{ top: tmplMenuPos.top, left: tmplMenuPos.left }}
                  >
                    <Link
                      href={`/admin/templates/${templateRows.find(r => r.moduleId === tmplMenuId)?.templateId}`}
                      onClick={() => setTmplMenuId(null)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View in Template
                    </Link>
                  </div>
                </>
              )}
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
