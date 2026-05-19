'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type KeyboardEvent,
  type FocusEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ImageIcon,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Maximize2,
  Search,
  Layers,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────
interface StepInfo {
  id: string;
  title: string;
  moduleTitle: string;
  isRequired: boolean;
}

interface GalleryImage {
  id: string;
  step_id: string;
  image_url: string;
  display_image_url: string;
  content: string;
  participant_name: string;
  created_at: string;
  updated_at: string;
}

interface TextResponse {
  id: string;
  step_id: string;
  content: string;
  participant_name: string;
  created_at: string;
}

type ViewMode = 'images' | 'responses' | 'all';

interface SubmissionGalleryProps {
  session: {
    id: string;
    status: string;
    joinCode: string;
    templateName: string;
    organizationName: string;
  };
  steps: StepInfo[];
}

function buildVersionedImageUrl(url: string, updatedAt: string) {
  const version = Date.parse(updatedAt);
  if (Number.isNaN(version)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

const SCROLL_EDGE_TOLERANCE = 2;

export function SubmissionGallery({ session, steps }: SubmissionGalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [responses, setResponses] = useState<TextResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filterStepId, setFilterStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isStepStripFocused, setIsStepStripFocused] = useState(false);

  const stepStripRef = useRef<HTMLDivElement | null>(null);
  const allStepsChipRef = useRef<HTMLButtonElement | null>(null);
  const stepChipRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const setStepChipRef = useCallback(
    (stepId: string) => (element: HTMLButtonElement | null) => {
      stepChipRefs.current.set(stepId, element);
    },
    []
  );

  const getOrderedStepChips = useCallback(() => {
    return [
      allStepsChipRef.current,
      ...steps.map((step) => stepChipRefs.current.get(step.id) || null),
    ].filter((chip): chip is HTMLButtonElement => chip !== null);
  }, [steps]);

  const updateStepStripScrollState = useCallback(() => {
    const strip = stepStripRef.current;
    if (!strip) return;

    const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
    setCanScrollLeft(strip.scrollLeft > SCROLL_EDGE_TOLERANCE);
    setCanScrollRight(maxScrollLeft - strip.scrollLeft > SCROLL_EDGE_TOLERANCE);
  }, []);

  const scrollToNextHiddenChip = useCallback(
    (direction: 'left' | 'right') => {
      const strip = stepStripRef.current;
      if (!strip) return;

      const stripRect = strip.getBoundingClientRect();
      const chips = getOrderedStepChips();
      if (chips.length === 0) return;

      const reversed = [...chips].reverse();
      const target =
        direction === 'right'
          ? chips.find(
              (chip) =>
                chip.getBoundingClientRect().left >=
                stripRect.right - SCROLL_EDGE_TOLERANCE
            ) ||
            chips.find(
              (chip) =>
                chip.getBoundingClientRect().right >
                stripRect.right + SCROLL_EDGE_TOLERANCE
            )
          : reversed.find(
              (chip) =>
                chip.getBoundingClientRect().right <=
                stripRect.left + SCROLL_EDGE_TOLERANCE
            ) ||
            reversed.find(
              (chip) =>
                chip.getBoundingClientRect().left <
                stripRect.left - SCROLL_EDGE_TOLERANCE
            );

      if (!target) return;
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    },
    [getOrderedStepChips]
  );

  const handleStepStripKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      const strip = stepStripRef.current;
      if (!strip || !strip.contains(document.activeElement)) return;

      event.preventDefault();
      const stepOrder: Array<string | null> = [null, ...steps.map((step) => step.id)];
      const currentIndex = Math.max(stepOrder.indexOf(filterStepId), 0);
      const nextIndex =
        event.key === 'ArrowRight'
          ? Math.min(currentIndex + 1, stepOrder.length - 1)
          : Math.max(currentIndex - 1, 0);
      setFilterStepId(stepOrder[nextIndex]);
    },
    [filterStepId, steps]
  );

  const handleStepStripBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsStepStripFocused(false);
    }
  }, []);

  // Fetch all image submissions
  const fetchImages = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('submissions')
      .select(`
        id,
        step_id,
        image_url,
        content,
        created_at,
        updated_at,
        participant:participants(display_name)
      `)
      .eq('session_id', session.id)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const mapped: GalleryImage[] = data.map((row) => {
        const p = row.participant;
        const name = Array.isArray(p) ? p[0]?.display_name : (p as { display_name: string } | null)?.display_name;
        return {
          id: row.id,
          step_id: row.step_id,
          image_url: row.image_url!,
          display_image_url: buildVersionedImageUrl(
            row.image_url!,
            row.updated_at || row.created_at
          ),
          content: row.content || '',
          participant_name: name || 'Unknown',
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });
      setImages(mapped);
    }
  }, [session.id]);

  // Fetch text responses (submissions with content, regardless of image)
  const fetchResponses = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('submissions')
      .select(`
        id,
        step_id,
        content,
        created_at,
        participant:participants(display_name)
      `)
      .eq('session_id', session.id)
      .not('content', 'is', null)
      .neq('content', '')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const mapped: TextResponse[] = data.map((row) => {
        const p = row.participant;
        const name = Array.isArray(p) ? p[0]?.display_name : (p as { display_name: string } | null)?.display_name;
        return {
          id: row.id,
          step_id: row.step_id,
          content: row.content!,
          participant_name: name || 'Unknown',
          created_at: row.created_at,
        };
      });
      setResponses(mapped);
    }
  }, [session.id]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    await Promise.all([fetchImages(), fetchResponses()]);
    setIsLoading(false);
  }, [fetchImages, fetchResponses]);

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const validIds = new Set(steps.map((step) => step.id));
    for (const key of stepChipRefs.current.keys()) {
      if (!validIds.has(key)) {
        stepChipRefs.current.delete(key);
      }
    }
  }, [steps]);

  useEffect(() => {
    const strip = stepStripRef.current;
    if (!strip) return;

    const handleScroll = () => updateStepStripScrollState();
    const handleResize = () => updateStepStripScrollState();

    updateStepStripScrollState();
    strip.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      strip.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateStepStripScrollState]);

  useEffect(() => {
    updateStepStripScrollState();
  }, [steps.length, images.length, updateStepStripScrollState]);

  useEffect(() => {
    const selectedChip = filterStepId
      ? stepChipRefs.current.get(filterStepId)
      : allStepsChipRef.current;
    if (!selectedChip) return;

    selectedChip.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [filterStepId]);

  useEffect(() => {
    if (!selectedImage) return;

    const updatedSelected = images.find((img) => img.id === selectedImage.id);
    if (!updatedSelected) {
      setSelectedImage(null);
      return;
    }

    if (updatedSelected !== selectedImage) {
      setSelectedImage(updatedSelected);
    }
  }, [images, selectedImage]);

  // Real-time subscription for submissions
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`gallery:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchAll();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'submissions',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchAll();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'submissions',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, fetchAll]);

  // Fallback refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchAll]);

  // Group images by step
  const imagesByStep = steps
    .map((step) => ({
      step,
      images: images.filter((img) => img.step_id === step.id),
    }))
    .filter((group) => !filterStepId || group.step.id === filterStepId);

  const totalImages = images.length;
  const totalResponses = responses.length;
  const filteredImages = filterStepId
    ? images.filter((img) => img.step_id === filterStepId)
    : images;

  // Filter responses by step and search
  const filteredResponses = useMemo(() => {
    let result = responses;
    if (filterStepId) {
      result = result.filter((r) => r.step_id === filterStepId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.content.toLowerCase().includes(q) ||
          r.participant_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [responses, filterStepId, searchQuery]);

  // Group responses by step for masonry sections
  const responsesByStep = useMemo(() => {
    return steps
      .map((step) => ({
        step,
        responses: filteredResponses.filter((r) => r.step_id === step.id),
      }))
      .filter((group) => group.responses.length > 0);
  }, [steps, filteredResponses]);

  // Lightbox navigation
  const currentIndex = selectedImage
    ? filteredImages.findIndex((img) => img.id === selectedImage.id)
    : -1;

  const goToImage = (dir: 'prev' | 'next') => {
    if (currentIndex < 0) return;
    const newIndex = dir === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < filteredImages.length) {
      setSelectedImage(filteredImages[newIndex]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/session/${session.id}/presenter`}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Submission Gallery
              </h1>
              <p className="text-sm text-gray-500">
                {session.templateName} &middot; {session.organizationName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('all')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Layers className="w-3.5 h-3.5 inline mr-1" />
                All
              </button>
              <button
                onClick={() => setViewMode('images')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'images'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                Images
              </button>
              <button
                onClick={() => setViewMode('responses')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'responses'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                Responses
              </button>
            </div>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              {totalImages}
            </span>
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              {totalResponses}
            </span>
            {session.status === 'live' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Step Filter */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-7xl mx-auto relative">
          <button
            type="button"
            aria-label="Scroll steps left"
            onClick={() => scrollToNextHiddenChip('left')}
            disabled={!canScrollLeft}
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-opacity',
              canScrollLeft
                ? 'hover:bg-gray-50 hover:text-gray-800'
                : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll steps right"
            onClick={() => scrollToNextHiddenChip('right')}
            disabled={!canScrollRight}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-opacity',
              canScrollRight
                ? 'hover:bg-gray-50 hover:text-gray-800'
                : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 left-10 z-10 w-8 bg-gradient-to-r from-white to-transparent transition-opacity',
              canScrollLeft ? 'opacity-100' : 'opacity-0'
            )}
          />
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 right-10 z-10 w-8 bg-gradient-to-l from-white to-transparent transition-opacity',
              canScrollRight ? 'opacity-100' : 'opacity-0'
            )}
          />
          <div
            ref={stepStripRef}
            role="tablist"
            aria-label="Filter gallery by workshop step"
            tabIndex={0}
            onFocusCapture={() => setIsStepStripFocused(true)}
            onBlurCapture={handleStepStripBlur}
            onKeyDown={handleStepStripKeyDown}
            className={cn(
              'mx-10 flex items-center gap-2 overflow-x-auto scroll-smooth rounded-lg px-1 py-1 outline-none',
              isStepStripFocused && 'ring-2 ring-brand-500 ring-offset-2'
            )}
          >
          <button
            ref={allStepsChipRef}
            role="tab"
            aria-selected={!filterStepId}
            aria-controls="gallery-content"
            aria-label="Show submissions from all steps"
            onClick={() => setFilterStepId(null)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
              !filterStepId
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            All Steps
          </button>
          {steps.map((step, i) => {
            const imgCount = images.filter((img) => img.step_id === step.id).length;
            const respCount = responses.filter((r) => r.step_id === step.id).length;
            const count = viewMode === 'images' ? imgCount : viewMode === 'responses' ? respCount : imgCount + respCount;
            return (
              <button
                key={step.id}
                ref={setStepChipRef(step.id)}
                role="tab"
                aria-selected={filterStepId === step.id}
                aria-controls="gallery-content"
                aria-label={`Show submissions for step ${i + 1}: ${step.title}`}
                onClick={() => setFilterStepId(step.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                  filterStepId === step.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {i + 1}. {step.title}
                {count > 0 && (
                  <span className="ml-1.5 opacity-75">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      </div>

      {/* Search (visible in responses/all mode) */}
      {(viewMode === 'responses' || viewMode === 'all') && (
        <div className="bg-white border-b border-gray-100 px-6 py-2">
          <div className="max-w-7xl mx-auto">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search responses..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Gallery Content */}
      <main id="gallery-content" className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : (viewMode === 'images' && totalImages === 0) || (viewMode === 'responses' && totalResponses === 0) || (viewMode === 'all' && totalImages === 0 && totalResponses === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              {viewMode === 'responses' ? (
                <MessageSquare className="w-8 h-8 text-gray-400" />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-1">
              {viewMode === 'images' ? 'No images submitted yet' : viewMode === 'responses' ? 'No text responses yet' : 'No submissions yet'}
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              Submissions will appear here in real-time as participants respond during the workshop.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Image Gallery Section */}
            {(viewMode === 'images' || viewMode === 'all') && filteredImages.length > 0 && (
              <div className="space-y-8">
                {viewMode === 'all' && (
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Images</h2>
                    <span className="text-sm text-gray-400">({filteredImages.length})</span>
                  </div>
                )}
                {imagesByStep.map(({ step, images: stepImages }) => {
                  if (stepImages.length === 0) return null;
                  return (
                    <section key={step.id}>
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-sm font-semibold text-gray-900">
                          {step.moduleTitle}
                        </h2>
                        <span className="text-gray-300">/</span>
                        <h3 className="text-sm font-medium text-gray-600">
                          {step.title}
                        </h3>
                        <span className="ml-2 text-xs text-gray-400 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {stepImages.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {stepImages.map((img) => (
                          <button
                            key={img.id}
                            onClick={() => setSelectedImage(img)}
                            className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-brand-400 hover:shadow-md transition-all"
                          >
                            <img
                              src={img.display_image_url}
                              alt={`Submission by ${img.participant_name}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                              <div className="w-full p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-white text-xs font-medium truncate">
                                  {img.participant_name}
                                </p>
                                <p className="text-white/70 text-[10px]">
                                  {new Date(img.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Maximize2 className="w-4 h-4 text-white drop-shadow-lg" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {/* Text Responses Section — Masonry Layout */}
            {(viewMode === 'responses' || viewMode === 'all') && filteredResponses.length > 0 && (
              <div className="space-y-8">
                {viewMode === 'all' && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Responses</h2>
                    <span className="text-sm text-gray-400">({filteredResponses.length})</span>
                  </div>
                )}
                {responsesByStep.map(({ step, responses: stepResponses }) => (
                  <section key={step.id}>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-sm font-semibold text-gray-900">
                        {step.moduleTitle}
                      </h2>
                      <span className="text-gray-300">/</span>
                      <h3 className="text-sm font-medium text-gray-600">
                        {step.title}
                      </h3>
                      <span className="ml-2 text-xs text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {stepResponses.length}
                      </span>
                    </div>
                    {/* CSS Masonry using columns */}
                    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 [&>*]:mb-4">
                      {stepResponses.map((resp) => {
                        const isExpanded = expandedResponseId === resp.id;
                        const isLong = resp.content.length > 200;
                        return (
                          <div
                            key={resp.id}
                            className="break-inside-avoid rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-brand-300 transition-all"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-brand-600">
                                {resp.participant_name}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(resp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className={cn(
                              'text-sm text-gray-800 whitespace-pre-wrap leading-relaxed',
                              !isExpanded && isLong && 'line-clamp-5'
                            )}>
                              {resp.content}
                            </p>
                            {isLong && (
                              <button
                                className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
                                onClick={() => setExpandedResponseId(isExpanded ? null : resp.id)}
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* No results for search */}
            {(viewMode === 'responses' || viewMode === 'all') && searchQuery && filteredResponses.length === 0 && totalResponses > 0 && (
              <div className="text-center py-12">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No responses matching &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          {/* Close */}
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Previous */}
          {currentIndex > 0 && (
            <button
              onClick={() => goToImage('prev')}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Next */}
          {currentIndex < filteredImages.length - 1 && (
            <button
              onClick={() => goToImage('next')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image */}
          <div className="max-w-5xl max-h-[85vh] flex flex-col items-center">
            <img
              src={selectedImage.display_image_url}
              alt={`Submission by ${selectedImage.participant_name}`}
              className="max-w-full max-h-[75vh] object-contain rounded-lg"
            />
            <div className="mt-3 text-center">
              <p className="text-white font-medium text-sm">
                {selectedImage.participant_name}
              </p>
              {selectedImage.content && (
                <p className="text-white/70 text-xs mt-1 max-w-lg">
                  {selectedImage.content}
                </p>
              )}
              <p className="text-white/50 text-xs mt-1">
                {new Date(selectedImage.created_at).toLocaleString()}
              </p>
              <p className="text-white/40 text-xs mt-0.5">
                {currentIndex + 1} of {filteredImages.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
