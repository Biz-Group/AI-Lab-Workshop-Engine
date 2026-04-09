'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, CheckCircle2, Mail, Sparkles } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { isValidJoinCodeFormat, formatJoinCodeForDisplay } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function JoinPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCode = joinCode.trim();
    
    if (!trimmedCode) {
      setError('Please enter a join code');
      return;
    }

    if (!isValidJoinCodeFormat(trimmedCode)) {
      setError('Invalid code format. Use 4 characters (e.g., A7K3) or word-word format (e.g., happy-river)');
      return;
    }

    setIsLoading(true);

    try {
      // Verify session exists via API
      const response = await fetch(`/api/sessions/verify?code=${encodeURIComponent(trimmedCode)}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Session not found. Please check the code and try again.');
        setIsLoading(false);
        return;
      }

      // Redirect to join flow with the code
      router.push(`/join/${formatJoinCodeForDisplay(trimmedCode)}`);
    } catch {
      toast.error('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="p-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/80 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-4 sm:mx-auto shadow-lg">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <Image
                src="/biz-group-logo.webp"
                alt="Biz Group"
                width={64}
                height={64}
                className="mx-auto mb-4 rounded-lg"
              />
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Join Workshop
              </h1>
              <p className="text-gray-600">
                Enter the code shown on the presenter&apos;s screen to join the live workshop
              </p>
            </div>

            <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">What happens next</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3 border border-gray-200">
                  <CheckCircle2 className="w-4 h-4 text-brand-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Join quickly</p>
                  <p className="text-xs text-gray-500 mt-1">Confirm the code and enter your details once.</p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-gray-200">
                  <Sparkles className="w-4 h-4 text-brand-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Build as you go</p>
                  <p className="text-xs text-gray-500 mt-1">Follow guided steps that show why each activity matters.</p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-gray-200">
                  <Mail className="w-4 h-4 text-brand-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Keep the outputs</p>
                  <p className="text-xs text-gray-500 mt-1">Receive your prompt pack and takeaways after the workshop.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Only uppercase alphanumeric codes; preserve word-format codes with hyphens
                    setJoinCode(val.includes('-') ? val.toLowerCase() : val.toUpperCase());
                    setError('');
                  }}
                  placeholder="Enter code (e.g., A7K3 or happy-river)"
                  className="text-center text-2xl font-mono tracking-wider h-16 border-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  error={error}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-lg"
                isLoading={isLoading}
              >
                {!isLoading && (
                  <>
                    Join Session
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500">
                Don't have a code? Ask your workshop facilitator.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-white/60 space-y-1">
        <p>Powered by <strong className="text-white/80">Biz Group</strong></p>
        <span>Your data is automatically deleted after 72 hours</span>
      </footer>
    </div>
  );
}
