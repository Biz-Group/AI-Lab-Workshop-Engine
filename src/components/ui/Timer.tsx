'use client';

import * as React from 'react';
import { cn, getTimeRemaining } from '@/lib/utils';

interface TimerProps {
  endAt: string | Date | null;
  className?: string;
  onExpire?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Timer({ endAt, className, onExpire, size = 'md' }: TimerProps) {
  const [time, setTime] = React.useState({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
  const hasExpiredRef = React.useRef(false);

  // Reset expiration tracking when endAt changes
  React.useEffect(() => {
    hasExpiredRef.current = false;
  }, [endAt]);

  // Store onExpire in a ref to avoid re-creating the interval
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  React.useEffect(() => {
    if (!endAt) return;

    const updateTimer = () => {
      const remaining = getTimeRemaining(endAt);
      setTime(remaining);
      
      if (remaining.isExpired && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endAt]);

  if (!endAt || time.isExpired) {
    return null;
  }

  const sizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl',
  };

  const isLowTime = time.hours === 0 && time.minutes === 0 && time.seconds <= 30;
  const isWarningTime = time.hours === 0 && time.minutes <= 1 && !isLowTime;
  const isCriticalTime = time.hours === 0 && time.minutes === 0 && time.seconds <= 15;

  return (
    <div
      className={cn(
        'font-mono font-bold tabular-nums',
        sizes[size],
        isCriticalTime
          ? 'text-red-600 animate-[pulse_2s_ease-in-out_infinite]'
          : isLowTime
            ? 'text-amber-600'
            : isWarningTime
              ? 'text-amber-600'
              : 'text-gray-700',
        className
      )}
      aria-live={isLowTime ? 'assertive' : 'polite'}
      role="timer"
    >
      {time.hours > 0 && `${String(time.hours).padStart(2, '0')}:`}
      {String(time.minutes).padStart(2, '0')}:{String(time.seconds).padStart(2, '0')}
    </div>
  );
}

interface CountdownProps {
  minutes: number;
  onComplete?: () => void;
  autoStart?: boolean;
  className?: string;
}

export function Countdown({ minutes, onComplete, autoStart = false, className }: CountdownProps) {
  const [endTime, setEndTime] = React.useState<Date | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);

  const start = React.useCallback(() => {
    const end = new Date(Date.now() + minutes * 60 * 1000);
    setEndTime(end);
    setIsRunning(true);
  }, [minutes]);

  const stop = React.useCallback(() => {
    setEndTime(null);
    setIsRunning(false);
  }, []);

  React.useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  const handleExpire = React.useCallback(() => {
    setIsRunning(false);
    onComplete?.();
  }, [onComplete]);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Timer endAt={endTime} onExpire={handleExpire} size="lg" />
      {!isRunning && (
        <button
          onClick={start}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          Start Timer ({minutes} min)
        </button>
      )}
      {isRunning && (
        <button
          onClick={stop}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Stop
        </button>
      )}
    </div>
  );
}
