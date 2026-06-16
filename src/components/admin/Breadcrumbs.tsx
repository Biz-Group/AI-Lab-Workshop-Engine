'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

const labelMap: Record<string, string> = {
  admin: 'Dashboard',
  sessions: 'Sessions',
  templates: 'Templates',
  modules: 'Activity Library',
  organizations: 'Organization',
  new: 'Create New',
};

export function Breadcrumbs() {
  const pathname = usePathname();

  // Don't show breadcrumbs on dashboard
  if (pathname === '/admin') return null;

  const segments = pathname.split('/').filter(Boolean);
  // Remove 'admin' prefix for display
  const displaySegments = segments.slice(1);

  if (displaySegments.length === 0) return null;

  const crumbs = displaySegments.map((segment, index) => {
    const path = '/' + segments.slice(0, index + 2).join('/');
    const isLast = index === displaySegments.length - 1;
    // Try label map, fallback to cleaned-up segment
    const label = labelMap[segment] || (
      // UUID-like segments show as "Detail"
      segment.match(/^[0-9a-f-]{36}$/) ? 'Detail' : 
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
    );

    return { path, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-sm px-8 pt-4 pb-0">
      <Link
        href="/admin"
        className="text-white/60 hover:text-white transition-colors"
      >
        <Home className="w-4 h-4" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-white/40" />
          {crumb.isLast ? (
            <span className="text-white font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.path}
              className="text-white/60 hover:text-white transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
