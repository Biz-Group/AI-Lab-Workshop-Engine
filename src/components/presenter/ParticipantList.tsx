'use client';

import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import {
  Users,
  Search,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  StickyNote,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ParticipantInfo {
  id: string;
  display_name: string;
  email: string | null;
  joined_at: string;
  last_seen_at: string;
  current_step_id: string | null;
  is_stuck: boolean;
  completed_steps: string[];
  facilitator_notes: string | null;
}

interface ParticipantListProps {
  sessionId: string;
  allStepIds: string[];
  totalSteps: number;
  className?: string;
}

type SortOption = 'name' | 'progress' | 'recent';
type FilterOption = 'all' | 'stuck' | 'active' | 'completed';

export const ParticipantList = memo(function ParticipantList({
  sessionId,
  totalSteps,
  className,
}: ParticipantListProps) {
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('progress');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const dismissedStuckRef = useRef<Set<string>>(new Set());

  // Fetch participants and their progress
  const fetchParticipants = useCallback(async () => {
    const supabase = createClient();

    // Fetch participants
    const { data: participantsData, error: pError } = await supabase
      .from('participants')
      .select('id, display_name, email, joined_at, last_seen_at, current_step_id, facilitator_notes')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true });

    if (pError || !participantsData) return;

    // Fetch all submissions for this session
    const { data: submissionsData } = await supabase
      .from('submissions')
      .select('participant_id, step_id')
      .eq('session_id', sessionId);

    // Fetch stuck signals (recent analytics events)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuckData } = await supabase
      .from('analytics_events')
      .select('participant_id')
      .eq('session_id', sessionId)
      .eq('event_type', 'stuck_signal')
      .gte('created_at', fiveMinutesAgo);

    const stuckParticipantIds = new Set(stuckData?.map((signal) => signal.participant_id) || []);

    // Exclude dismissed stuck signals
    for (const dismissedId of dismissedStuckRef.current) {
      stuckParticipantIds.delete(dismissedId);
    }

    const completedStepsByParticipant = new Map<string, string[]>();
    for (const submission of submissionsData || []) {
      const participantSteps = completedStepsByParticipant.get(submission.participant_id);
      if (participantSteps) {
        participantSteps.push(submission.step_id);
      } else {
        completedStepsByParticipant.set(submission.participant_id, [submission.step_id]);
      }
    }

    // Build participant info
    const enriched: ParticipantInfo[] = participantsData.map((participant) => {
      return {
        ...participant,
        is_stuck: stuckParticipantIds.has(participant.id),
        completed_steps: completedStepsByParticipant.get(participant.id) || [],
        facilitator_notes: participant.facilitator_notes || null,
      };
    });

    setParticipants(enriched);
    setIsLoading(false);
  }, [sessionId]);

  // Initial fetch + infrequent fallback refresh (realtime handles fast updates)
  useEffect(() => {
    fetchParticipants();
    const interval = setInterval(fetchParticipants, 30000);
    return () => clearInterval(interval);
  }, [fetchParticipants]);

  // Subscribe to new participants
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`participant-list:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          fetchParticipants();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchParticipants]);

  // Filter & Sort
  const filteredParticipants = useMemo(() => {
    const now = Date.now();
    const search = searchQuery.trim().toLowerCase();

    return participants
      .filter((participant) => {
        // Search filter
        if (search) {
          if (!participant.display_name.toLowerCase().includes(search) &&
              !(participant.email?.toLowerCase().includes(search))) {
            return false;
          }
        }

        // Status filter
        if (filterBy === 'stuck') return participant.is_stuck;
        if (filterBy === 'completed') return participant.completed_steps.length === totalSteps;
        if (filterBy === 'active') {
          const lastSeen = new Date(participant.last_seen_at).getTime();
          return now - lastSeen < 2 * 60 * 1000; // Active in last 2 min
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.display_name.localeCompare(b.display_name);
        if (sortBy === 'progress') return b.completed_steps.length - a.completed_steps.length;
        if (sortBy === 'recent') return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
        return 0;
      });
  }, [filterBy, participants, searchQuery, sortBy, totalSteps]);

  const { stuckCount, completedAllCount } = useMemo(() => (
    participants.reduce(
      (summary, participant) => {
        if (participant.is_stuck) {
          summary.stuckCount += 1;
        }
        if (participant.completed_steps.length === totalSteps) {
          summary.completedAllCount += 1;
        }
        return summary;
      },
      { stuckCount: 0, completedAllCount: 0 }
    )
  ), [participants, totalSteps]);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Get avatar color from name (deterministic)
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
      'bg-cyan-500', 'bg-orange-500',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Check if participant is "online" (seen in last 2 min)
  const isOnline = (lastSeen: string) => {
    return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
  };

  const getProgressPercent = (p: ParticipantInfo) => {
    return totalSteps > 0 ? Math.round((p.completed_steps.length / totalSteps) * 100) : 0;
  };

  // Save facilitator note
  const saveNote = async (participantId: string) => {
    const text = noteDrafts[participantId] ?? '';
    setSavingNote(participantId);
    try {
      const res = await fetch(`/api/admin/participants/${participantId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilitator_notes: text }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      // Update local state
      setParticipants(prev =>
        prev.map(p => p.id === participantId ? { ...p, facilitator_notes: text || null } : p)
      );
      toast.success('Note saved');
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSavingNote(null);
    }
  };

  // Dismiss stuck signal
  const dismissStuck = async (participantId: string) => {
    // Immediately update UI
    dismissedStuckRef.current.add(participantId);
    setParticipants(prev =>
      prev.map(p => p.id === participantId ? { ...p, is_stuck: false } : p)
    );

    // Persist dismissal by deleting recent stuck_signal events
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_stuck', participantId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || 'Failed to dismiss stuck signal');
      }
    } catch {
      toast.error('Failed to dismiss stuck signal');
    }
  };

  return (
    <div className={cn('flex flex-col bg-gray-800 text-white', className)}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-4 py-3 border-b border-gray-700 hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold">Participants</span>
          <span className="text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full">
            {participants.length}
          </span>
        </div>
        {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!isCollapsed && (
        <>
          {/* Quick Stats */}
          <div className="flex gap-2 px-3 py-2 border-b border-gray-700">
            <button
              onClick={() => setFilterBy('all')}
              className={cn(
                'text-xs px-2 py-1 rounded-full transition-colors',
                filterBy === 'all' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'
              )}
            >
              All ({participants.length})
            </button>
            {stuckCount > 0 && (
              <button
                onClick={() => setFilterBy(filterBy === 'stuck' ? 'all' : 'stuck')}
                className={cn(
                  'text-xs px-2 py-1 rounded-full transition-colors',
                  filterBy === 'stuck' ? 'bg-orange-600 text-white' : 'text-orange-400 hover:text-orange-300'
                )}
              >
                Stuck ({stuckCount})
              </button>
            )}
            <button
              onClick={() => setFilterBy(filterBy === 'completed' ? 'all' : 'completed')}
              className={cn(
                'text-xs px-2 py-1 rounded-full transition-colors',
                filterBy === 'completed' ? 'bg-green-600 text-white' : 'text-green-400 hover:text-green-300'
              )}
            >
              Done ({completedAllCount})
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search participants..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Sort:</span>
            {(['progress', 'name', 'recent'] as SortOption[]).map(option => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded transition-colors capitalize',
                  sortBy === option ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-400'
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Participant List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
            ) : filteredParticipants.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? 'No matches found' : 'No participants yet'}
              </div>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {filteredParticipants.map(p => (
                  <div
                    key={p.id}
                    className={cn(
                      'px-3 py-2.5 hover:bg-gray-750 transition-colors cursor-pointer',
                      p.is_stuck && 'bg-orange-900/20'
                    )}
                  >
                    <div
                      className="flex items-center gap-2.5"
                      onClick={() => {
                        const next = expandedId === p.id ? null : p.id;
                        setExpandedId(next);
                        if (next && !(p.id in noteDrafts)) {
                          setNoteDrafts(prev => ({ ...prev, [p.id]: p.facilitator_notes || '' }));
                        }
                      }}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
                          getAvatarColor(p.display_name)
                        )}>
                          {getInitials(p.display_name)}
                        </div>
                        {/* Online indicator */}
                        <div className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-800',
                          isOnline(p.last_seen_at) ? 'bg-green-400' : 'bg-gray-500'
                        )} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-white truncate">
                            {p.display_name}
                          </span>
                          {p.facilitator_notes && (
                            <StickyNote className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                          )}
                          {p.is_stuck && (
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                          )}
                          {p.completed_steps.length === totalSteps && totalSteps > 0 && (
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                p.completed_steps.length === totalSteps && totalSteps > 0
                                  ? 'bg-green-500'
                                  : 'bg-brand-500'
                              )}
                              style={{ width: `${getProgressPercent(p)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {p.completed_steps.length}/{totalSteps}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Section */}
                    {expandedId === p.id && (
                      <div className="mt-2 pl-10 space-y-2">
                        {/* Stuck dismiss */}
                        {p.is_stuck && (
                          <button
                            onClick={(e) => { e.stopPropagation(); dismissStuck(p.id); }}
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 bg-orange-900/30 px-2 py-1 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Dismiss stuck signal
                          </button>
                        )}

                        {/* Note textarea */}
                        <div>
                          <textarea
                            value={noteDrafts[p.id] ?? p.facilitator_notes ?? ''}
                            onChange={(e) => setNoteDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="Add facilitator notes..."
                            rows={2}
                            className="w-full bg-gray-700 border border-gray-600 rounded text-xs text-white placeholder:text-gray-500 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); saveNote(p.id); }}
                            disabled={savingNote === p.id}
                            className="mt-1 text-[10px] text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
                          >
                            {savingNote === p.id ? 'Saving...' : 'Save note'}
                          </button>
                        </div>

                        {/* Info row */}
                        <div className="text-[10px] text-gray-500">
                          Joined {new Date(p.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {p.email && <span> · {p.email}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
