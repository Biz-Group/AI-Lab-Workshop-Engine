'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, RotateCcw, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ACCEPT_ATTRIBUTE,
  getImagesFromClipboard,
  isAcceptedImageType,
  MAX_IMAGES_PER_STEP,
  prepareImageForUpload,
} from '@/lib/utils/image-upload';

/**
 * The image-first submission surface for a gallery step.
 *
 * A participant can add up to MAX_IMAGES_PER_STEP images per step -- each one
 * uploads and saves the moment it's picked/dropped/pasted, independently of
 * the others, rather than being staged behind a shared Submit button. That
 * keeps a slow or failed upload from blocking the rest, and matches how every
 * facilitator-facing surface (wall, admin gallery) already treats submissions
 * as a flat list of independent rows rather than one unit per participant.
 *
 * Feedback is rendered inline rather than via toasts -- this is the primary
 * action of the step, and a toast that has already faded is not an answer to
 * "did my image go through?".
 */

export interface GalleryStepSubmissionValue {
  id: string;
  step_id: string;
  content: string;
  image_url?: string | null;
  updated_at?: string;
}

interface GalleryStepSubmissionProps {
  sessionId: string;
  participantId: string;
  stepId: string;
  /** The activity prompt shown above the upload surface. */
  prompt: string;
  existingSubmissions: GalleryStepSubmissionValue[];
  onSubmitted: (submission: GalleryStepSubmissionValue) => void;
  onDeleted: (submissionId: string) => void;
  onLogEvent?: (event: string, payload?: Record<string, unknown>) => void;
}

