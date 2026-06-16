'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    
    return (
      <div className={cn('flex items-start gap-3', className)}>
        <div className="relative flex items-center justify-center">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            className="peer sr-only"
            {...props}
          />
          <div className={cn(
            'w-5 h-5 border-2 rounded transition-colors',
            'bg-white border-gray-300',
            'peer-checked:bg-brand-600 peer-checked:border-brand-600',
            'peer-focus:ring-2 peer-focus:ring-brand-500 peer-focus:ring-offset-2',
            'peer-disabled:opacity-50 peer-disabled:cursor-not-allowed'
          )} />
          <Check className="absolute w-5 h-5 text-white p-0.5 opacity-0 peer-checked:opacity-100 pointer-events-none" />
        </div>
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <label 
                htmlFor={inputId} 
                className="text-sm font-medium text-gray-900 cursor-pointer"
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
