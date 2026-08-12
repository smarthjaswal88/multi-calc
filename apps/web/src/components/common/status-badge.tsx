'use client';

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
