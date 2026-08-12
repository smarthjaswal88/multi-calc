'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/common/app-shell';
import { useMe } from '@/lib/hooks';

/**
 * The authenticated area.
 *
 * The session lives in an httpOnly cookie, so the client cannot read it directly — it asks the
 * server who it is and redirects if the answer is nobody. Rendering nothing during that check
 * avoids a flash of the shell for a signed-out visitor.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  const router = useRouter();
  const { data: user, isLoading } = useMe();

  useEffect(() => {
    if (!isLoading && user === null) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || user === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
