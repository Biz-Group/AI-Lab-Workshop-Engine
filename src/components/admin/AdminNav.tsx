'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Layers,
  PlayCircle,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase';

interface AdminNavProps {
  user: {
    email: string;
    displayName: string;
    role: string;
    organizationName: string;
  };
}

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/organizations', label: 'Organization', icon: Building2 },
  { href: '/admin/templates', label: 'Templates', icon: FileText },
  { href: '/admin/modules', label: 'Activities', icon: Layers },
  { href: '/admin/sessions', label: 'Sessions', icon: PlayCircle },
];

export function AdminNav({ user }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 glass rounded-lg shadow-md"
      >
        {isMobileOpen ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 w-64 glass-strong border-r border-white/20 transform transition-transform lg:transform-none',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/20">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src="/biz-group-logo.webp"
                alt="Biz Group"
                width={36}
                height={36}
                style={{ width: 'auto', height: 'auto' }}
                className="rounded"
              />
              <span className="text-xl font-bold text-brand-700">Workshop Admin</span>
            </Link>
            <p className="text-sm text-gray-500 mt-2">{user.organizationName}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="p-4 border-t border-white/20">
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                  <span className="text-brand-700 font-semibold">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                </div>
                <ChevronDown className={cn(
                  'w-4 h-4 text-gray-400 transition-transform',
                  isUserMenuOpen && 'transform rotate-180'
                )} />
              </button>

              {isUserMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 glass-strong rounded-lg shadow-lg border border-white/30 py-2">
                  <p className="px-4 py-2 text-sm text-gray-500">{user.email}</p>
                  <hr className="my-2 border-white/20" />
                  <Link
                    href="/"
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50/50"
                  >
                    <Home className="w-4 h-4" />
                    Back to Site
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50/50"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
