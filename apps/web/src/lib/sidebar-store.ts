'use client';

import * as React from 'react';

const COLLAPSED_KEY = 'multicalc:sidebar-collapsed';

/**
 * The sidebar's collapse preference, read from localStorage through useSyncExternalStore.
 *
 * localStorage genuinely IS an external system, so this is the case the hook exists for — as
 * opposed to reading it in an effect and calling setState, which `react-hooks/set-state-in-effect`
 * rejects for scheduling an extra render to report something already knowable.
 *
 * A `storage` event alone is not enough: the browser does not fire it in the tab that performed the
 * write, so a local toggle would update localStorage and nothing would re-render. Hence the
 * listener set — writes notify this tab, and the `storage` event covers the others.
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    // Private browsing and some embedded webviews throw on access rather than returning null.
    return false;
  }
}

/** The server cannot know the preference, so it renders expanded and hydration agrees. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = React.useCallback(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(!getSnapshot()));
    } catch {
      // Preference is not persistable in this context; the toggle still has no effect rather than
      // throwing mid-render.
    }
    notify();
  }, []);

  return [collapsed, toggle];
}
