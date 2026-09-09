'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Fullscreen for the projected gallery wall.
 *
 * State is derived ONLY from `document.fullscreenElement` inside the
 * fullscreenchange events -- never from a boolean we set ourselves. Esc, F11
 * and the browser's own UI all exit fullscreen without calling our handler, so
 * a self-managed flag goes stale and the button starts lying.
 */

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function currentFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface UseFullscreenResult {
  isFullscreen: boolean;
  /** False where element fullscreen is unavailable (notably iOS Safari). */
  isSupported: boolean;
  toggle: () => void;
}

export function useFullscreen(targetRef: RefObject<HTMLElement | null>): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const element = targetRef.current as FullscreenElement | null;
    setIsSupported(
      Boolean(element?.requestFullscreen || element?.webkitRequestFullscreen)
    );
  }, [targetRef]);

  useEffect(() => {
    const sync = () => setIsFullscreen(currentFullscreenElement() !== null);

    sync();
    document.addEventListener('fullscreenchange', sync);
    // Safari <= 16.3 only fires the prefixed event.
    document.addEventListener('webkitfullscreenchange', sync);

    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as FullscreenDocument;

    if (currentFullscreenElement()) {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      // Always catch: the promise rejects if the document is no longer active,
      // and an unhandled rejection mid-presentation is noise we cannot see.
      void Promise.resolve(exit?.call(doc)).catch(() => {});
      return;
    }

    const element = targetRef.current as FullscreenElement | null;
    if (!element) return;

    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!request) return;

    void Promise.resolve(request.call(element)).catch(() => {});
  }, [targetRef]);

  return { isFullscreen, isSupported, toggle };
}
