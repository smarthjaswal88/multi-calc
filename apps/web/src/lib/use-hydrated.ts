'use client';

import * as React from 'react';

/** No external source to subscribe to — hydration happens exactly once. */
const noopSubscribe = () => () => {};

/**
 * True once the client has hydrated, false during server rendering and the first client render.
 *
 * Several controls cannot render their real state until the browser is available: the theme toggle
 * does not know the resolved theme, and the sidebar does not know the stored collapse preference.
 * Marking the wrong option active for one frame is a visible flicker.
 *
 * The obvious implementation — `useState(false)` plus `useEffect(() => setMounted(true))` — is what
 * `react-hooks/set-state-in-effect` rejects, and rightly: it schedules a second render pass to
 * communicate something React already knows.
 *
 * `useSyncExternalStore` expresses it directly instead. The server snapshot is `false` and the
 * client snapshot is `true`, so the value is correct on both sides without a state update, and
 * hydration stays consistent because the first client render still reports the server's answer.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
