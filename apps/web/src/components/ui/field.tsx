'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label, labelClassName } from '@/components/ui/label';

export type FieldProps = React.HTMLAttributes<HTMLDivElement>;

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-1.5', className)} {...props} />
  ),
);
Field.displayName = 'Field';

export type FieldLabelProps = React.ComponentPropsWithoutRef<typeof Label>;

export const FieldLabel = React.forwardRef<
  React.ComponentRef<typeof Label>,
  FieldLabelProps
>(({ className, ...props }, ref) => (
  <Label ref={ref} className={cn(labelClassName, className)} {...props} />
));
FieldLabel.displayName = 'FieldLabel';

function isEmpty(children: React.ReactNode): boolean {
  return React.Children.toArray(children).every(
    (child) => typeof child === 'string' && child.trim() === '',
  );
}

export type FieldErrorProps = React.HTMLAttributes<HTMLParagraphElement>;

export const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, children, ...props }, ref) => {
    if (isEmpty(children)) return null;
    return (
      <p
        ref={ref}
        role="alert"
        className={cn('text-[0.8125rem] text-destructive', className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);
FieldError.displayName = 'FieldError';

export type FieldHintProps = React.HTMLAttributes<HTMLParagraphElement>;

export const FieldHint = React.forwardRef<HTMLParagraphElement, FieldHintProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-[0.8125rem] text-muted-foreground', className)}
      {...props}
    />
  ),
);
FieldHint.displayName = 'FieldHint';
