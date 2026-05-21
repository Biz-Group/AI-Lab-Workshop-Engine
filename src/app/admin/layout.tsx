import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { AdminNav } from '@/components/admin/AdminNav';
import { Breadcrumbs } from '@/components/admin/Breadcrumbs';
import { AccessRequestForm } from '@/components/admin/AccessRequestForm';
import { getJoinField } from '@/lib/utils/supabase-join';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/auth/login');
  }

  // Get facilitator info
  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select(`
      id,
      display_name,
      role,
      organization:organizations(id, name)
    `)
    .eq('user_id', user.id)
    .single();

  if (!facilitator) {
    // User is authenticated but not a facilitator — show access request form
    return (
      <div className="min-h-screen flex items-center justify-center">
        <AccessRequestForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav 
        user={{
          email: user.email || '',
          displayName: facilitator.display_name,
          role: facilitator.role,
          organizationName: getJoinField(facilitator.organization, 'name') || '',
        }}
      />
      <main className="flex-1 overflow-auto">
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
