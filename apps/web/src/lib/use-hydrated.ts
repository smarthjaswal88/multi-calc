'use client';

import * as React from 'react';

const noopSubscribe = () => () => {};

export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
