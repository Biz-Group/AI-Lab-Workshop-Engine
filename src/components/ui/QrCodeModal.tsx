'use client';

import { useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Copy, Link as LinkIcon, Check } from 'lucide-react';
import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  joinCode: string;
  joinUrl: string;
}

export function QrCodeModal({ isOpen, onClose, joinCode, joinUrl }: QrCodeModalProps) {
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const getCanvas = useCallback(() => {
    return canvasWrapperRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
  }, []);

  const handleCopyImage = useCallback(async () => {
    const canvas = getCanvas();
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Failed to create image');

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopiedImage(true);
      toast.success('QR code image copied!');
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      toast.error('Failed to copy image. Try downloading instead.');
    }
  }, [getCanvas]);

  const handleDownload = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `join-${joinCode}.png`;
    a.click();
    toast.success('QR code downloaded!');
  }, [getCanvas, joinCode]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      toast.success('Join link copied!');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [joinUrl]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Session QR Code" size="sm">
      <div className="p-6 flex flex-col items-center gap-5">
        {/* QR Code */}
        <div
          ref={canvasWrapperRef}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"
        >
          <QRCodeCanvas
            value={joinUrl}
            size={220}
            level="M"
            marginSize={2}
          />
        </div>

        {/* Join code display */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Join Code</p>
          <p className="text-3xl font-mono font-bold text-brand-600 tracking-wider">
            {joinCode}
          </p>
          <p className="text-xs text-gray-400 mt-1 break-all">{joinUrl}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={handleCopyImage}
            className={cn('w-full justify-center', copiedImage && 'bg-green-600 hover:bg-green-700')}
          >
            {copiedImage ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy QR Image
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleDownload} className="flex-1 justify-center">
              <Download className="w-4 h-4 mr-2" />
              Download PNG
            </Button>
            <Button
              variant="secondary"
              onClick={handleCopyLink}
              className={cn('flex-1 justify-center', copiedLink && 'text-green-600')}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
