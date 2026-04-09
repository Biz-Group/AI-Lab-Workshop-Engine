'use client';

import { useState, useCallback } from 'react';
import {
  Save,
  Pencil,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  FileText,
  Clock,
  Eye,
  EyeOff,
  Layers,
  ListChecks,
  MessageSquareText,
  ExternalLink,
  BookOpen,
  BookmarkPlus,
} from 'lucide-react';
import { Card, CardContent, Button, Input, TextArea, Modal, ConfirmModal } from '@/components/ui';
import { TemplatePreview } from './TemplatePreview';
import toast from 'react-hot-toast';

// ─── Types ──────────────────────────────────────────────────────────────
interface PromptBlock {
  id: string;
  title: string;
  content_markdown: string;
  is_copyable: boolean;
  order_index: number;
}

interface Step {
  id: string;
  title: string;
  instruction_markdown: string;
  estimated_minutes: number | null;
  is_required: boolean;
  order_index: number;
  ai_tool_name: string | null;
  ai_tool_url: string | null;
  prompt_blocks: PromptBlock[];
}

interface Module {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  steps: Step[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  estimated_duration_minutes: number;
  is_published: boolean;
  ai_tool_name: string;
  ai_tool_url: string;
  organization_id: string;
  created_at: string;
  modules: Module[];
}

// ─── Main TemplateEditor ────────────────────────────────────────────────
export function TemplateEditor({ template: initialTemplate }: { template: Template }) {
  const [template, setTemplate] = useState(initialTemplate);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Template metadata form state
  const [metaForm, setMetaForm] = useState({
    name: template.name,
    description: template.description || '',
    estimated_duration_minutes: template.estimated_duration_minutes,
    ai_tool_name: template.ai_tool_name || 'ChatGPT',
    ai_tool_url: template.ai_tool_url || 'https://chat.openai.com',
  });

  const saveTemplateMeta = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTemplate(prev => ({ ...prev, ...metaForm }));
      setEditingMeta(false);
      toast.success('Template updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async () => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !template.is_published }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTemplate(prev => ({ ...prev, is_published: !prev.is_published }));
      toast.success(template.is_published ? 'Template unpublished' : 'Template published');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle publish');
    } finally {
      setIsToggling(false);
    }
  };

  // ── Granular state updaters (no more router.refresh) ──────────────
  const handleModuleAdded = useCallback((newModule: { id: string; title: string; objective: string | null; order_index: number; steps?: Step[] }) => {
    setTemplate(prev => ({
      ...prev,
      modules: [...prev.modules, { ...newModule, steps: newModule.steps ?? [] }],
    }));
  }, []);

