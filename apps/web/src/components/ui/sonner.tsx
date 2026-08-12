'use client';

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

export const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <SonnerToaster
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast flex items-start gap-2.5 rounded-md border border-border bg-card p-3 text-[0.8125rem] text-foreground shadow-md',
          title: 'font-medium',
          description: 'text-muted-foreground',
          actionButton:
            'rounded-sm bg-primary px-2 py-1 text-[0.8125rem] font-medium text-primary-foreground hover:bg-primary/90',
          cancelButton:
            'rounded-sm bg-muted px-2 py-1 text-[0.8125rem] font-medium text-muted-foreground hover:bg-accent',
          error: 'text-destructive',
        },
      }}
      {...props}
    />
  );
};
