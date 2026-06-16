'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { isValidJoinCodeFormat, formatJoinCodeForDisplay } from '@/lib/utils';
import toast from 'react-hot-toast';

// Characters excluding ambiguous ones (I, O, 0, 1)
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type FormStatus = 'idle' | 'error' | 'joining' | 'joined';

export default function HomePage() {
  const router = useRouter();
  const [cells, setCells] = useState<string[]>(['', '', '', '']);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setInputRef = useCallback((index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  }, []);

  const getCode = () => cells.join('');

  const handleInput = (index: number, value: string) => {
    const upper = value.toUpperCase();

    // Handle paste (multi-character input)
    if (upper.length > 1) {
      const chars = upper.split('').filter(c => SAFE_CHARS.includes(c)).slice(0, 4);
      const newCells = ['', '', '', ''];
      chars.forEach((c, i) => { newCells[i] = c; });
      setCells(newCells);
      setStatus('idle');
      setErrorMsg('');
      const focusIdx = Math.min(chars.length, 3);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    // Single character
    if (upper && !SAFE_CHARS.includes(upper)) return;

    const newCells = [...cells];
    newCells[index] = upper;
    setCells(newCells);
    setStatus('idle');
    setErrorMsg('');

    if (upper && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      setStatus('idle');
      setErrorMsg('');
      if (cells[index]) {
        const newCells = [...cells];
        newCells[index] = '';
        setCells(newCells);
      } else if (index > 0) {
        const newCells = [...cells];
        newCells[index - 1] = '';
        setCells(newCells);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'joining' || status === 'joined') return;

    // Focus first empty cell if not all filled
    const firstEmpty = cells.findIndex(c => !c);
    if (firstEmpty !== -1) {
      inputRefs.current[firstEmpty]?.focus();
      return;
    }

    const code = getCode();

    if (!isValidJoinCodeFormat(code)) {
      setStatus('error');
      setErrorMsg('That doesn\u2019t look like a valid code.');
      inputRefs.current[0]?.focus();
      return;
    }

    setStatus('joining');

    try {
      const response = await fetch(`/api/sessions/verify?code=${encodeURIComponent(code)}`);
      const data = await response.json();

      if (!data.success) {
        setStatus('error');
        setErrorMsg(data.error || 'That code isn\u2019t open right now \u2014 double-check it with your facilitator.');
        inputRefs.current[0]?.focus();
        return;
      }

      setStatus('joined');
      router.push(`/join/${formatJoinCodeForDisplay(code)}`);
    } catch {
      toast.error('Something went wrong. Please try again.');
      setStatus('idle');
    }
  };

  const firstEmptyIdx = cells.findIndex(c => !c);

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: 'var(--brand-gradient)' }}>
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <span className="absolute rounded-full" style={{ width: 480, height: 480, background: '#F58220', right: -140, top: -150, opacity: 0.92 }} />
        <span className="absolute rounded-full" style={{ width: 260, height: 260, background: '#fff', left: '46%', bottom: -130, opacity: 0.10 }} />
        <span className="absolute rounded-full" style={{ width: 340, height: 340, background: '#6B3FA0', left: -130, bottom: -150, opacity: 0.85 }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-8 md:px-14">
        <div className="flex items-center gap-3">
          <span className="flex gap-[5px]">
            <span className="w-3 h-3 rounded-full bg-[#6B3FA0]" />
            <span className="w-3 h-3 rounded-full bg-[#8BC53F]" />
            <span className="w-3 h-3 rounded-full bg-[#F58220]" />
          </span>
          <span className="leading-none">
            <div className="font-display font-extrabold text-[21px] tracking-tight text-white">The AI Lab</div>
            <div className="font-bold text-[10px] tracking-[0.16em] uppercase text-white/60 mt-[3px]">by Biz Group</div>
          </span>
        </div>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 font-bold text-sm text-white px-5 py-[11px] border-[1.5px] border-white/35 rounded-full whitespace-nowrap transition-colors hover:bg-white/[0.14]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Facilitator log in
        </Link>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] items-center gap-9 lg:gap-14 px-6 md:px-14 pb-10 max-w-7xl mx-auto w-full">
        {/* Left — Hero copy */}
        <div>
          <span className="inline-flex items-center gap-[9px] font-bold text-xs tracking-[0.14em] uppercase text-white mb-5">
            <span className="w-2 h-2 rounded-full bg-[#FFE15A]" style={{ boxShadow: '0 0 0 4px rgba(255,225,90,0.28)' }} />
            Your session is waiting
          </span>
          <h1 className="font-display font-black text-[clamp(34px,7vw,74px)] leading-[0.98] tracking-[-0.035em] text-white mb-5">
            Four characters<br />to lift-off.
          </h1>
          <p className="text-[clamp(17px,1.4vw,19px)] leading-relaxed text-white/85 max-w-[430px]">
            Self-paced prompt building, live with your team, and a personalised prompt pack to take home.
          </p>
        </div>

        {/* Right — Join card */}
        <div className="w-full max-w-[540px] lg:max-w-none">
          <div className="bg-white rounded-[28px] p-8 md:p-10 shadow-[0_20px_48px_rgba(20,21,23,0.14),0_8px_16px_rgba(20,21,23,0.06)]">
            <h2 className="font-display font-extrabold text-2xl tracking-tight text-gray-900 mb-1.5">
              Enter your join code
            </h2>
            <p className="text-[15px] text-gray-500 mb-6">
              It&apos;s on screen or shared by your facilitator.
            </p>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              {/* Segmented code inputs */}
              <div className={`flex gap-[10px] ${status === 'error' ? 'is-error hp-code__cells' : ''}`} data-testid="code-cells">
                {cells.map((cell, i) => (
                  <div key={i} className="relative w-[62px] h-[74px] flex-shrink-0 max-[620px]:flex-1 max-[620px]:min-w-0 max-[620px]:h-[66px]">
                    <input
                      ref={setInputRef(i)}
                      type="text"
                      value={cell}
                      onChange={(e) => handleInput(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onFocus={(e) => e.target.select()}
                      maxLength={4}
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`Join code character ${i + 1}`}
                      disabled={status === 'joining' || status === 'joined'}
                      className={`hp-code__cell ${cell ? 'is-filled' : ''} ${i === firstEmptyIdx && status !== 'error' ? 'is-active' : ''}`}
                      autoFocus={i === 0}
                    />
                    {/* Blinking caret for active empty cell */}
                    {!cell && i === firstEmptyIdx && status !== 'error' && status !== 'joining' && (
                      <span className="hp-caret" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>

              {/* Join button */}
              <button
                type="submit"
                disabled={status === 'joining' || status === 'joined'}
                className={`w-full h-[74px] px-8 rounded-[14px] font-bold text-[17px] text-white inline-flex items-center justify-center gap-[10px] transition-transform duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] disabled:cursor-default disabled:transform-none ${
                  status === 'joined'
                    ? 'bg-[#2E9B55] shadow-[0_12px_32px_rgba(46,155,85,0.30)]'
                    : 'bg-[--biz-purple] shadow-[0_12px_32px_rgba(107,63,160,0.22)] hover:bg-[--biz-purple-ink] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]'
                }`}
              >
                {status === 'joining' ? (
                  <>
                    <span className="hp-spinner" />
                    Joining…
                  </>
                ) : status === 'joined' ? (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    You&apos;re in!
                  </>
                ) : (
                  <>
                    Join workshop
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              {/* Error message */}
              {status === 'error' && errorMsg && (
                <div className="flex items-center gap-[7px] text-[13px] font-semibold text-[#D94545]" role="alert">
                  <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.5" /></svg>
                  {errorMsg}
                </div>
              )}
            </form>

            <p className="text-[13px] text-gray-500 text-center mt-[18px]">
              Codes look like <strong className="text-gray-900">K7RM</strong> — letters and numbers, no spaces.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
