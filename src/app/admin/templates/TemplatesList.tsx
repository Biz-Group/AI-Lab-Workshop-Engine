'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, Eye, EyeOff, Clock, Layers, MoreHorizontal, FileText } from 'lucide-react';
import { Card, Button, ConfirmModal } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Template {
  id: string;
  name: string;
  description: string | null;
  estimated_duration_minutes: number;
  is_published: boolean;
  created_at: string;
  module_count: number;
}

type SortKey = 'name' | 'module_count' | 'estimated_duration_minutes' | 'is_published' | 'created_at';
type SortDir = 'asc' | 'desc';

export function TemplatesList({ templates: initialTemplates }: { templates: Template[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [deleteTemplate, setDeleteTemplate] = useState<Template | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...templates].sort((a, b) => {
      if (sortKey === 'created_at') {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
      }
      if (sortKey === 'module_count' || sortKey === 'estimated_duration_minutes') {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'is_published') {
        const aVal = a.is_published ? 1 : 0;
        const bVal = b.is_published ? 1 : 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aVal = String(a[sortKey]).toLowerCase();
      const bVal = String(b[sortKey]).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [templates, sortKey, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-brand-600" />;
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'module_count', label: 'Activities' },
    { key: 'estimated_duration_minutes', label: 'Duration' },
    { key: 'is_published', label: 'Status' },
    { key: 'created_at', label: 'Created' },
  ];

  const openMenu = useCallback((id: string, btnEl: HTMLButtonElement) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }
    const rect = btnEl.getBoundingClientRect();
    const menuHeight = 120;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    setMenuPos({ top, left: rect.right - 160 });
    setOpenMenuId(id);
  }, [openMenuId]);

  const handleTogglePublish = async (template: Template) => {
    if (togglingId) return;
    setTogglingId(template.id);
    setOpenMenuId(null);
    try {
      const response = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !template.is_published }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTemplates(prev => prev.map(t =>
        t.id === template.id ? { ...t, is_published: !t.is_published } : t
      ));
      toast.success(template.is_published ? 'Template unpublished' : 'Template published');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTemplate) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/templates/${deleteTemplate.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setTemplates(prev => prev.filter(t => t.id !== deleteTemplate.id));
      setDeleteTemplate(null);
      toast.success('Template deleted');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  if (templates.length === 0) {
    return (
      <Card>
        <div className="p-8 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 mb-2">No Templates Yet</h3>
          <p className="text-sm text-gray-600 mb-4">Create your first workshop template to get started.</p>
          <Link href="/admin/templates/new">
            <Button>Create Template</Button>
          </Link>
        </div>
      </Card>
    );
  }

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
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50/60 transition-colors whitespace-nowrap">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{template.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-gray-400" />
                      {template.module_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {template.estimated_duration_minutes} min
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      template.is_published
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {template.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDateTime(template.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={(e) => openMenu(template.id, e.currentTarget)}
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

      {/* Floating dropdown menu */}
      {openMenuId && menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-40"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <Link
              href={`/admin/templates/${openMenuId}`}
              onClick={() => setOpenMenuId(null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
            <button
              onClick={() => {
                const t = templates.find(x => x.id === openMenuId);
                if (t) handleTogglePublish(t);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {templates.find(x => x.id === openMenuId)?.is_published
                ? <><EyeOff className="w-3.5 h-3.5" /> Unpublish</>
                : <><Eye className="w-3.5 h-3.5" /> Publish</>
              }
            </button>
            <button
              onClick={() => {
                const t = templates.find(x => x.id === openMenuId);
                if (t) { setDeleteTemplate(t); setOpenMenuId(null); }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={!!deleteTemplate}
        onClose={() => setDeleteTemplate(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteTemplate?.name}"? This will permanently remove all modules, steps, and prompt blocks. Active sessions using this template will not be affected.`}
        confirmText="Delete Template"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}
