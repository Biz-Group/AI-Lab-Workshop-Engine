import { redirect } from 'next/navigation';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { TeamManager } from '@/components/admin/TeamManager';

export default async function TeamPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const serviceClient = await createServiceClient();
  const { data: facilitator } = await serviceClient
    .from('facilitator_users')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (!facilitator || facilitator.role !== 'owner') {
    redirect('/admin');
  }

  // Fetch team members
  const { data: members } = await serviceClient
    .from('facilitator_users')
    .select('id, user_id, display_name, role, created_at')
    .eq('organization_id', facilitator.organization_id)
    .order('created_at');

  // Fetch auth user emails
  const emailMap: Record<string, string> = {};
  const allAuthUserIds: string[] = [];
  const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  if (authUsers) {
    for (const au of authUsers) {
      if (au.email) emailMap[au.id] = au.email;
      allAuthUserIds.push(au.id);
    }
  }

  // Attach emails to members
  const membersWithEmail = (members || []).map(m => ({
    ...m,
    email: emailMap[m.user_id] || '',
  }));

  // Fetch pending access requests
  const { data: requests } = await serviceClient
    .from('access_requests')
    .select('id, user_id, display_name, requested_role, status, created_at')
    .eq('organization_id', facilitator.organization_id)
    .eq('status', 'pending')
    .order('created_at');

  // Attach emails to requests
  const requestsWithEmail = (requests || []).map(r => ({
    ...r,
    email: emailMap[r.user_id] || '',
  }));

  // Find unlinked users: auth users who have no facilitator_users record anywhere
  const linkedUserIds = new Set((members || []).map(m => m.user_id));
  const pendingUserIds = new Set((requests || []).map(r => r.user_id));
  const unlinkedUsers = allAuthUserIds
    .filter(id => !linkedUserIds.has(id) && !pendingUserIds.has(id) && id !== user.id)
    .map(id => ({
      user_id: id,
      email: emailMap[id] || '',
      created_at: authUsers?.find(au => au.id === id)?.created_at || '',
    }));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
        <p className="text-gray-600 mt-2">Manage team members and approve access requests</p>
      </div>
      <TeamManager
        initialMembers={membersWithEmail}
        initialRequests={requestsWithEmail}
        unlinkedUsers={unlinkedUsers}
        currentUserId={user.id}
      />
    </div>
  );
}
