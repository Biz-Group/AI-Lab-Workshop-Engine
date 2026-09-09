'use client';

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  MessageSquare,
  QrCode,
  Shuffle,
  Sparkles,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { cn, formatJoinCodeForDisplay } from '@/lib/utils';
import {
  describeConnection,
  readStepChangePayload,
  workshopBroadcastChannel,
  STEP_CHANGE_EVENT,
} from '@/lib/utils/realtime';
import {
  useSessionSubmissions,
  type SessionSubmissionImage,
} from '@/lib/hooks/useSessionSubmissions';
import { useFullscreen } from '@/lib/hooks/useFullscreen';
import { authFetch } from '@/lib/utils/auth-fetch';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Layout ─────────────────────────────────────────────────────────────────
//
// Pinterest-style masonry: each tile's height follows its own image's aspect
// ratio (capped so one extreme image can't dominate the wall), columns are a
// pure function of measured width (never of image count), and every column is
// its own independent top-to-bottom stack. That last part is what avoids the
// classic "column balancing re-flows every existing card when one arrives"
// masonry problem: `planMasonryPages` is always fed images oldest-first
// (`chronologicalImages`), so a later arrival is only ever appended to
// whichever column is currently shortest -- it can never change where an
// earlier image already landed. Pagination still exists (a column-height
// budget takes the place of the old fixed cols*rows capacity), so overflow
// stays measurable rather than spilling into a scrollbar the room can't use.

/** Target column width -- narrow enough for several columns on a 16:9
 * projector, wide enough to stay legible from the back of a room. */
const MASONRY_COLUMN_TARGET_PX = 260;
const MASONRY_GAP_PX = 16;
const MASONRY_MAX_COLUMNS = 6;
/** Estimated footer height (caption + name strip) folded into the pagination
 * budget so a caption-heavy page doesn't overflow the stage even though the
 * image itself is only ever sized to its own aspect ratio, never the footer. */
const MASONRY_FOOTER_RESERVE_PX = 60;

function computeMasonryColumns(width: number): number {
  if (width <= 0) return 1;
  return Math.max(
    1,
    Math.min(
      MASONRY_MAX_COLUMNS,
      Math.floor((width + MASONRY_GAP_PX) / (MASONRY_COLUMN_TARGET_PX + MASONRY_GAP_PX))
    )
  );
}

/**
 * No single tile may dominate the wall vertically, whatever its aspect ratio
 * -- but the cap is deliberately generous: a normal photo (portrait,
 * landscape, or square) should never actually hit it and letterbox. It only
 * exists to catch a genuinely pathological upload (e.g. a screenshot scrolled
 * to be several times taller than it is wide).
 */
function computeMasonryMaxTileHeight(stageHeight: number): number {
  if (stageHeight <= 0) return 480;
  return Math.max(240, Math.min(stageHeight * 0.85, 760));
}

interface MasonryPlacement {
  image: SessionSubmissionImage;
  /** Height of the `<img>` itself -- never includes the footer, which is left
   * to size itself naturally below it. */
  imageHeight: number;
  /** Stable order of placement, independent of pagination -- drives the
   * reveal stagger. */
  order: number;
}

interface MasonryPage {
  columns: MasonryPlacement[][];
}

/**
 * Greedily assigns each image (processed oldest-first) to whichever column is
 * currently shortest, cutting a new page once that would overflow the stage.
 */
