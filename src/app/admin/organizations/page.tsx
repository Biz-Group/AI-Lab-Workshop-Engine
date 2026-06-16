import Link from 'next/link';
/* eslint-disable @next/next/no-img-element */
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { Building2, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { ClientsManager } from './ClientsManager';

export default async function OrganizationsPage() {
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get facilitator's organization
  const serviceClient = await createServiceClient();
  const { data: facilitator } = await serviceClient
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  const orgId = facilitator?.organization_id;

  // Fetch org details directly (avoids join inconsistencies + RLS issues)
  const { data: organization } = orgId
    ? await serviceClient
        .from('organizations')
        .select('id, name, contact_email, logo_url, created_at')
        .eq('id', orgId)
        .single()
    : { data: null };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Organization</h1>
        <p className="text-white/80">Manage your organization settings</p>
      </div>

      <div className="max-w-2xl space-y-8">
        {organization ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-6">
                {organization.logo_url ? (
                  <img 
                    src={organization.logo_url} 
                    alt={organization.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 bg-brand-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-10 h-10 text-brand-600" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {organization.name}
                  </h2>
                  <div className="space-y-2 text-sm text-gray-600">
                    {organization.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span>{organization.contact_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Organization Found
              </h3>
              <p className="text-gray-600 mb-6">
                Your account is not associated with an organization yet.
              </p>
              <Link 
                href="/admin"
                className="text-brand-600 hover:underline"
              >
                Back to Dashboard
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Always show Approved Clients */}
        <ClientsManager />
      </div>
    </div>
  );
}