function buildVersionedImageUrl(url: string, updatedAt?: string) {
  if (!updatedAt) return url;
  const version = Date.parse(updatedAt);
  if (Number.isNaN(version)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

interface ImageTileProps {
  submission: GalleryStepSubmissionValue;
  onSave: (submissionId: string, caption: string) => Promise<void>;
  onDelete: (submissionId: string) => Promise<void>;
}

/**
 * One already-saved image: its own caption (auto-saves on blur) and a delete
 * control. Deliberately self-contained rather than lifted into the parent's
 * state -- each tile only ever touches its own row.
 */
function ImageTile({ submission, onSave, onDelete }: ImageTileProps) {
  const [caption, setCaption] = useState(submission.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A caption saved from another tab/device should still show up here, but
  // never clobber what the participant is actively typing.
  useEffect(() => {
    setCaption(submission.content);
  }, [submission.content]);

  const imageUrl = submission.image_url
    ? buildVersionedImageUrl(submission.image_url, submission.updated_at)
    : null;

  const handleBlur = useCallback(async () => {
    const trimmed = caption.trim();
    if (trimmed === submission.content) return;

    setIsSaving(true);
    setError(null);
    try {
      await onSave(submission.id, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your caption.');
    } finally {
      setIsSaving(false);
    }
  }, [caption, submission.content, submission.id, onSave]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(submission.id);
      // On success the parent removes this row and the tile unmounts -- no
      // further state to reset.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this image.');
      setIsDeleting(false);
    }
  }, [submission.id, onDelete]);

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
      <div className="relative">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white">
          {imageUrl && (
            <img src={imageUrl} alt="Your submitted image" className="max-h-full max-w-full object-contain" />
          )}
        </div>
        <button
          type="button"
          aria-label="Delete image"
          onClick={handleDelete}
          disabled={isDeleting}
          className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1.5 text-white shadow transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        </button>
      </div>
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add a caption (optional)"
        disabled={isSaving || isDeleting}
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-400 focus:outline-none disabled:opacity-60"
      />
      {isSaving && <p className="text-[11px] text-gray-400">Saving&hellip;</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

interface PendingUpload {
  localId: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'saving' | 'error';
  errorMessage?: string;
}

export function GalleryStepSubmission({
  sessionId,
  participantId,
  stepId,
  prompt,
  existingSubmissions,
  onSubmitted,
  onDeleted,
  onLogEvent,
}: GalleryStepSubmissionProps) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  // Read synchronously inside acceptFiles so a rapid drop-then-paste can't
  // both see a stale, too-generous "room left" count from render-time props.
  const pendingCountRef = useRef(0);

  useEffect(() => {
    pendingCountRef.current = pending.length;
  }, [pending]);

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  const imagesUsed = existingSubmissions.length + pending.length;
  const atLimit = imagesUsed >= MAX_IMAGES_PER_STEP;

  const runUpload = useCallback(
    async (localId: string, file: File) => {
      setPending((prev) =>
        prev.map((p) => (p.localId === localId ? { ...p, status: 'uploading', errorMessage: undefined } : p))
      );

      try {
        const prepared = await prepareImageForUpload(file);
        const imageDimensions =
          prepared.width > 0 && prepared.height > 0 ? { width: prepared.width, height: prepared.height } : null;

        const formData = new FormData();
        formData.append('file', prepared.file);
        formData.append('participantId', participantId);
        formData.append('sessionId', sessionId);
        formData.append('stepId', stepId);

        const uploadRes = await fetch('/api/submissions/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          throw new Error(uploadData.error || 'The image could not be uploaded.');
        }

        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'saving' } : p)));

        const res = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId,
            sessionId,
            stepId,
            content: '',
            imageUrl: uploadData.imageUrl,
            imageWidth: imageDimensions?.width,
            imageHeight: imageDimensions?.height,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Your image could not be saved.');
        }

        onLogEvent?.('step_completed', { step_id: stepId });
        onSubmitted({
          ...data.submission,
          updated_at: data.submission.updated_at || new Date().toISOString(),
        });

        setPending((prev) => {
          const entry = prev.find((p) => p.localId === localId);
          if (entry) {
            URL.revokeObjectURL(entry.previewUrl);
            objectUrlsRef.current.delete(entry.previewUrl);
          }
          return prev.filter((p) => p.localId !== localId);
        });
      } catch (err) {
        setPending((prev) =>
          prev.map((p) =>
            p.localId === localId
              ? { ...p, status: 'error', errorMessage: err instanceof Error ? err.message : 'Something went wrong.' }
              : p
          )
        );
      }
    },
    [participantId, sessionId, stepId, onSubmitted, onLogEvent]
  );

  const acceptFiles = useCallback(
    (files: File[]) => {
      let room = MAX_IMAGES_PER_STEP - existingSubmissions.length - pendingCountRef.current;
      const newEntries: PendingUpload[] = [];
      let hitLimit = false;
      let hadInvalidType = false;

      for (const file of files) {
        if (room <= 0) {
          hitLimit = true;
          break;
        }
        if (!isAcceptedImageType(file.type)) {
          hadInvalidType = true;
          continue;
        }
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${newEntries.length}`;
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        newEntries.push({ localId, file, previewUrl, status: 'uploading' });
        room -= 1;
      }

      if (hitLimit) {
        setErrorMessage(`You've added the maximum of ${MAX_IMAGES_PER_STEP} images for this activity.`);
      } else if (hadInvalidType) {
        setErrorMessage('Please choose a PNG, JPG or WebP image.');
      } else if (newEntries.length > 0) {
        setErrorMessage(null);
      }

      if (newEntries.length === 0) return;

      setPending((prev) => [...prev, ...newEntries]);
      void newEntries.reduce(
        (chain, entry) => chain.then(() => runUpload(entry.localId, entry.file)),
        Promise.resolve()
      );
    },
    [existingSubmissions.length, runUpload]
  );

  // Clipboard paste is a first-class input here: participants copy images
  // straight out of an AI tool.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handlePaste = (event: ClipboardEvent) => {
      const pasted = getImagesFromClipboard(event.clipboardData);
      if (pasted.length === 0) return;

      event.preventDefault();
      acceptFiles(pasted);
    };

    node.addEventListener('paste', handlePaste);
    return () => node.removeEventListener('paste', handlePaste);
  }, [acceptFiles]);

  const dismissFailedUpload = useCallback((localId: string) => {
    setPending((prev) => {
      const entry = prev.find((p) => p.localId === localId);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
        objectUrlsRef.current.delete(entry.previewUrl);
      }
      return prev.filter((p) => p.localId !== localId);
    });
  }, []);

  const handleSaveCaption = useCallback(
    async (submissionId: string, caption: string) => {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, sessionId, stepId, content: caption, submissionId }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Your caption could not be saved.');
      }
      onSubmitted({
        ...data.submission,
        updated_at: data.submission.updated_at || new Date().toISOString(),
      });
    },
    [participantId, sessionId, stepId, onSubmitted]
  );

  const handleDeleteImage = useCallback(
    async (submissionId: string) => {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, sessionId }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'This image could not be deleted.');
      }
      onDeleted(submissionId);
    },
    [participantId, sessionId, onDeleted]
  );

  return (
    <div ref={containerRef} className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-600 mb-2">
              Gallery activity
            </p>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{prompt}</h2>
          </div>

          {existingSubmissions.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="font-semibold text-emerald-900">
                  {existingSubmissions.length === 1
                    ? 'Submitted'
                    : `${existingSubmissions.length} images submitted`}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-900">Look at the main screen 👀</p>
              </div>
            </div>
          )}

          {(existingSubmissions.length > 0 || pending.length > 0) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {existingSubmissions.map((submission) => (
                <ImageTile
                  key={submission.id}
                  submission={submission}
                  onSave={handleSaveCaption}
                  onDelete={handleDeleteImage}
                />
              ))}
              {pending.map((p) => (
                <div key={p.localId} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white">
                    <img src={p.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                  {p.status !== 'error' ? (
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {p.status === 'uploading' ? 'Uploading…' : 'Almost there…'}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-red-600">{p.errorMessage}</p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => runUpload(p.localId, p.file)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissFailedUpload(p.localId)}
                          className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {atLimit ? (
            <p className="text-sm text-gray-500">
              You&rsquo;ve added the maximum of {MAX_IMAGES_PER_STEP} images for this activity.
            </p>
          ) : (
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                isDraggingOver
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/60'
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length) acceptFiles(dropped);
              }}
            >
              <ImagePlus className="h-8 w-8 text-gray-400" />
              <span className="text-base font-medium text-gray-700">
                {imagesUsed > 0 ? 'Add another image' : 'Drop, paste or choose an image'}
              </span>
              <span className="text-xs text-gray-500">
                Paste with Ctrl+V (Cmd+V on Mac) &middot; PNG, JPG or WebP &middot; up to {MAX_IMAGES_PER_STEP}
              </span>
            </label>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            className="hidden"
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? []);
              if (chosen.length) acceptFiles(chosen);
              e.target.value = '';
            }}
          />

          {errorMessage && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
