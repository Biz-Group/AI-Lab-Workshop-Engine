'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button, Card, CardContent, TextArea } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ACCEPT_ATTRIBUTE,
  getImageFromClipboard,
  isAcceptedImageType,
  prepareImageForUpload,
} from '@/lib/utils/image-upload';

/**
 * The image-first submission surface for a gallery step.
 *
 * Deliberately self-contained: it owns the whole upload/preview/submit/edit
 * lifecycle so that WorkshopRunner gains three render guards and one component
 * rather than another twenty pieces of local state.
 *
 * Feedback is rendered inline rather than via toasts -- this is the primary
 * action of the step, and a toast that has already faded is not an answer to
 * "did my image go through?".
 */

type Phase = 'empty' | 'ready' | 'uploading' | 'saving' | 'submitted' | 'error';

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
  existingSubmission?: GalleryStepSubmissionValue;
  onSubmitted: (submission: GalleryStepSubmissionValue) => void;
  onLogEvent?: (event: string, payload?: Record<string, unknown>) => void;
}

function buildVersionedImageUrl(url: string, updatedAt?: string) {
  if (!updatedAt) return url;
  const version = Date.parse(updatedAt);
  if (Number.isNaN(version)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

export function GalleryStepSubmission({
  sessionId,
  participantId,
  stepId,
  prompt,
  existingSubmission,
  onSubmitted,
  onLogEvent,
}: GalleryStepSubmissionProps) {
  const [phase, setPhase] = useState<Phase>(existingSubmission ? 'submitted' : 'empty');
  const [isEditing, setIsEditing] = useState(false);
  const [caption, setCaption] = useState(existingSubmission?.content ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const isBusy = phase === 'uploading' || phase === 'saving';

  // The submitted state is derived from the persisted submission, not from a
  // transient "just submitted" flag, so navigating away and back keeps showing
  // the confirmation instead of an empty upload form.
  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setIsDraggingOver(false);
    setIsEditing(false);
    setCaption(existingSubmission?.content ?? '');
    setPhase(existingSubmission ? 'submitted' : 'empty');
  }, [existingSubmission, stepId]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const setLocalPreview = useCallback((nextFile: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(nextFile);
    objectUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  const acceptFile = useCallback(
    (candidate: File) => {
      if (!isAcceptedImageType(candidate.type)) {
        setErrorMessage('Please choose a PNG, JPG or WebP image.');
        setPhase((prev) => (prev === 'submitted' ? 'submitted' : 'error'));
        return;
      }

      setErrorMessage(null);
      setFile(candidate);
      setLocalPreview(candidate);
      setPhase('ready');
    },
    [setLocalPreview]
  );

  // Clipboard paste is a first-class input here: participants copy images
  // straight out of an AI tool. Only swallow the event when the clipboard
  // actually carries an image, so pasting text into the caption still works.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (isBusy) return;
      if (phase === 'submitted' && !isEditing) return;

      const pasted = getImageFromClipboard(event.clipboardData);
      if (!pasted) return;

      event.preventDefault();
      acceptFile(pasted);
    };

    node.addEventListener('paste', handlePaste);
    return () => node.removeEventListener('paste', handlePaste);
  }, [acceptFile, isBusy, phase, isEditing]);

  const existingImageUrl = existingSubmission?.image_url
    ? buildVersionedImageUrl(existingSubmission.image_url, existingSubmission.updated_at)
    : null;

  // An edit may change only the caption, so the effective image falls back to
  // whatever is already stored. This must never resolve to null on a
  // caption-only save -- doing so would blank the image on the projected wall.
  const displayImageUrl = previewUrl ?? existingImageUrl;
  const hasImage = Boolean(file) || Boolean(existingSubmission?.image_url);

  const handleSubmit = useCallback(async () => {
    // Guard synchronously, before any await, so a fast double-click cannot
    // start two submissions. Disabling the button alone loses that race.
    if (isBusy) return;
    if (!hasImage) {
      setErrorMessage('Add an image before submitting.');
      setPhase('error');
      return;
    }

    setErrorMessage(null);

    try {
      let imageUrl = existingSubmission?.image_url ?? null;

      if (file) {
        setPhase('uploading');
        const prepared = await prepareImageForUpload(file);

        const formData = new FormData();
        formData.append('file', prepared.file);
        formData.append('participantId', participantId);
        formData.append('sessionId', sessionId);
        formData.append('stepId', stepId);

        const uploadRes = await fetch('/api/submissions/upload', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          throw new Error(uploadData.error || 'The image could not be uploaded.');
        }
        imageUrl = uploadData.imageUrl;
      }

      setPhase('saving');
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          sessionId,
          stepId,
          content: caption.trim(),
          imageUrl,
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
      // The effect keyed on `existingSubmission` will settle us into the
      // submitted phase once the parent state lands.
      setFile(null);
      setIsEditing(false);
      setPhase('submitted');
    } catch (err) {
      // Keep the chosen file and caption so Try again is one click, not a
      // re-drag and a retype.
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  }, [
    isBusy,
    hasImage,
    file,
    caption,
    existingSubmission?.image_url,
    participantId,
    sessionId,
    stepId,
    onSubmitted,
    onLogEvent,
  ]);

  const clearSelectedImage = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPhase(existingSubmission ? 'ready' : 'empty');
  }, [existingSubmission]);

  const showSubmittedState = phase === 'submitted' && !isEditing && existingSubmission;

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

          {showSubmittedState ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-900">Submitted</p>
                  <p className="text-sm text-emerald-800">
                    Your image has been sent to the gallery.
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-900">
                    Look at the main screen 👀
                  </p>
                </div>
              </div>

              {existingImageUrl && (
                <div className="flex items-start gap-4">
                  <img
                    src={existingImageUrl}
                    alt="Your submitted image"
                    className="h-24 w-24 rounded-lg border border-gray-200 bg-gray-50 object-contain"
                  />
                  {existingSubmission.content && (
                    <p className="min-w-0 flex-1 text-sm text-gray-600 italic">
                      &ldquo;{existingSubmission.content}&rdquo;
                    </p>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(true);
                  setPhase('ready');
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit submission
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {displayImageUrl ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Your submission</p>
                  <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-2">
                    {/* contain, never cover: AI images are square, portrait,
                        landscape or ultrawide, and the participant has to be
                        able to confirm they picked the right one. */}
                    <img
                      src={displayImageUrl}
                      alt="Selected image preview"
                      className="mx-auto max-h-80 w-auto max-w-full rounded-lg object-contain"
                    />
                    {!isBusy && previewUrl && (
                      <button
                        type="button"
                        aria-label="Remove selected image"
                        onClick={clearSelectedImage}
                        className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1.5 text-white shadow transition-colors hover:bg-gray-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {!isBusy && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Replace image
                    </button>
                  )}
                </div>
              ) : (
                <label
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                    isDraggingOver
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/60'
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) acceptFile(dropped);
                  }}
                >
                  <ImagePlus className="h-8 w-8 text-gray-400" />
                  <span className="text-base font-medium text-gray-700">
                    Drop, paste or choose an image
                  </span>
                  <span className="text-xs text-gray-500">
                    Paste with Ctrl+V (Cmd+V on Mac) &middot; PNG, JPG or WebP
                  </span>
                </label>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) acceptFile(chosen);
                }}
              />

              <TextArea
                label="Caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a short note about your image..."
                rows={2}
                disabled={isBusy}
              />

              {errorMessage && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-900">
                      We couldn&rsquo;t submit your image.
                    </p>
                    <p className="text-sm text-red-800">{errorMessage}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSubmit} disabled={isBusy || !hasImage}>
                  {phase === 'uploading' && (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading image&hellip;
                    </>
                  )}
                  {phase === 'saving' && (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Almost there&hellip;
                    </>
                  )}
                  {!isBusy && (phase === 'error' ? 'Try again' : existingSubmission ? 'Save changes' : 'Submit to gallery')}
                </Button>

                {isEditing && !isBusy && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      clearSelectedImage();
                      setCaption(existingSubmission?.content ?? '');
                      setErrorMessage(null);
                      setPhase('submitted');
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
