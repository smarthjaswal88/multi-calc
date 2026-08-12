'use client';

/**
 * An empty screen is an invitation to act, not a shrug.
 *
 * One line of direction and one primary action. Used in five places — the document list with
 * nothing on it, a filtered list with no matches, a document with no lines, a report range with
 * no documents, and a failed load — so the copy is always passed in rather than generalised into
 * something vague enough to fit everywhere.
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  Icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[0.8125rem] text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