function planMasonryPages(
  images: SessionSubmissionImage[],
  cols: number,
  columnWidth: number,
  maxTileHeight: number,
  maxStageHeight: number,
  hasFooter: (image: SessionSubmissionImage) => boolean,
  getAspectRatio: (imageId: string) => number
): MasonryPage[] {
  const emptyPage = (): MasonryPage => ({ columns: Array.from({ length: cols }, () => []) });

  if (images.length === 0) return [emptyPage()];

  const pages: MasonryPage[] = [];
  let page = emptyPage();
  let columnHeights = new Array(cols).fill(0);

  images.forEach((image, index) => {
    const aspect = getAspectRatio(image.id) || 1;
    const imageHeight = Math.min(columnWidth / aspect, maxTileHeight);
    const totalHeight = imageHeight + (hasFooter(image) ? MASONRY_FOOTER_RESERVE_PX : 0);

    let shortest = 0;
    for (let i = 1; i < cols; i++) {
      if (columnHeights[i] < columnHeights[shortest]) shortest = i;
    }

    const isColumnEmpty = page.columns[shortest].length === 0;
    const projected = columnHeights[shortest] + totalHeight + (isColumnEmpty ? 0 : MASONRY_GAP_PX);

    if (projected > maxStageHeight && !isColumnEmpty) {
      pages.push(page);
      page = emptyPage();
      columnHeights = new Array(cols).fill(0);
      shortest = 0;
    }

    page.columns[shortest].push({ image, imageHeight, order: index });
    columnHeights[shortest] += totalHeight + (page.columns[shortest].length > 1 ? MASONRY_GAP_PX : 0);
  });

  pages.push(page);
  return pages;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ProjectionWallStep {
  id: string;
  title: string;
  moduleTitle: string;
  isGalleryStep: boolean;
  referenceImageUrl?: string | null;
  prompt: string;
}

interface ProjectionWallProps {
  session: {
    id: string;
    joinCode: string;
    status: string;
    currentStepId: string | null;
  };
  steps: ProjectionWallStep[];
  initialParticipantCount: number;
}

const STEP_RECONCILE_INTERVAL_MS = 10_000;
const CONTROLS_IDLE_MS = 4_000;
/** Comfortably under Supabase's default ~1h access-token expiry. */
const AUTH_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function ProjectionWall({
  session,
  steps,
  initialParticipantCount,
}: ProjectionWallProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridAreaRef = useRef<HTMLDivElement | null>(null);
  const broadcastRef = useRef<RealtimeChannel | null>(null);
  // Guards against a held arrow key firing a burst of PATCHes whose last
  // response wins.
  const isNavigatingRef = useRef(false);

  const gallerySteps = useMemo(() => steps.filter((step) => step.isGalleryStep), [steps]);

  const [currentStepId, setCurrentStepId] = useState<string | null>(() => {
    const fromSession = steps.find((step) => step.id === session.currentStepId);
    if (fromSession?.isGalleryStep) return fromSession.id;
    // The console may be parked on a guided step; open on the first gallery
    // step so the wall always has something to show.
    return gallerySteps[0]?.id ?? null;
  });

  const [participantCount, setParticipantCount] = useState(initialParticipantCount);
  const [revealedStepIds, setRevealedStepIds] = useState<Set<string>>(new Set());
  const [showNames, setShowNames] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [page, setPage] = useState(0);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [isReferenceImageOpen, setIsReferenceImageOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [gridArea, setGridArea] = useState({ width: 0, height: 0 });
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [pendingHideId, setPendingHideId] = useState<string | null>(null);

  // Tiles present at the moment of reveal, so the reveal batch animates as a
  // staggered group while later arrivals get a single quiet fade.
  const revealBatchRef = useRef<Map<string, Set<string>>>(new Map());

  const currentStep = gallerySteps.find((step) => step.id === currentStepId) ?? null;
  const currentIndex = currentStep ? gallerySteps.indexOf(currentStep) : -1;

  const { images, submittedParticipantIds, isLoading, connection, refresh } =
    useSessionSubmissions({
      sessionId: session.id,
      stepId: currentStepId,
      mode: 'incremental',
    });

  const isRevealed = currentStepId ? revealedStepIds.has(currentStepId) : false;

  const visibleImages = useMemo(
    () => images.filter((image) => !image.hidden_from_wall),
    [images]
  );

  // ─── Aspect ratios ────────────────────────────────────────────────────────
  //
  // Masonry needs each image's natural aspect ratio before it can size a
  // tile. Nothing in the DB carries width/height, so it's discovered here by
  // loading each image once; the ref is the cache (like useSessionSubmissions'
  // own nameCacheRef), the state version is only there to trigger a re-render
  // once new ratios resolve. Chronological order (`chronologicalImages` below)
  // is what actually keeps the masonry column assignment stable -- this cache
  // just needs a value per image, present or fallback, whenever it's read.
  const aspectRatioCacheRef = useRef<Map<string, number>>(new Map());
  const [aspectRatioVersion, setAspectRatioVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const missing = visibleImages.filter((image) => !aspectRatioCacheRef.current.has(image.id));
    if (missing.length === 0) return;

    missing.forEach((image) => {
      const probe = new window.Image();
      const resolve = (ratio: number) => {
        if (cancelled) return;
        aspectRatioCacheRef.current.set(image.id, ratio);
        setAspectRatioVersion((v) => v + 1);
      };
      probe.onload = () => {
        resolve(probe.naturalWidth > 0 && probe.naturalHeight > 0 ? probe.naturalWidth / probe.naturalHeight : 1);
      };
      probe.onerror = () => resolve(1);
      probe.src = image.display_image_url;
    });

    return () => {
      cancelled = true;
    };
  }, [visibleImages]);

  const chronologicalImages = useMemo(
    () =>
      [...visibleImages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [visibleImages]
  );

  const submittedCount = submittedParticipantIds.size;

  // ─── Step navigation ──────────────────────────────────────────────────────

  const goToGalleryStep = useCallback(
    async (index: number) => {
      if (isNavigatingRef.current) return;
      const target = gallerySteps[index];
      if (!target || target.id === currentStepId) return;

      isNavigatingRef.current = true;
      setCurrentStepId(target.id);
      setPage(0);
      setSpotlightId(null);
      setIsReferenceImageOpen(false);

      try {
        const res = await authFetch(`/api/admin/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_step_id: target.id }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not change step');

        // Nothing in the app listens to the sessions table, so the console
        // learns about this from the broadcast or not at all.
        broadcastRef.current?.send({
          type: 'broadcast',
          event: STEP_CHANGE_EVENT,
          payload: { current_step_id: target.id },
        });
        setStatusMessage(null);
      } catch (err) {
        // Toasts render outside the fullscreen subtree and would be invisible
        // while presenting, so surface this in the wall itself.
        setStatusMessage(err instanceof Error ? err.message : 'Could not change step');
      } finally {
        isNavigatingRef.current = false;
      }
    },
    [gallerySteps, currentStepId, session.id]
  );

  // ─── Auth keep-alive ──────────────────────────────────────────────────────
  //
  // Belt-and-suspenders alongside authFetch's retry-on-401: proactively nudge
  // the token before it goes stale, so a backgrounded/throttled tab is less
  // likely to ever need the reactive retry in the first place.

  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(() => {
      void supabase.auth.refreshSession();
    }, AUTH_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // ─── Presenter <-> wall sync ──────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const channel = supabase
      .channel(workshopBroadcastChannel(session.id))
      .on('broadcast', { event: STEP_CHANGE_EVENT }, ({ payload }) => {
        if (!mounted) return;
        const parsed = readStepChangePayload(payload);
        if (!parsed?.current_step_id) return;

        // Only follow the console onto steps this wall can actually show.
        const isGallery = gallerySteps.some((step) => step.id === parsed.current_step_id);
        if (!isGallery) return;

        setCurrentStepId(parsed.current_step_id);
        setPage(0);
        setSpotlightId(null);
        setIsReferenceImageOpen(false);
      })
      .subscribe();

    broadcastRef.current = channel;

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      broadcastRef.current = null;
    };
  }, [session.id, gallerySteps]);

  // Reconcile poll: catches a console step change if the broadcast is missed,
  // and keeps the "of N" denominator fresh as latecomers join.
  useEffect(() => {
    const supabase = createClient();

    const reconcile = async () => {
      const [{ data: sessionRow }, { count }] = await Promise.all([
        supabase.from('sessions').select('current_step_id').eq('id', session.id).single(),
        supabase
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id),
      ]);

      if (typeof count === 'number') setParticipantCount(count);

      const remoteStepId = sessionRow?.current_step_id;
      if (!remoteStepId || isNavigatingRef.current) return;
      if (!gallerySteps.some((step) => step.id === remoteStepId)) return;

      setCurrentStepId((prev) => (prev === remoteStepId ? prev : remoteStepId));
    };

    const interval = setInterval(() => void reconcile(), STEP_RECONCILE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session.id, gallerySteps]);

  // ─── Reveal ───────────────────────────────────────────────────────────────

  const reveal = useCallback(() => {
    if (!currentStepId) return;
    revealBatchRef.current.set(
      currentStepId,
      new Set(visibleImages.map((image) => image.id))
    );
    setRevealedStepIds((prev) => new Set(prev).add(currentStepId));
  }, [currentStepId, visibleImages]);

  const hideAgain = useCallback(() => {
    if (!currentStepId) return;
    setRevealedStepIds((prev) => {
      const next = new Set(prev);
      next.delete(currentStepId);
      return next;
    });
    revealBatchRef.current.delete(currentStepId);
    setSpotlightId(null);
  }, [currentStepId]);

  // ─── Moderation ───────────────────────────────────────────────────────────

  const hideFromWall = useCallback(
    async (submissionId: string) => {
      setPendingHideId(submissionId);
      try {
        const res = await authFetch(`/api/admin/submissions/${submissionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hidden_from_wall: true }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not hide that image');

        setSpotlightId((prev) => (prev === submissionId ? null : prev));
        await refresh();
        setStatusMessage(null);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : 'Could not hide that image');
      } finally {
        setPendingHideId(null);
      }
    },
    [refresh]
  );

  // ─── Fullscreen ───────────────────────────────────────────────────────────

  const { isFullscreen, isSupported: isFullscreenSupported, toggle: toggleFullscreen } =
    useFullscreen(rootRef);

  // ─── Grid measurement ─────────────────────────────────────────────────────
  //
  // Observe the grid AREA, never the grid contents: observing an element whose
  // own layout you then change is how a ResizeObserver ends up oscillating.
  useLayoutEffect(() => {
    const node = gridAreaRef.current;
    if (!node) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setGridArea({ width: node.clientWidth, height: node.clientHeight });
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isFullscreen]);

  const masonryCols = computeMasonryColumns(gridArea.width);
  const masonryColumnWidth =
    gridArea.width > 0
      ? (gridArea.width - MASONRY_GAP_PX * (masonryCols - 1)) / masonryCols
      : 0;
  const masonryMaxTileHeight = computeMasonryMaxTileHeight(gridArea.height);

  const masonryHasFooter = useCallback(
    (image: SessionSubmissionImage) => (showCaptions && Boolean(image.content)) || showNames,
    [showCaptions, showNames]
  );

  const masonryPages = useMemo(
    () =>
      planMasonryPages(
        chronologicalImages,
        masonryCols,
        masonryColumnWidth,
        masonryMaxTileHeight,
        gridArea.height,
        masonryHasFooter,
        (imageId) => aspectRatioCacheRef.current.get(imageId) ?? 1
      ),
    // aspectRatioVersion is read only inside the getAspectRatio callback, not
    // destructured here, so it has to be listed explicitly to trigger a
    // recompute once a probed image's real ratio resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chronologicalImages, masonryCols, masonryColumnWidth, masonryMaxTileHeight, gridArea.height, masonryHasFooter, aspectRatioVersion]
  );

  const pageCount = masonryPages.length;
  const safePage = Math.min(page, pageCount - 1);
  const currentPage = masonryPages[safePage] ?? masonryPages[0];
  const hasAnyImages = chronologicalImages.length > 0;

  // ─── Controls auto-fade ───────────────────────────────────────────────────

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const wake = () => {
      setAreControlsVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setAreControlsVisible(false), CONTROLS_IDLE_MS);
    };

    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    // Never fade out from under a keyboard user.
    window.addEventListener('focusin', wake);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('focusin', wake);
    };
  }, []);

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  const randomSpotlight = useCallback(() => {
    if (!isRevealed || visibleImages.length === 0) return;
    const pick = visibleImages[Math.floor(Math.random() * visibleImages.length)];
    setSpotlightId(pick.id);
  }, [isRevealed, visibleImages]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Backspace, not Escape: Escape-to-exit-fullscreen is enforced by the
      // browser and cannot be prevented, so binding it here would drop out of
      // fullscreen in the same keypress.
      if (spotlightId && event.key === 'Backspace') {
        event.preventDefault();
        setSpotlightId(null);
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          void goToGalleryStep(currentIndex + 1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          void goToGalleryStep(currentIndex - 1);
          break;
        // Paging is deliberately a different binding from step navigation.
        case 'PageDown':
          event.preventDefault();
          setPage((prev) => Math.min(prev + 1, pageCount - 1));
          break;
        case 'PageUp':
          event.preventDefault();
          setPage((prev) => Math.max(prev - 1, 0));
          break;
        case 'r':
          event.preventDefault();
          if (isRevealed) hideAgain();
          else reveal();
          break;
        case 'n':
          event.preventDefault();
          setShowNames((prev) => !prev);
          break;
        case 'c':
          event.preventDefault();
          setShowCaptions((prev) => !prev);
          break;
        case 'f':
          event.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    currentIndex,
    goToGalleryStep,
    hideAgain,
    isRevealed,
    pageCount,
    reveal,
    spotlightId,
    toggleFullscreen,
  ]);

  const spotlightImage = spotlightId
    ? visibleImages.find((image) => image.id === spotlightId) ?? null
    : null;

  const joinUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/join/${session.joinCode}` : '';

  const revealBatch = currentStepId ? revealBatchRef.current.get(currentStepId) : undefined;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (gallerySteps.length === 0) {
    return (
      <div
        ref={rootRef}
        className="wall-root flex min-h-screen flex-col items-center justify-center gap-3 p-10 text-center"
      >
        <Sparkles className="h-10 w-10 text-white/30" />
        <h1 className="text-3xl font-semibold">No gallery activities in this session</h1>
        <p className="max-w-xl text-white/60">
          Mark a step as a gallery step in the template, then create a new session from it.
          An existing session cannot pick up the change without discarding its submissions.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="wall-root flex h-screen w-full flex-col overflow-hidden">
      {/* Header: the prompt is the point, so it gets the space. */}
      <header className="flex shrink-0 items-start justify-between gap-6 px-10 pt-8 pb-4">
        <div className="flex min-w-0 items-start gap-4">
          {currentStep?.referenceImageUrl && (
            <button
              type="button"
              onClick={() => setIsReferenceImageOpen(true)}
              className="group relative shrink-0 overflow-hidden rounded-lg border border-white/15 outline-offset-2 hover:border-white/40"
              aria-label="Open target image"
              title="Target image -- click to enlarge"
            >
              <img
                src={currentStep.referenceImageUrl}
                alt="Target reference"
                className="h-16 w-16 object-cover"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9px] uppercase tracking-wide text-white/80">
                Target
              </span>
            </button>
          )}
          <div className="min-w-0">
            <p className="mb-2 text-xs uppercase tracking-[0.22em] text-white/40">
              {currentStep?.moduleTitle}
            </p>
            <h1 className="wall-prompt text-[clamp(1.75rem,3.2vw,3.25rem)]">
              {currentStep?.prompt}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                connection === 'connected'
                  ? 'bg-emerald-400'
                  : connection === 'error'
                    ? 'bg-amber-400'
                    : 'bg-white/40'
              )}
              aria-hidden
            />
            {describeConnection(connection)}
          </div>
          <div className="flex items-center gap-3 font-mono text-lg tracking-[0.12em] text-white/85">
            <span>{formatJoinCodeForDisplay(session.joinCode)}</span>
            <span className="text-white/30">&bull;</span>
            <span className="inline-flex items-center gap-1.5 font-sans text-base tracking-normal">
              <Users className="h-4 w-4 text-white/50" />
              {submittedCount} / {participantCount} submitted
            </span>
          </div>
        </div>
      </header>

      {statusMessage && (
        <div className="mx-10 mb-3 shrink-0 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {statusMessage}
        </div>
      )}

      {/* Stage */}
      <div ref={gridAreaRef} className="relative min-h-0 flex-1 px-10">
        {!isRevealed ? (
          <CollectionState
            submitted={submittedCount}
            total={participantCount}
            isLoading={isLoading}
            referenceImageUrl={currentStep?.referenceImageUrl ?? null}
          />
        ) : !hasAnyImages ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles className="h-10 w-10 text-white/25" />
            <p className="text-2xl font-medium text-white/60">
              Nothing submitted for this activity yet
            </p>
          </div>
        ) : (
          <div className="flex h-full w-full items-start" style={{ gap: MASONRY_GAP_PX }}>
            {currentPage.columns.map((column, colIndex) => (
              <div
                key={colIndex}
                className="flex min-w-0 flex-1 flex-col"
                style={{ gap: MASONRY_GAP_PX }}
              >
                {column.map((placement) => {
                  const inRevealBatch = revealBatch?.has(placement.image.id) ?? false;
                  return (
                    <WallTile
                      key={placement.image.id}
                      image={placement.image}
                      imageHeight={placement.imageHeight}
                      showNames={showNames}
                      showCaptions={showCaptions}
                      animationClass={inRevealBatch ? 'wall-reveal-enter' : 'wall-tile-enter'}
                      animationDelayMs={inRevealBatch ? Math.min(placement.order * 45, 600) : 0}
                      onClick={() => setSpotlightId(placement.image.id)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <footer
        className={cn(
          'wall-controls flex shrink-0 flex-wrap items-center justify-between gap-3 px-10 py-5',
          areControlsVisible ? 'opacity-100' : 'opacity-25'
        )}
      >
        <div className="flex items-center gap-2">
          <WallButton
            onClick={() => void goToGalleryStep(currentIndex - 1)}
            disabled={currentIndex <= 0}
            label="Previous activity"
          >
            <ChevronLeft className="h-5 w-5" />
          </WallButton>
          <span className="min-w-[7.5rem] text-center text-sm text-white/60">
            Activity {currentIndex + 1} of {gallerySteps.length}
          </span>
          <WallButton
            onClick={() => void goToGalleryStep(currentIndex + 1)}
            disabled={currentIndex >= gallerySteps.length - 1}
            label="Next activity"
          >
            <ChevronRight className="h-5 w-5" />
          </WallButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRevealed ? (
            <WallButton onClick={hideAgain} label="Hide responses again" isActive>
              <Eye className="mr-2 h-4 w-4" />
              Revealed
            </WallButton>
          ) : (
            <WallButton onClick={reveal} label="Reveal responses" isPrimary>
              <Sparkles className="mr-2 h-4 w-4" />
              Reveal
            </WallButton>
          )}

          <WallButton
            onClick={() => setShowNames((prev) => !prev)}
            label="Toggle names"
            isActive={showNames}
          >
            {showNames ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            Names
          </WallButton>

          <WallButton
            onClick={() => setShowCaptions((prev) => !prev)}
            label="Toggle captions"
            isActive={showCaptions}
          >
            {showCaptions ? <MessageSquare className="mr-2 h-4 w-4" /> : <Tag className="mr-2 h-4 w-4" />}
            Captions
          </WallButton>

          {isRevealed && visibleImages.length > 1 && (
            <WallButton onClick={randomSpotlight} label="Spotlight a random response">
              <Shuffle className="mr-2 h-4 w-4" />
              Random
            </WallButton>
          )}

          {/* Page navigation is visually and technically separate from activity
              navigation, and only appears when it applies. */}
          {isRevealed && pageCount > 1 && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-1">
              <WallButton
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
                disabled={safePage === 0}
                label="Previous page"
                isBare
              >
                <ChevronLeft className="h-4 w-4" />
              </WallButton>
              <span className="px-1 text-xs text-white/55">
                Page {safePage + 1} of {pageCount}
              </span>
              <WallButton
                onClick={() => setPage((prev) => Math.min(prev + 1, pageCount - 1))}
                disabled={safePage >= pageCount - 1}
                label="Next page"
                isBare
              >
                <ChevronRight className="h-4 w-4" />
              </WallButton>
            </div>
          )}

          <WallButton
            onClick={() => setIsQrVisible((prev) => !prev)}
            label="Show join QR code"
            isActive={isQrVisible}
          >
            <QrCode className="mr-2 h-4 w-4" />
            Join
          </WallButton>

          {isFullscreenSupported && (
            <WallButton onClick={toggleFullscreen} label="Toggle fullscreen">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </WallButton>
          )}
        </div>
      </footer>

      {/* Join QR overlay: temporary, so it never eats projector space. */}
      {isQrVisible && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/80"
          onClick={() => setIsQrVisible(false)}
        >
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-white p-10">
            {joinUrl && <QRCodeCanvas value={joinUrl} size={280} level="M" marginSize={2} />}
            <p className="font-mono text-5xl font-bold tracking-[0.12em] text-gray-900">
              {formatJoinCodeForDisplay(session.joinCode)}
            </p>
            <p className="text-sm text-gray-500">Tap anywhere to close</p>
          </div>
        </div>
      )}

      {/* Spotlight */}
      {spotlightImage && (
        <div
          className="wall-spotlight-enter absolute inset-0 z-50 flex flex-col bg-[#0B1020FA]"
          onClick={() => setSpotlightId(null)}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center p-10">
            {/* contain, not cover: the whole generated artwork has to be visible. */}
            <img
              src={spotlightImage.display_image_url}
              alt={showNames ? `Submission by ${spotlightImage.participant_name}` : 'Submission'}
              className="max-h-full max-w-full rounded-lg border border-white/15 object-contain shadow-2xl"
            />
          </div>
          <div
            className="flex shrink-0 flex-wrap items-end justify-between gap-4 px-10 pb-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-w-0">
              {showCaptions && spotlightImage.content && (
                <p className="max-w-4xl text-[clamp(1.25rem,2vw,2rem)] font-medium leading-snug">
                  &ldquo;{spotlightImage.content}&rdquo;
                </p>
              )}
              {showNames && (
                <p className="mt-2 text-lg text-white/55">{spotlightImage.participant_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <WallButton
                onClick={() => void hideFromWall(spotlightImage.id)}
                disabled={pendingHideId === spotlightImage.id}
                label="Hide this image from the wall"
              >
                <EyeOff className="mr-2 h-4 w-4" />
                {pendingHideId === spotlightImage.id ? 'Hiding…' : 'Hide from wall'}
              </WallButton>
              <WallButton onClick={() => setSpotlightId(null)} label="Back to the gallery">
                <X className="mr-2 h-4 w-4" />
                Back to gallery
              </WallButton>
            </div>
          </div>
        </div>
      )}

      {/* Reference/target image, enlarged */}
      {isReferenceImageOpen && currentStep?.referenceImageUrl && (
        <div
          className="wall-spotlight-enter absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#0B1020FA] p-10"
          onClick={() => setIsReferenceImageOpen(false)}
        >
          <span className="text-sm uppercase tracking-[0.22em] text-white/40">Target image</span>
          <img
            src={currentStep.referenceImageUrl}
            alt="Target reference"
            className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-lg"
          />
          <div onClick={(event) => event.stopPropagation()}>
            <WallButton onClick={() => setIsReferenceImageOpen(false)} label="Close">
              <X className="mr-2 h-4 w-4" />
              Close
            </WallButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function CollectionState({
  submitted,
  total,
  isLoading,
  referenceImageUrl,
}: {
  submitted: number;
  total: number;
  isLoading: boolean;
  referenceImageUrl?: string | null;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      {referenceImageUrl && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-[0.22em] text-white/40">
            Recreate this
          </span>
          <img
            src={referenceImageUrl}
            alt="Target reference"
            className="max-h-64 max-w-sm rounded-xl border border-white/15 object-contain shadow-lg"
          />
        </div>
      )}
      <div className="space-y-3">
        <p className="text-[clamp(1.5rem,2.6vw,2.5rem)] font-semibold text-white/85">
          {isLoading ? 'Getting ready…' : 'Your gallery is filling up…'}
        </p>
        <p className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold tabular-nums leading-none">
          {submitted}
          <span className="text-white/35"> / {total}</span>
        </p>
        <p className="text-lg text-white/50">submitted</p>
      </div>

      <div className="h-2.5 w-full max-w-2xl overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-base text-white/40">
        Responses will appear when the facilitator reveals them
      </p>
    </div>
  );
}

function WallTile({
  image,
  imageHeight,
  showNames,
  showCaptions,
  animationClass,
  animationDelayMs,
  onClick,
}: {
  image: SessionSubmissionImage;
  /** Height of just the `<img>`, computed from its own aspect ratio by
   * `planMasonryPages` -- the footer below sizes itself naturally. */
  imageHeight: number;
  showNames: boolean;
  showCaptions: boolean;
  animationClass: string;
  animationDelayMs: number;
  onClick: () => void;
}) {
  const hasFooter = (showCaptions && Boolean(image.content)) || showNames;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'wall-tile group flex w-full flex-col outline outline-1 outline-white/10 hover:outline-white/40',
        animationClass
      )}
      style={animationDelayMs ? { animationDelay: `${animationDelayMs}ms` } : undefined}
    >
      {/* Masonry: the tile's height comes straight from the image's own
          aspect ratio at this column's width, so at that size it fills the
          box exactly -- no crop, no letterbox. object-contain only matters
          for the rare image extreme enough to hit planMasonryPages' height
          cap, where it still avoids cropping rather than trimming the image
          to fit. */}
      <img
        src={image.display_image_url}
        alt={showNames ? `Submission by ${image.participant_name}` : 'Submission'}
        className="w-full shrink-0 object-contain"
        style={{ height: imageHeight }}
      />
      {hasFooter && (
        <div className="w-full shrink-0 bg-black/45 px-3 py-2 text-left">
          {showCaptions && image.content && (
            <p className="line-clamp-2 text-sm leading-snug text-white/90">{image.content}</p>
          )}
          {showNames && (
            <p className="truncate text-xs text-white/55">{image.participant_name}</p>
          )}
        </div>
      )}
    </button>
  );
}

function WallButton({
  children,
  onClick,
  disabled,
  label,
  isActive,
  isPrimary,
  isBare,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  isActive?: boolean;
  isPrimary?: boolean;
  isBare?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        isBare
          ? 'rounded-md p-1 text-white/70 hover:text-white'
          : 'rounded-full border px-4 py-2',
        !isBare && isPrimary
          ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30'
          : !isBare && isActive
            ? 'border-white/40 bg-white/15 text-white'
            : !isBare
              ? 'border-white/15 text-white/75 hover:border-white/35 hover:text-white'
              : ''
      )}
    >
      {children}
    </button>
  );
}
