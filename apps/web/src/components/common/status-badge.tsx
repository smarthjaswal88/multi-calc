'use client';

/**
 * Draft or finalized.
 *
 * The single most important attribute in the document list, so the two must be distinguishable
 * at a glance: a draft is an outlined ledger-green chip, a finalized document is a solid
 * graphite stamp. Finalized reads as *settled*, never as disabled or broken — the whole point of
 * the state is that the document is complete.
 */

import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'DRAFT' | 'FINALIZED';
  withIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, withIcon = false, className }: StatusBadgeProps) {
  if (status === 'FINALIZED') {
    return (
      <Badge variant="finalized" className={cn('gap-1', className)}>
        {withIcon && <Lock className="size-2.5" />}
        Finalized
      </Badge>
    );
  }

  return (
    <Badge variant="draft" className={className}>
      Draft
    </Badge>
  );
}
