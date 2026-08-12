'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/lib/use-hydrated';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

/**
 * Light / dark / system.
 *
 * Renders a placeholder until mounted: the resolved theme is unknown during server rendering,
 * and marking the wrong segment active for one frame is a visible flicker.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Not useState+useEffect: see useHydrated. The resolved theme is unknown while the server
  // renders, and marking the wrong segment active for one frame is a visible flicker.
  const mounted = useHydrated();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      // The caller may stack the segments — a collapsed sidebar has no room for three across.
      className={cn(
        // gap matches the inset padding, so the active segment sits in an even 2px well however
        // the group is oriented — the same treatment as the discount control's ToggleGroup.
        "inline-flex w-full gap-0.5 rounded-md border border-sidebar-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-7 flex-1 items-center justify-center rounded-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
