'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, Button, Input, TextArea } from '@/components/ui';
import toast from 'react-hot-toast';

export default function NewTemplatePage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    estimated_duration_minutes: 60,
    is_published: false,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          estimated_duration_minutes: form.estimated_duration_minutes,
          is_published: form.is_published,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Template created');
      router.push(`/admin/templates/${data.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/templates"
          className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Templates
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Create Template</h1>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleCreate} className="space-y-5">
            <Input
              label="Template Name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Innovation Workshop"
              required
            />

            <TextArea
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="Brief description of the workshop template"
            />

            <Input
              label="Estimated Duration (minutes)"
              type="number"
              value={form.estimated_duration_minutes}
              onChange={(e) => setForm(prev => ({ ...prev, estimated_duration_minutes: Math.max(1, parseInt(e.target.value) || 1) }))}
              min={1}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, is_published: !prev.is_published }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.is_published ? 'bg-brand-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.is_published ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                {form.is_published ? 'Published — available for sessions' : 'Draft — not visible in session creation'}
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={!form.name.trim() || isSaving}>
                {isSaving ? 'Creating...' : 'Create Template'}
              </Button>
              <Link
                href="/admin/templates"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