  const handleModuleUpdated = useCallback((moduleId: string, updates: Partial<Module>) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m => m.id === moduleId ? { ...m, ...updates } : m),
    }));
  }, []);

  const handleModuleDeleted = useCallback((moduleId: string) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.filter(m => m.id !== moduleId),
    }));
  }, []);

  const handleStepAdded = useCallback((moduleId: string, newStep: { id: string; title: string; order_index: number; instruction_markdown: string; estimated_minutes: number | null; is_required: boolean; ai_tool_name: string | null; ai_tool_url: string | null }) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? { ...m, steps: [...m.steps, { ...newStep, prompt_blocks: [] }] }
          : m
      ),
    }));
  }, []);

  const handleStepUpdated = useCallback((moduleId: string, stepId: string, updates: Partial<Step>) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? { ...m, steps: m.steps.map(s => s.id === stepId ? { ...s, ...updates } : s) }
          : m
      ),
    }));
  }, []);

  const handleStepDeleted = useCallback((moduleId: string, stepId: string) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? { ...m, steps: m.steps.filter(s => s.id !== stepId) }
          : m
      ),
    }));
  }, []);

  const handleBlockAdded = useCallback((moduleId: string, stepId: string, newBlock: { id: string; title: string; order_index: number; content_markdown: string; is_copyable: boolean }) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? {
              ...m,
              steps: m.steps.map(s =>
                s.id === stepId
                  ? { ...s, prompt_blocks: [...s.prompt_blocks, newBlock] }
                  : s
              ),
            }
          : m
      ),
    }));
  }, []);

  const handleBlockUpdated = useCallback((moduleId: string, stepId: string, blockId: string, updates: Partial<PromptBlock>) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? {
              ...m,
              steps: m.steps.map(s =>
                s.id === stepId
                  ? { ...s, prompt_blocks: s.prompt_blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }
                  : s
              ),
            }
          : m
      ),
    }));
  }, []);

  const handleBlockDeleted = useCallback((moduleId: string, stepId: string, blockId: string) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map(m =>
        m.id === moduleId
          ? {
              ...m,
              steps: m.steps.map(s =>
                s.id === stepId
                  ? { ...s, prompt_blocks: s.prompt_blocks.filter(b => b.id !== blockId) }
                  : s
              ),
            }
          : m
      ),
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Template Header */}
      <Card>
        <CardContent className="p-6">
          {editingMeta ? (
            <div className="space-y-4">
              <Input
                label="Template Name"
                value={metaForm.name}
                onChange={(e) => setMetaForm(prev => ({ ...prev, name: e.target.value }))}
              />
              <TextArea
                label="Description"
                value={metaForm.description}
                onChange={(e) => setMetaForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
              <Input
                label="Estimated Duration (minutes)"
                type="number"
                value={metaForm.estimated_duration_minutes}
                onChange={(e) => setMetaForm(prev => ({ ...prev, estimated_duration_minutes: parseInt(e.target.value) || 1 }))}
                min={1}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="AI Tool Button Label"
                  value={metaForm.ai_tool_name}
                  onChange={(e) => setMetaForm(prev => ({ ...prev, ai_tool_name: e.target.value }))}
                  placeholder="e.g. ChatGPT, Claude, Gemini"
                />
                <Input
                  label="AI Tool URL"
                  value={metaForm.ai_tool_url}
                  onChange={(e) => setMetaForm(prev => ({ ...prev, ai_tool_url: e.target.value }))}
                  placeholder="https://chat.openai.com"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveTemplateMeta} disabled={!metaForm.name.trim() || isSaving}>
                  <Save className="w-4 h-4 mr-1" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={() => {
                  setMetaForm({
                    name: template.name,
                    description: template.description || '',
                    estimated_duration_minutes: template.estimated_duration_minutes,
                    ai_tool_name: template.ai_tool_name || 'ChatGPT',
                    ai_tool_url: template.ai_tool_url || 'https://chat.openai.com',
                  });
                  setEditingMeta(false);
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    template.is_published
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {template.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                {template.description && (
                  <p className="text-gray-600 mb-2">{template.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {template.estimated_duration_minutes} min
                  </span>
                  <span>{template.modules.length} activities</span>
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {template.ai_tool_name || 'ChatGPT'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsPreviewing(true)}>
                  <Eye className="w-4 h-4 mr-1" /> Preview
                </Button>
                <Button variant="secondary" size="sm" onClick={togglePublish} disabled={isToggling}>
                  {template.is_published ? (
                    <><EyeOff className="w-4 h-4 mr-1" /> Unpublish</>
                  ) : (
                    <><Eye className="w-4 h-4 mr-1" /> Publish</>
                  )}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditingMeta(true)}>
                  Edit Details
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Activities</h2>

        {template.modules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-600 mb-4">No activities yet. Add your first activity to get started.</p>
            </CardContent>
          </Card>
        ) : (
          template.modules.map((mod, index) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              displayIndex={index + 1}
              templateId={template.id}
              onModuleUpdated={handleModuleUpdated}
              onModuleDeleted={handleModuleDeleted}
              onStepAdded={handleStepAdded}
              onStepUpdated={handleStepUpdated}
              onStepDeleted={handleStepDeleted}
              onBlockAdded={handleBlockAdded}
              onBlockUpdated={handleBlockUpdated}
              onBlockDeleted={handleBlockDeleted}
            />
          ))
        )}

        <AddModuleButton templateId={template.id} currentCount={template.modules.length} onAdded={handleModuleAdded} />
      </div>

      {/* Template Preview */}
      {isPreviewing && (
        <TemplatePreview
          templateName={template.name}
          modules={template.modules}
          aiToolName={template.ai_tool_name || 'ChatGPT'}
          aiToolUrl={template.ai_tool_url || 'https://chat.openai.com'}
          onClose={() => setIsPreviewing(false)}
        />
      )}
    </div>
  );
}

// ─── Add Module Button ──────────────────────────────────────────────────
function AddModuleButton({ templateId, currentCount, onAdded }: {
  templateId: string;
  currentCount: number;
  onAdded: (newModule: { id: string; title: string; objective: string | null; order_index: number; steps?: Step[] }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'library'>('new');
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Library tab state
  const [libraryActivities, setLibraryActivities] = useState<Array<{ id: string; title: string; objective: string | null; step_count: number }>>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [isInserting, setIsInserting] = useState<string | null>(null);

  const loadLibrary = async () => {
    if (libraryLoaded) return;
    setIsLoadingLibrary(true);
    try {
      const res = await fetch('/api/admin/library');
      const data = await res.json();
      if (data.success) {
        setLibraryActivities(data.data);
        setLibraryLoaded(true);
      }
    } catch {
      toast.error('Failed to load library');
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleTabChange = (tab: 'new' | 'library') => {
    setActiveTab(tab);
    if (tab === 'library') loadLibrary();
  };

  const handleAdd = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          title: title.trim(),
          objective: objective.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity added');
      onAdded({
        id: data.data.id,
        title: data.data.title,
        objective: data.data.objective ?? (objective.trim() || null),
        order_index: data.data.order_index,
      });
      setTitle('');
      setObjective('');
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add activity');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertFromLibrary = async (activityId: string) => {
    setIsInserting(activityId);
    try {
      const res = await fetch('/api/admin/library/insert-into-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: activityId,
          template_id: templateId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity added from library');
      onAdded(data.data);
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add from library');
    } finally {
      setIsInserting(null);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTitle('');
    setObjective('');
    setActiveTab('new');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-brand-400 hover:bg-brand-50/50 transition-all duration-150 cursor-pointer"
      >
        <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
          <Layers className="w-4.5 h-4.5 text-brand-600" />
        </div>
        <span className="flex-1 text-left text-sm font-medium text-gray-500 group-hover:text-brand-700 transition-colors">Add an activity…</span>
        <Plus className="w-4 h-4 text-gray-400 group-hover:text-brand-600 transition-colors" />
      </button>
      <Modal isOpen={isOpen} onClose={handleClose} title="Add Activity">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            onClick={() => handleTabChange('new')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            New Activity
          </button>
          <button
            onClick={() => handleTabChange('library')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'library'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            From Library
          </button>
        </div>

        {activeTab === 'new' ? (
          <div className="space-y-4">
            <Input
              label="Activity Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction"
            />
            <TextArea
              label="Objective (optional)"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
              placeholder="What participants will learn"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!title.trim() || isSaving}>
                {isSaving ? 'Adding...' : 'Add Activity'}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {isLoadingLibrary ? (
              <div className="py-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading library…</p>
              </div>
            ) : libraryActivities.length === 0 ? (
              <div className="py-8 text-center">
                <Layers className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500 mb-2">No activities in the library yet.</p>
                <p className="text-xs text-gray-400">Save activities from templates or create them in the Activity Library.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {libraryActivities.map((activity) => (
                  <button
                    key={activity.id}
                    onClick={() => handleInsertFromLibrary(activity.id)}
                    disabled={!!isInserting}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-gray-900 truncate">{activity.title}</div>
                        {activity.objective && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{activity.objective}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className="text-xs text-gray-400">
                          {activity.step_count} step{activity.step_count !== 1 ? 's' : ''}
                        </span>
                        {isInserting === activity.id ? (
                          <div className="animate-spin w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full" />
                        ) : (
                          <Plus className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Module Card (collapsible) ──────────────────────────────────────────
function ModuleCard({ module: mod, displayIndex, templateId, onModuleUpdated, onModuleDeleted, onStepAdded, onStepUpdated, onStepDeleted, onBlockAdded, onBlockUpdated, onBlockDeleted }: {
  module: Module;
  displayIndex: number;
  templateId: string;
  onModuleUpdated: (moduleId: string, updates: Partial<Module>) => void;
  onModuleDeleted: (moduleId: string) => void;
  onStepAdded: (moduleId: string, newStep: { id: string; title: string; order_index: number; instruction_markdown: string; estimated_minutes: number | null; is_required: boolean; ai_tool_name: string | null; ai_tool_url: string | null }) => void;
  onStepUpdated: (moduleId: string, stepId: string, updates: Partial<Step>) => void;
  onStepDeleted: (moduleId: string, stepId: string) => void;
  onBlockAdded: (moduleId: string, stepId: string, newBlock: { id: string; title: string; order_index: number; content_markdown: string; is_copyable: boolean }) => void;
  onBlockUpdated: (moduleId: string, stepId: string, blockId: string, updates: Partial<PromptBlock>) => void;
  onBlockDeleted: (moduleId: string, stepId: string, blockId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [editForm, setEditForm] = useState({ title: mod.title, objective: mod.objective || '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/modules/${mod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          objective: editForm.objective.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity updated');
      setIsEditing(false);
      onModuleUpdated(mod.id, { title: editForm.title.trim(), objective: editForm.objective.trim() || null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/modules/${mod.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity deleted');
      onModuleDeleted(mod.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    setIsSavingToLibrary(true);
    try {
      const res = await fetch('/api/admin/library/save-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_id: mod.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Saved to library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save to library');
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  return (
    <Card>
      <div className="border-l-4 border-brand-500">
        {/* Activity Header */}
        <div className="p-4 bg-gradient-to-r from-brand-50/60 to-transparent flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-3 text-left flex-1 min-w-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
            )}
            <div className="w-9 h-9 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {displayIndex}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-brand-600 uppercase tracking-wider">
                  Activity {displayIndex}
                </span>
                <h3 className="font-semibold text-gray-900 truncate">{mod.title}</h3>
              </div>
              {mod.objective && (
                <p className="text-sm text-gray-500 mt-0.5 truncate">{mod.objective}</p>
              )}
            </div>
          </button>
          <div className="flex items-center gap-3 ml-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                <ListChecks className="w-3 h-3" />
                {mod.steps.length} step{mod.steps.length !== 1 ? 's' : ''}
              </span>
              {mod.steps.length > 0 && (
                <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  {mod.steps.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0)}m
                </span>
              )}
            </div>
            <button
              onClick={handleSaveToLibrary}
              disabled={isSavingToLibrary}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors disabled:opacity-50"
              title="Save to library"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setEditForm({ title: mod.title, objective: mod.objective || '' });
                setIsEditing(true);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Edit activity"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsDeleting(true)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete activity"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 pb-4">
            <div className="border-t border-gray-200 pt-4">
              {mod.steps.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-2 pl-6">No steps in this activity yet. Add your first step below.</p>
              ) : (
                <div className="pl-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</span>
                  </div>
                  {mod.steps.map((step) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      moduleId={mod.id}
                      onStepUpdated={onStepUpdated}
                      onStepDeleted={onStepDeleted}
                      onBlockAdded={onBlockAdded}
                      onBlockUpdated={onBlockUpdated}
                      onBlockDeleted={onBlockDeleted}
                    />
                  ))}
                </div>
              )}
              <div className="pl-4">
                <AddStepButton moduleId={mod.id} currentCount={mod.steps.length} onAdded={(newStep) => onStepAdded(mod.id, newStep)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Module Modal */}
      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Activity">
        <div className="space-y-4">
          <Input
            label="Title"
            value={editForm.title}
            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
          />
          <TextArea
            label="Objective"
            value={editForm.objective}
            onChange={(e) => setEditForm(prev => ({ ...prev, objective: e.target.value }))}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editForm.title.trim() || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={handleDelete}
        title="Delete Activity"
        description={`Delete "${mod.title}" and all its steps and prompt blocks? This cannot be undone.`}
        confirmText="Delete Activity"
        variant="danger"
        isLoading={isDeleteLoading}
      />
    </Card>
  );
}

// ─── Step Row (collapsible) ─────────────────────────────────────────────
function StepRow({ step, moduleId, onStepUpdated, onStepDeleted, onBlockAdded, onBlockUpdated, onBlockDeleted }: {
  step: Step;
  moduleId: string;
  onStepUpdated: (moduleId: string, stepId: string, updates: Partial<Step>) => void;
  onStepDeleted: (moduleId: string, stepId: string) => void;
  onBlockAdded: (moduleId: string, stepId: string, newBlock: { id: string; title: string; order_index: number; content_markdown: string; is_copyable: boolean }) => void;
  onBlockUpdated: (moduleId: string, stepId: string, blockId: string, updates: Partial<PromptBlock>) => void;
  onBlockDeleted: (moduleId: string, stepId: string, blockId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    title: step.title,
    instruction_markdown: step.instruction_markdown || '',
    estimated_minutes: step.estimated_minutes,
    is_required: step.is_required,
    ai_tool_name: step.ai_tool_name || '',
    ai_tool_url: step.ai_tool_url || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...editForm,
        ai_tool_name: editForm.ai_tool_name.trim() || null,
        ai_tool_url: editForm.ai_tool_url.trim() || null,
      };
      const res = await fetch(`/api/admin/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Step updated');
      setIsEditing(false);
      onStepUpdated(moduleId, step.id, payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update step');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/steps/${step.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Step deleted');
      onStepDeleted(moduleId, step.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete step');
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg mb-3 bg-white shadow-sm hover:shadow-md transition-shadow border-l-[3px] border-l-brand-300">
      {/* Step header */}
      <div className="px-3 py-2.5 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 text-left flex-1 min-w-0"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
            {step.order_index + 1}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">{step.title}</span>
          {step.estimated_minutes != null && step.estimated_minutes > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
              <Clock className="w-3 h-3" />
              {step.estimated_minutes}m
            </span>
          )}
          {step.is_required && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium shrink-0">
              Required
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs text-gray-400">{step.prompt_blocks.length} block{step.prompt_blocks.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => {
              setEditForm({
                title: step.title,
                instruction_markdown: step.instruction_markdown || '',
                estimated_minutes: step.estimated_minutes,
                is_required: step.is_required,
                ai_tool_name: step.ai_tool_name || '',
                ai_tool_url: step.ai_tool_url || '',
              });
              setIsEditing(true);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Edit step"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsDeleting(true)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete step"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded: instructions + prompt blocks */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {step.instruction_markdown && (
            <div className="mt-3 mb-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Instructions</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {step.instruction_markdown}
              </p>
            </div>
          )}

          {/* Prompt Blocks */}
          <div className="space-y-2 mt-2">
            {step.prompt_blocks.length > 0 && (
              <div className="flex items-center gap-1.5 mb-1">
                <MessageSquareText className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Prompt Blocks</span>
              </div>
            )}
            {step.prompt_blocks.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No prompt blocks.</p>
            ) : (
              step.prompt_blocks.map((block) => (
                <PromptBlockRow
                  key={block.id}
                  block={block}
                  moduleId={moduleId}
                  stepId={step.id}
                  onBlockUpdated={onBlockUpdated}
                  onBlockDeleted={onBlockDeleted}
                />
              ))
            )}
            <AddPromptBlockButton stepId={step.id} currentCount={step.prompt_blocks.length} onAdded={(newBlock) => onBlockAdded(moduleId, step.id, newBlock)} />
          </div>
        </div>
      )}

      {/* Edit Step Modal */}
      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Step">
        <div className="space-y-4">
          <Input
            label="Title"
            value={editForm.title}
            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
          />
          <TextArea
            label="Instructions"
            value={editForm.instruction_markdown}
            onChange={(e) => setEditForm(prev => ({ ...prev, instruction_markdown: e.target.value }))}
            rows={8}
            placeholder={'Why this matters: Explain the value of the step.\n\nActions:\n1. Tell participants what to do.\n\nDeliverable:\nWhat should they leave with?\n\nSuccess signal:\nHow will they know this is strong enough?\n\nReflect:\nWhat should they notice or learn?\n\nNext up:\nWhat does this prepare them for next?'}
          />
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Guide participants through a full learning beat: why this matters, what to do, what to submit, how to judge success, and what comes next.
          </div>
          <Input
            label="Duration (minutes)"
            type="number"
            value={editForm.estimated_minutes ?? ''}
            onChange={(e) =>
              setEditForm(prev => ({
                ...prev,
                estimated_minutes: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
            min={1}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={editForm.is_required}
              onChange={(e) => setEditForm(prev => ({ ...prev, is_required: e.target.checked }))}
            />
            Required step
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="AI Tool Button Label (optional)"
              value={editForm.ai_tool_name}
              onChange={(e) => setEditForm(prev => ({ ...prev, ai_tool_name: e.target.value }))}
              placeholder={`Inherited from template`}
            />
            <Input
              label="AI Tool URL (optional)"
              value={editForm.ai_tool_url}
              onChange={(e) => setEditForm(prev => ({ ...prev, ai_tool_url: e.target.value }))}
              placeholder={`Inherited from template`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editForm.title.trim() || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={handleDelete}
        title="Delete Step"
        description={`Delete "${step.title}" and all its prompt blocks? This cannot be undone.`}
        confirmText="Delete Step"
        variant="danger"
        isLoading={isDeleteLoading}
      />
    </div>
  );
}

// ─── Prompt Block Row ───────────────────────────────────────────────────
function PromptBlockRow({ block, moduleId, stepId, onBlockUpdated, onBlockDeleted }: {
  block: PromptBlock;
  moduleId: string;
  stepId: string;
  onBlockUpdated: (moduleId: string, stepId: string, blockId: string, updates: Partial<PromptBlock>) => void;
  onBlockDeleted: (moduleId: string, stepId: string, blockId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    title: block.title,
    content_markdown: block.content_markdown,
    is_copyable: block.is_copyable,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/prompt-blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Block updated');
      setIsEditing(false);
      onBlockUpdated(moduleId, stepId, block.id, editForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update block');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/prompt-blocks/${block.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Block deleted');
      onBlockDeleted(moduleId, stepId, block.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete block');
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/60 border-l-[3px] border-l-blue-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-xs font-medium text-gray-700">{block.title}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
              {block.is_copyable ? 'Copyable' : 'Read only'}
            </span>
          </div>
          <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap pl-5.5">
            {block.content_markdown}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={() => {
              setEditForm({
                title: block.title,
                content_markdown: block.content_markdown,
                is_copyable: block.is_copyable,
              });
              setIsEditing(true);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Edit block"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsDeleting(true)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete block"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Prompt Block">
        <div className="space-y-4">
          <Input
            label="Title"
            value={editForm.title}
            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={editForm.is_copyable}
              onChange={(e) => setEditForm(prev => ({ ...prev, is_copyable: e.target.checked }))}
            />
            Participants can copy this block
          </label>
          <TextArea
            label="Content (Markdown)"
            value={editForm.content_markdown}
            onChange={(e) => setEditForm(prev => ({ ...prev, content_markdown: e.target.value }))}
            rows={8}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editForm.title.trim() || isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={handleDelete}
        title="Delete Prompt Block"
        description={`Delete "${block.title}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleteLoading}
      />
    </div>
  );
}

// ─── Add Step Button ────────────────────────────────────────────────────
function AddStepButton({ moduleId, currentCount, onAdded }: {
  moduleId: string;
  currentCount: number;
  onAdded: (newStep: { id: string; title: string; order_index: number; instruction_markdown: string; estimated_minutes: number | null; is_required: boolean; ai_tool_name: string | null; ai_tool_url: string | null }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [instructionMarkdown, setInstructionMarkdown] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(5);
  const [isRequired, setIsRequired] = useState(false);
  const [aiToolName, setAiToolName] = useState('');
  const [aiToolUrl, setAiToolUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: moduleId,
          title: title.trim(),
          instruction_markdown: instructionMarkdown.trim() || '',
          estimated_minutes: estimatedMinutes,
          is_required: isRequired,
          ai_tool_name: aiToolName.trim() || null,
          ai_tool_url: aiToolUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Step added');
      onAdded({
        id: data.data.id,
        title: data.data.title,
        order_index: data.data.order_index,
        instruction_markdown: instructionMarkdown.trim() || '',
        estimated_minutes: estimatedMinutes,
        is_required: isRequired,
        ai_tool_name: aiToolName.trim() || null,
        ai_tool_url: aiToolUrl.trim() || null,
      });
      setTitle('');
      setInstructionMarkdown('');
      setEstimatedMinutes(5);
      setIsRequired(false);
      setAiToolName('');
      setAiToolUrl('');
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add step');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-2 mt-3 px-3 py-2 w-full rounded-lg border border-dashed border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/50 transition-all duration-150 cursor-pointer"
      >
        <div className="w-6 h-6 rounded-md bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
          <ListChecks className="w-3.5 h-3.5 text-brand-600" />
        </div>
        <span className="text-xs font-medium text-gray-500 group-hover:text-brand-700 transition-colors">Add Step</span>
        <Plus className="w-3 h-3 ml-auto text-gray-400 group-hover:text-brand-600 transition-colors" />
      </button>
      <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); setTitle(''); setInstructionMarkdown(''); setEstimatedMinutes(5); setIsRequired(false); setAiToolName(''); setAiToolUrl(''); }} title="Add Step">
        <div className="space-y-4">
          <Input
            label="Step Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Brainstorm Ideas"
          />
          <TextArea
            label="Instructions (optional)"
            value={instructionMarkdown}
            onChange={(e) => setInstructionMarkdown(e.target.value)}
            rows={8}
            placeholder={'Why this matters: Explain the value of the step.\n\nActions:\n1. Tell participants what to do.\n\nDeliverable:\nWhat should they leave with?\n\nSuccess signal:\nHow will they know this is strong enough?\n\nReflect:\nWhat should they notice or learn?\n\nNext up:\nWhat does this prepare them for next?'}
          />
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Recommended structure: Why this matters, Actions, Deliverable, Checklist, Tips, Success signal, Reflect, and Next up.
          </div>
          <Input
            label="Duration (minutes)"
            type="number"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            Required step
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="AI Tool Button Label (optional)"
              value={aiToolName}
              onChange={(e) => setAiToolName(e.target.value)}
              placeholder="Inherited from template"
            />
            <Input
              label="AI Tool URL (optional)"
              value={aiToolUrl}
              onChange={(e) => setAiToolUrl(e.target.value)}
              placeholder="Inherited from template"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setIsOpen(false); setTitle(''); setInstructionMarkdown(''); setEstimatedMinutes(5); setIsRequired(false); setAiToolName(''); setAiToolUrl(''); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!title.trim() || isSaving}>
              {isSaving ? 'Adding...' : 'Add Step'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Add Prompt Block Button ────────────────────────────────────────────
function AddPromptBlockButton({ stepId, currentCount, onAdded }: {
  stepId: string;
  currentCount: number;
  onAdded: (newBlock: { id: string; title: string; order_index: number; content_markdown: string; is_copyable: boolean }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isCopyable, setIsCopyable] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/prompt-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_id: stepId,
          title: title.trim(),
          content_markdown: content.trim(),
          is_copyable: isCopyable,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Prompt block added');
      onAdded({
        id: data.data.id,
        title: data.data.title,
        order_index: data.data.order_index,
        content_markdown: content.trim(),
        is_copyable: isCopyable,
      });
      setTitle('');
      setContent('');
      setIsCopyable(true);
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add block');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-2 mt-2 px-3 py-1.5 w-full rounded-lg border border-dashed border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/50 transition-all duration-150 cursor-pointer"
      >
        <div className="w-5 h-5 rounded-md bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
          <MessageSquareText className="w-3 h-3 text-brand-600" />
        </div>
        <span className="text-xs font-medium text-gray-500 group-hover:text-brand-700 transition-colors">Add Prompt Block</span>
        <Plus className="w-3 h-3 ml-auto text-gray-400 group-hover:text-brand-600 transition-colors" />
      </button>
      <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); setTitle(''); setContent(''); setIsCopyable(true); }} title="Add Prompt Block">
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Main Prompt"
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isCopyable}
              onChange={(e) => setIsCopyable(e.target.checked)}
            />
            Participants can copy this block
          </label>
          <TextArea
            label="Content (Markdown)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Prompt content with {{variable}} placeholders"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setIsOpen(false); setTitle(''); setContent(''); setIsCopyable(true); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!title.trim() || !content.trim() || isSaving}>
              {isSaving ? 'Adding...' : 'Add Block'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
