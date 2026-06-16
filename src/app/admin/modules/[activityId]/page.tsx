'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Pencil,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  ListChecks,
  MessageSquareText,
  BookOpen,
  Layers,
} from 'lucide-react';
import { Card, CardContent, Button, Input, TextArea, Modal, ConfirmModal } from '@/components/ui';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface PromptBlock {
  id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
}

interface Step {
  id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name: string | null;
  ai_tool_url: string | null;
  prompt_blocks: PromptBlock[];
}

interface Activity {
  id: string;
  title: string;
  objective: string | null;
  steps: Step[];
}

export default function LibraryActivityEditorPage({ params }: { params: Promise<{ activityId: string }> }) {
  const [activityId, setActivityId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({ title: '', objective: '' });
  const [isHeaderSaving, setIsHeaderSaving] = useState(false);

  // Unwrap params
  useEffect(() => {
    params.then(p => setActivityId(p.activityId));
  }, [params]);

  const loadActivity = useCallback(async () => {
    if (!activityId) return;
    try {
      const res = await fetch(`/api/admin/library/${activityId}`);
      const data = await res.json();
      if (data.success) {
        setActivity(data.data);
        setHeaderForm({ title: data.data.title, objective: data.data.objective || '' });
      } else {
        toast.error('Failed to load activity');
      }
    } catch {
      toast.error('Failed to load activity');
    } finally {
      setIsLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    if (activityId) loadActivity();
  }, [activityId, loadActivity]);

  const handleHeaderSave = async () => {
    if (!activityId) return;
    setIsHeaderSaving(true);
    try {
      const res = await fetch(`/api/admin/library/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: headerForm.title.trim(),
          objective: headerForm.objective.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Activity updated');
      setActivity(prev => prev ? { ...prev, title: headerForm.title.trim(), objective: headerForm.objective.trim() || null } : prev);
      setIsEditingHeader(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsHeaderSaving(false);
    }
  };

  // Step callbacks
  const handleStepAdded = useCallback((newStep: Step) => {
    setActivity(prev => {
      if (!prev) return prev;
      return { ...prev, steps: [...prev.steps, newStep] };
    });
  }, []);

  const handleStepUpdated = useCallback((stepId: string, updates: Partial<Step>) => {
    setActivity(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map(s => s.id === stepId ? { ...s, ...updates } : s),
      };
    });
  }, []);

  const handleStepDeleted = useCallback((stepId: string) => {
    setActivity(prev => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.filter(s => s.id !== stepId) };
    });
  }, []);

  // Block callbacks
  const handleBlockAdded = useCallback((stepId: string, newBlock: PromptBlock) => {
    setActivity(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId ? { ...s, prompt_blocks: [...s.prompt_blocks, newBlock] } : s
        ),
      };
    });
  }, []);

  const handleBlockUpdated = useCallback((stepId: string, blockId: string, updates: Partial<PromptBlock>) => {
    setActivity(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId
            ? { ...s, prompt_blocks: s.prompt_blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }
            : s
        ),
      };
    });
  }, []);

  const handleBlockDeleted = useCallback((stepId: string, blockId: string) => {
    setActivity(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map(s =>
          s.id === stepId
            ? { ...s, prompt_blocks: s.prompt_blocks.filter(b => b.id !== blockId) }
            : s
        ),
      };
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading activity…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Activity Not Found</h3>
            <Link href="/admin/modules" className="text-brand-600 hover:underline font-medium">
              Back to Library
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        href="/admin/modules"
        className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Library
      </Link>

      {/* Activity header card */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{activity.title}</h1>
                {activity.objective && (
                  <p className="text-sm text-gray-500 mt-1">{activity.objective}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>{activity.steps.length} step{activity.steps.length !== 1 ? 's' : ''}</span>
                  {activity.steps.length > 0 && (
                    <span>{activity.steps.reduce((sum, s) => sum + (s.estimated_minutes ?? 0), 0)} min total</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setHeaderForm({ title: activity.title, objective: activity.objective || '' });
                setIsEditingHeader(true);
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Edit activity details"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Steps section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ListChecks className="w-4 h-4 text-white/60" />
          <span className="text-sm font-semibold text-white/60 uppercase tracking-wider">Steps</span>
        </div>

        {activity.steps.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ListChecks className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500 mb-4">No steps yet. Add your first step to this activity.</p>
            </CardContent>
          </Card>
        ) : (
          activity.steps.map((step) => (
            <LibraryStepRow
              key={step.id}
              step={step}
              activityId={activityId!}
              onStepUpdated={handleStepUpdated}
              onStepDeleted={handleStepDeleted}
              onBlockAdded={handleBlockAdded}
              onBlockUpdated={handleBlockUpdated}
              onBlockDeleted={handleBlockDeleted}
            />
          ))
        )}

        <AddLibraryStepButton activityId={activityId!} onAdded={handleStepAdded} />
      </div>

      {/* Edit Header Modal */}
      <Modal isOpen={isEditingHeader} onClose={() => setIsEditingHeader(false)} title="Edit Activity">
        <div className="space-y-4">
          <Input
            label="Title"
            value={headerForm.title}
            onChange={(e) => setHeaderForm(prev => ({ ...prev, title: e.target.value }))}
          />
          <TextArea
            label="Objective (optional)"
            value={headerForm.objective}
            onChange={(e) => setHeaderForm(prev => ({ ...prev, objective: e.target.value }))}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditingHeader(false)}>Cancel</Button>
            <Button onClick={handleHeaderSave} disabled={!headerForm.title.trim() || isHeaderSaving}>
              {isHeaderSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Library Step Row ───────────────────────────────────────────────────
function LibraryStepRow({ step, activityId, onStepUpdated, onStepDeleted, onBlockAdded, onBlockUpdated, onBlockDeleted }: {
  step: Step;
  activityId: string;
  onStepUpdated: (stepId: string, updates: Partial<Step>) => void;
  onStepDeleted: (stepId: string) => void;
  onBlockAdded: (stepId: string, newBlock: PromptBlock) => void;
  onBlockUpdated: (stepId: string, blockId: string, updates: Partial<PromptBlock>) => void;
  onBlockDeleted: (stepId: string, blockId: string) => void;
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
      const res = await fetch(`/api/admin/library/${activityId}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Step updated');
      setIsEditing(false);
      onStepUpdated(step.id, payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update step');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/library/${activityId}/steps/${step.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Step deleted');
      onStepDeleted(step.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete step');
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <Card>
      <div className="border-l-[3px] border-l-brand-300">
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

        {/* Expanded content */}
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
                  <LibraryBlockRow
                    key={block.id}
                    block={block}
                    activityId={activityId}
                    stepId={step.id}
                    onBlockUpdated={onBlockUpdated}
                    onBlockDeleted={onBlockDeleted}
                  />
                ))
              )}
              <AddLibraryBlockButton activityId={activityId} stepId={step.id} onAdded={(newBlock) => onBlockAdded(step.id, newBlock)} />
            </div>
          </div>
        )}

        {/* Edit Step Modal */}
        <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Step">
          <div className="space-y-4">
            <Input label="Title" value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} />
            <TextArea label="Instructions" value={editForm.instruction_markdown} onChange={(e) => setEditForm(prev => ({ ...prev, instruction_markdown: e.target.value }))} rows={4} />
            <Input
              label="Duration (minutes)"
              type="number"
              value={editForm.estimated_minutes ?? ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, estimated_minutes: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1) }))}
              min={1}
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={editForm.is_required} onChange={(e) => setEditForm(prev => ({ ...prev, is_required: e.target.checked }))} />
              Required step
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Input label="AI Tool Label (optional)" value={editForm.ai_tool_name} onChange={(e) => setEditForm(prev => ({ ...prev, ai_tool_name: e.target.value }))} placeholder="e.g. ChatGPT" />
              <Input label="AI Tool URL (optional)" value={editForm.ai_tool_url} onChange={(e) => setEditForm(prev => ({ ...prev, ai_tool_url: e.target.value }))} placeholder="e.g. https://chat.openai.com" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!editForm.title.trim() || isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
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
    </Card>
  );
}

