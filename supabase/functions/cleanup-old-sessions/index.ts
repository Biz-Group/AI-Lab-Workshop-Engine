// Supabase Edge Function: cleanup-old-sessions
// Deploy with: supabase functions deploy cleanup-old-sessions
//
// This function deletes:
// - Sessions older than 72 hours that have ended
// - Associated participants, submissions, and analytics data
//
// Schedule this to run every hour via Supabase Dashboard:
// pg_cron schedule: "0 * * * *" (every hour at minute 0)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Verify request (require CRON_SECRET for any non-scheduler call)
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');
    
    if (!cronSecret) {
      console.error('CRON_SECRET is not configured - denying access');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate cutoff time (72 hours ago)
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    console.log(`Cleaning up sessions ended before: ${cutoffTime}`);

    // Find sessions to delete
    const { data: sessionsToDelete, error: fetchError } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'ended')
      .lt('ended_at', cutoffTime);

    if (fetchError) {
      console.error('Error fetching sessions:', fetchError);
      throw fetchError;
    }

    if (!sessionsToDelete || sessionsToDelete.length === 0) {
      console.log('No sessions to clean up');
      return new Response(JSON.stringify({ 
        message: 'No sessions to clean up',
        deletedCount: 0 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionIds = sessionsToDelete.map((s) => s.id);
    console.log(`Found ${sessionIds.length} sessions to delete`);

    // Delete in order due to foreign key constraints:
    // 1. analytics_events
    // 2. feedback
    // 3. submissions (votes cascade from submissions)
    // 4. participants
    // 5. session_snapshot_prompt_blocks -> steps -> modules
    // 6. sessions

    // Delete analytics_events
    const { error: analyticsError, count: analyticsCount } = await supabase
      .from('analytics_events')
      .delete({ count: 'exact' })
      .in('session_id', sessionIds);
    
    if (analyticsError) console.error('Error deleting analytics:', analyticsError);
    else console.log(`Deleted ${analyticsCount} analytics events`);

    // Delete feedback
    const { error: feedbackError, count: feedbackCount } = await supabase
      .from('feedback')
      .delete({ count: 'exact' })
      .in('session_id', sessionIds);
    
    if (feedbackError) console.error('Error deleting feedback:', feedbackError);
    else console.log(`Deleted ${feedbackCount} feedback entries`);

    // Delete submissions (votes cascade via ON DELETE CASCADE)
    const { error: submissionsError, count: submissionsCount } = await supabase
      .from('submissions')
      .delete({ count: 'exact' })
      .in('session_id', sessionIds);
    
    if (submissionsError) console.error('Error deleting submissions:', submissionsError);
    else console.log(`Deleted ${submissionsCount} submissions`);

    // Delete participants
    const { error: participantsError, count: participantsCount } = await supabase
      .from('participants')
      .delete({ count: 'exact' })
      .in('session_id', sessionIds);
    
    if (participantsError) console.error('Error deleting participants:', participantsError);
    else console.log(`Deleted ${participantsCount} participants`);

    // Get module IDs for cascading delete
    const { data: modules } = await supabase
      .from('session_snapshot_modules')
      .select('id')
      .in('session_id', sessionIds);

    const moduleIds = modules?.map((m) => m.id) || [];

    if (moduleIds.length > 0) {
      // Get step IDs
      const { data: steps } = await supabase
        .from('session_snapshot_steps')
        .select('id')
        .in('snapshot_module_id', moduleIds);

      const stepIds = steps?.map((s) => s.id) || [];

      if (stepIds.length > 0) {
        // Delete prompt blocks
        const { error: promptBlocksError, count: promptBlocksCount } = await supabase
          .from('session_snapshot_prompt_blocks')
          .delete({ count: 'exact' })
          .in('snapshot_step_id', stepIds);
        
        if (promptBlocksError) console.error('Error deleting prompt blocks:', promptBlocksError);
        else console.log(`Deleted ${promptBlocksCount} prompt blocks`);
      }

      // Delete steps
      const { error: stepsError, count: stepsCount } = await supabase
        .from('session_snapshot_steps')
        .delete({ count: 'exact' })
        .in('snapshot_module_id', moduleIds);
      
      if (stepsError) console.error('Error deleting steps:', stepsError);
      else console.log(`Deleted ${stepsCount} steps`);

      // Delete modules
      const { error: modulesError, count: modulesCount } = await supabase
        .from('session_snapshot_modules')
        .delete({ count: 'exact' })
        .in('session_id', sessionIds);
      
      if (modulesError) console.error('Error deleting modules:', modulesError);
      else console.log(`Deleted ${modulesCount} modules`);
    }

    // Delete sessions
    const { error: sessionsError, count: sessionsCount } = await supabase
      .from('sessions')
      .delete({ count: 'exact' })
      .in('id', sessionIds);
    
    if (sessionsError) {
      console.error('Error deleting sessions:', sessionsError);
      throw sessionsError;
    }

    console.log(`✅ Cleanup complete: deleted ${sessionsCount} sessions`);

    return new Response(JSON.stringify({
      message: 'Cleanup completed successfully',
      deletedSessions: sessionsCount,
      deletedParticipants: participantsCount,
      deletedSubmissions: submissionsCount,
      deletedFeedback: feedbackCount,
      deletedAnalytics: analyticsCount,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
