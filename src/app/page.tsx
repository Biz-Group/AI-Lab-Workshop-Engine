'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Loader2, Sparkles, Users, Zap } from 'lucide-react';
import { isValidJoinCodeFormat, formatJoinCodeForDisplay } from '@/lib/utils';
import toast from 'react-hot-toast';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Workshop Activity Handler';

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCode = joinCode.trim();

    if (!trimmedCode) {
      setError('Please enter a code');
      return;
    }

    if (!isValidJoinCodeFormat(trimmedCode)) {
      setError('Invalid code format');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/sessions/verify?code=${encodeURIComponent(trimmedCode)}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Session not found. Check your code and try again.');
        setIsLoading(false);
        return;
      }

      router.push(`/join/${formatJoinCodeForDisplay(trimmedCode)}`);
    } catch {
      toast.error('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top White Ribbon */}
      <header className="bg-white shadow-sm border-b border-gray-100 px-6 py-3 flex items-center justify-between relative z-10">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/biz-group-logo.webp"
            alt="Biz Group"
            width={36}
            height={36}
            style={{ width: 'auto', height: 'auto' }}
            className="rounded-lg"
          />
          <span className="text-xl font-bold text-gray-900">{appName}</span>
        </Link>
        <Link
          href="/auth/login"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium"
        >
          Facilitator Login
        </Link>
      </header>

      {/* Main Content — Split Layout */}
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-16 p-8 md:p-12 lg:p-16">
        {/* Left Side — Hero Text */}
        <div className="flex-1">
          <div className="max-w-lg">
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
              Guided AI workshops<br />
              with a clear path from <span className="text-white/90">first prompt to final takeaway</span>
            </h1>
            <p className="text-lg text-white/75 mb-10 leading-relaxed">
              Join live, facilitator-led sessions to master prompt engineering — 
              no sign-up needed. Just enter your code and start learning.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm">Join in seconds with a simple room code</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm">Understand where you are, why it matters, and what good looks like</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm">Leave with a personalized prompt pack and your saved outputs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side — Join Card */}
        <div className="w-full md:w-auto flex-shrink-0">
          <div className="w-full max-w-sm mx-auto">
            <div className="glass-strong rounded-2xl p-8 shadow-2xl border border-white/20">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Join a Session</h2>
              <p className="text-sm text-gray-500 mb-6">Enter the code shown on the presenter&apos;s screen</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.toUpperCase());
                      setError('');
                    }}
                    placeholder="e.g. A7K3"
                    className={`w-full text-center text-3xl font-mono tracking-[0.3em] h-16 rounded-xl border-2 bg-white/70 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors ${
                      error ? 'border-red-400' : 'border-gray-200'
                    }`}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={20}
                  />
                  {error && (
                    <p className="text-sm text-red-600 mt-1.5">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !joinCode.trim()}
                  className="w-full py-3.5 bg-brand-600 text-white text-lg font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Join Session
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-xs text-gray-400 text-center mt-5">
                Don&apos;t have a code? Ask your workshop facilitator.
              </p>
            </div>
          </div>
        </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 text-center text-xs text-white/40">
        Powered by <strong className="text-white/60">Biz Group</strong>
      </footer>
    </div>
  );
}