// ─── Library Block Row ──────────────────────────────────────────────────
function LibraryBlockRow({ block, activityId, stepId, onBlockUpdated, onBlockDeleted }: {
  block: PromptBlock;
  activityId: string;
  stepId: string;
  onBlockUpdated: (stepId: string, blockId: string, updates: Partial<PromptBlock>) => void;
  onBlockDeleted: (stepId: string, blockId: string) => void;
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
      const res = await fetch(`/api/admin/library/${activityId}/steps/${stepId}/prompt-blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Block updated');
      setIsEditing(false);
      onBlockUpdated(stepId, block.id, editForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update block');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/library/${activityId}/steps/${stepId}/prompt-blocks/${block.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Block deleted');
      onBlockDeleted(stepId, block.id);
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
              setEditForm({ title: block.title, content_markdown: block.content_markdown, is_copyable: block.is_copyable });
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
          <Input label="Title" value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editForm.is_copyable} onChange={(e) => setEditForm(prev => ({ ...prev, is_copyable: e.target.checked }))} />
            Participants can copy this block
          </label>
          <TextArea label="Content (Markdown)" value={editForm.content_markdown} onChange={(e) => setEditForm(prev => ({ ...prev, content_markdown: e.target.value }))} rows={8} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editForm.title.trim() || isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
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
function AddLibraryStepButton({ activityId, onAdded }: {
  activityId: string;
  onAdded: (newStep: Step) => void;
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
      const res = await fetch(`/api/admin/library/${activityId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        prompt_blocks: [],
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

  const reset = () => {
    setIsOpen(false);
    setTitle('');
    setInstructionMarkdown('');
    setEstimatedMinutes(5);
    setIsRequired(false);
    setAiToolName('');
    setAiToolUrl('');
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
      <Modal isOpen={isOpen} onClose={reset} title="Add Step">
        <div className="space-y-4">
          <Input label="Step Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brainstorm Ideas" />
          <TextArea label="Instructions (optional)" value={instructionMarkdown} onChange={(e) => setInstructionMarkdown(e.target.value)} rows={3} placeholder="Instructions shown to participants" />
          <Input label="Duration (minutes)" type="number" value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(Math.max(1, parseInt(e.target.value) || 1))} min={1} />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            Required step
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Input label="AI Tool Label (optional)" value={aiToolName} onChange={(e) => setAiToolName(e.target.value)} placeholder="e.g. ChatGPT" />
            <Input label="AI Tool URL (optional)" value={aiToolUrl} onChange={(e) => setAiToolUrl(e.target.value)} placeholder="e.g. https://chat.openai.com" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!title.trim() || isSaving}>{isSaving ? 'Adding...' : 'Add Step'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Add Block Button ───────────────────────────────────────────────────
function AddLibraryBlockButton({ activityId, stepId, onAdded }: {
  activityId: string;
  stepId: string;
  onAdded: (newBlock: PromptBlock) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isCopyable, setIsCopyable] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/library/${activityId}/steps/${stepId}/prompt-blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content_markdown: content,
          is_copyable: isCopyable,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Block added');
      onAdded(data.data);
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

  const reset = () => {
    setIsOpen(false);
    setTitle('');
    setContent('');
    setIsCopyable(true);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-2 mt-2 px-3 py-1.5 w-full rounded border border-dashed border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-150 cursor-pointer"
      >
        <MessageSquareText className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" />
        <span className="text-xs text-gray-400 group-hover:text-blue-600 transition-colors">Add Prompt Block</span>
        <Plus className="w-3 h-3 ml-auto text-gray-400 group-hover:text-blue-500 transition-colors" />
      </button>
      <Modal isOpen={isOpen} onClose={reset} title="Add Prompt Block">
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Research Prompt" />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isCopyable} onChange={(e) => setIsCopyable(e.target.checked)} />
            Participants can copy this block
          </label>
          <TextArea label="Content (Markdown)" value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Prompt content..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!title.trim() || isSaving}>{isSaving ? 'Adding...' : 'Add Block'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
