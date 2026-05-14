'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Clock3, Mail, Sparkles } from 'lucide-react';
import { Button, Input, Card, CardContent, LoadingSpinner } from '@/components/ui';
import toast from 'react-hot-toast';

interface SessionInfo {
  id: string;
  organizationName: string;
  templateName: string;
  templateDescription: string | null;
  estimatedDurationMinutes: number | null;
  status: string;
}

export default function JoinWithCodePage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState('');
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Verify session on mount
  useEffect(() => {
    async function verifySession() {
      try {
        const response = await fetch(`/api/sessions/verify?code=${encodeURIComponent(code)}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || 'Session not found');
          setIsVerifying(false);
          return;
        }

        setSessionInfo(data.session);
        setIsVerifying(false);
      } catch {
        setError('Failed to verify session. Please try again.');
        setIsVerifying(false);
      }
    }

    verifySession();
  }, [code]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!displayName.trim()) {
      errors.displayName = 'Please enter your name';
    } else if (displayName.trim().length < 2) {
      errors.displayName = 'Name must be at least 2 characters';
    }

    if (!email.trim()) {
      errors.email = 'Please enter your email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!sessionInfo) return;

    setIsJoining(true);

    try {
      const response = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionInfo.id,
          displayName: displayName.trim(),
          email: email.trim(),
          emailConsent: true,
          marketingConsent: false,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to join session');
        setIsJoining(false);
        return;
      }

      // Redirect to session
      router.push(`/s/${sessionInfo.id}`);
    } catch {
      toast.error('Something went wrong. Please try again.');
      setIsJoining(false);
    }
  };

  // Loading state
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-4 sm:mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link href="/join">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Another Code
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="p-4">
        <Link
          href="/join"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Change Code
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl mx-4 sm:mx-auto shadow-lg">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Image
                src="/biz-group-logo.webp"
                alt="Biz Group"
                width={56}
                height={56}
                style={{ width: 'auto', height: 'auto' }}
                className="mx-auto mb-4 rounded-lg"
              />
              <div className="inline-flex items-center justify-center px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-4">
                Code: {code}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Join Workshop
              </h1>
              {sessionInfo && (
                <p className="text-gray-600">
                  {sessionInfo.organizationName} • {sessionInfo.templateName}
                </p>
              )}
            </div>

            {sessionInfo && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Your workshop path</p>
                    <h2 className="text-sm font-semibold text-gray-900">Join, build, leave with your prompt pack</h2>
                  </div>
                  {sessionInfo.estimatedDurationMinutes ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                      <Clock3 className="w-3.5 h-3.5" />
                      About {sessionInfo.estimatedDurationMinutes} min
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-white p-3 border border-gray-200">
                    <CheckCircle2 className="w-4 h-4 text-brand-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Join</p>
                    <p className="text-xs text-gray-500 mt-1">Enter once and we&apos;ll keep your place as the session unfolds.</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-gray-200">
                    <Sparkles className="w-4 h-4 text-brand-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Build</p>
                    <p className="text-xs text-gray-500 mt-1">Each step will show why it matters, what to do, and what good looks like.</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-gray-200">
                    <Mail className="w-4 h-4 text-brand-600 mb-2" />
                    <p className="text-sm font-medium text-gray-900">Keep the takeaway</p>
                    <p className="text-xs text-gray-500 mt-1">Your email is used to send your prompt pack and workshop takeaways afterwards.</p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Display Name */}
              <Input
                label="Your Name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setFormErrors({ ...formErrors, displayName: '' });
                }}
                placeholder="Enter your display name"
                error={formErrors.displayName}
                autoFocus
              />

              {/* Email (Required) */}
              <Input
                type="email"
                label="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFormErrors({ ...formErrors, email: '' });
                }}
                placeholder="your@email.com"
                hint="We use this to send your prompt pack and workshop takeaways when you finish."
                error={formErrors.email}
                required
              />

              <Button
                type="submit"
                className="w-full h-12"
                isLoading={isJoining}
              >
                {!isJoining && (
                  <>
                    Enter Workshop
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-xs text-gray-500 text-center">
              Your session data is automatically deleted after 72 hours.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
