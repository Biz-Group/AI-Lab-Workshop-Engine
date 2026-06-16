import Link from 'next/link';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  FileText,
  Layers,
  PlayCircle,
  Users,
  ArrowRight,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { getJoinField } from '@/lib/utils/supabase-join';

export default async function AdminDashboard() {
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get facilitator's organization
  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  const orgId = facilitator?.organization_id;

  // Get template IDs first for the modules count query
  const { data: orgTemplates } = await supabase
    .from('workshop_templates')
    .select('id')
    .eq('organization_id', orgId || '');
  const templateIds = orgTemplates?.map(t => t.id) || [];

  // Get stats
  const [templates, modules, sessions, recentSessions, activeSessions, totalParticipants] = await Promise.all([
    supabase.from('workshop_templates').select('id', { count: 'exact', head: true }).eq('organization_id', orgId || ''),
    templateIds.length > 0
      ? supabase.from('modules').select('id', { count: 'exact', head: true }).in('template_id', templateIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('organization_id', orgId || ''),
    supabase.from('sessions')
      .select(`
        id,
        join_code,
        status,
        created_at,
        template:workshop_templates(name)
      `)
      .eq('organization_id', orgId || '')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('organization_id', orgId || '').in('status', ['published', 'live']),
    supabase.from('participants').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Templates', value: templates.count || 0, icon: FileText, href: '/admin/templates' },
    { label: 'Modules', value: modules.count || 0, icon: Layers, href: '/admin/modules' },
    { label: 'Total Sessions', value: sessions.count || 0, icon: PlayCircle, href: '/admin/sessions' },
    { label: 'Active Sessions', value: activeSessions.count || 0, icon: Clock, href: '/admin/sessions' },
    { label: 'Total Participants', value: totalParticipants.count || 0, icon: Users, href: '/admin/sessions' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/80">Welcome to your workshop management dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className="w-12 h-12 bg-brand-100 rounded-lg flex items-center justify-center">
                    <stat.icon className="w-6 h-6 text-brand-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link href="/admin/templates/new" className="block group">
                <div className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
                    <FileText className="w-4 h-4 text-brand-600" />
                  </div>
                  <span className="flex-1">Create New Template</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand-600 transition-colors" />
                </div>
              </Link>
              <Link href="/admin/sessions/new" className="block group">
                <div className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0 group-hover:bg-green-200 transition-colors">
                    <PlayCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="flex-1">Start New Session</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand-600 transition-colors" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Recent Sessions</h2>
            {recentSessions.data && recentSessions.data.length > 0 ? (
              <div className="space-y-3">
                {recentSessions.data.map((session) => (
                  <Link 
                    key={session.id} 
                    href={`/session/${session.id}/presenter`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {getJoinField(session.template, 'name') || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="font-mono">{session.join_code}</span>
                        <span>•</span>
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(session.created_at)}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      session.status === 'live' 
                        ? 'bg-green-100 text-green-700'
                        : session.status === 'published'
                          ? 'bg-blue-100 text-blue-700'
                          : session.status === 'ended'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {session.status}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No sessions yet</p>
                <Link href="/admin/sessions/new" className="text-brand-600 hover:underline text-sm">
                  Create your first session
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
