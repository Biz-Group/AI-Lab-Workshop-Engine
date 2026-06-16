'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { createClient } from '@/lib/supabase';
import toast from 'react-hot-toast';

function LoginForm() {
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect') || '/admin';
  // Only allow relative paths to prevent open redirect
  const redirect = (rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.includes('://')) ? rawRedirect : '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  const supabase = createClient();

  // Check if already logged in - but don't auto-redirect
  useEffect(() => {
    async function checkUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setAlreadyLoggedIn(true);
        }
      } catch {
        setAlreadyLoggedIn(false);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkUser();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          toast.success('Signed in successfully!');
          // Force full page reload to ensure cookies are properly set
          setTimeout(() => {
            window.location.href = redirect;
          }, 500);
          return;
        } else {
          throw new Error('No session created');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          toast.success('Account created successfully!');
          setTimeout(() => {
            window.location.href = redirect;
          }, 500);
          return;
        } else {
          toast.success('Account created. Check your email to confirm and then sign in.');
          setMode('signin');
          setIsLoading(false);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            {checkingAuth ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Checking authentication...</p>
              </div>
            ) : alreadyLoggedIn ? (
              <div className="text-center space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Signed In</h1>
                  <p className="text-gray-600">You&apos;re already authenticated</p>
                </div>
                
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      window.location.href = redirect;
                    }}
                    className="w-full"
                  >
                    Continue to Dashboard
                  </Button>
                  
                  <Button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setAlreadyLoggedIn(false);
                      toast.success('Signed out successfully');
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Sign Out &amp; Login with Different Account
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <Image
                    src="/biz-group-logo.webp"
                    alt="Biz Group"
                    width={64}
                    height={62}
                    className="mx-auto mb-4 rounded-lg"
                  />
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    {mode === 'signin' ? 'Facilitator Sign In' : 'Create Facilitator Account'}
                  </h1>
                  <p className="text-gray-600">
                    {mode === 'signin'
                      ? 'Sign in with your email and password'
                      : 'Use an email and password to create an account'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="you@organization.com"
                    label="Email Address"
                    autoFocus
                  />

                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    label="Password"
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  {mode === 'signup' && (
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setError('');
                      }}
                      placeholder="••••••••"
                      label="Confirm Password"
                    />
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    isLoading={isLoading}
                  >
                    {!isLoading && (mode === 'signin' ? 'Sign In' : 'Create Account')}
                  </Button>
                </form>

                <div className="mt-6 text-sm text-gray-500 text-center space-y-2">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setError('');
                    }}
                  >
                    {mode === 'signin'
                      ? 'Need an account? Create one'
                      : 'Already have an account? Sign in'}
                  </button>
                  <p>
                    Don&apos;t have access?{' '}
                    <a href="mailto:support@example.com" className="text-brand-600 hover:underline">
                      Contact us
                    </a>
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
