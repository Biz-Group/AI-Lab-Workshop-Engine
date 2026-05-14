'use client';

import * as React from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';
import toast from 'react-hot-toast';

interface CopyButtonProps {
  text: string;
  className?: string;
  onCopy?: () => void;
}

export function CopyButton({ text, className, onCopy }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      toast.success('Copied to clipboard!');
      onCopy?.();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error('Failed to copy');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
        'bg-gray-100 text-gray-700 hover:bg-gray-200',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        copied && 'bg-green-100 text-green-700 copy-success',
        className
      )}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          Copy
        </>
      )}
    </button>
  );
}

interface PromptBlockProps {
  title: string;
  content: string;
  isCopyable?: boolean;
  className?: string;
  onCopy?: () => void;
}

export function PromptBlock({ 
  title, 
  content, 
  isCopyable = true, 
  className,
  onCopy 
}: PromptBlockProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <div className={cn('rounded-lg border border-gray-200 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setIsExpanded(e => !e)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
          {title}
        </button>
        {isCopyable && <CopyButton text={content} onCopy={onCopy} />}
      </div>
      {isExpanded && (
        <div className="p-4 bg-white">
          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
