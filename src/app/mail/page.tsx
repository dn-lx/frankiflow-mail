'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ComposerProvider } from '@/components/composer';
import { AppShell, ShellSkeleton, parseView, viewHref, type ViewPatch } from '@/components/shell';

function MailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const view = useMemo(() => parseView(new URLSearchParams(qs)), [qs]);

  const hrefFor = useCallback((patch: ViewPatch) => viewHref(new URLSearchParams(qs), view, patch), [qs, view]);

  const navigate = useCallback(
    (patch: ViewPatch, opts?: { replace?: boolean }) => {
      const href = hrefFor(patch);
      if (opts?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [hrefFor, router],
  );

  return (
    <ComposerProvider>
      <AppShell view={view} navigate={navigate} hrefFor={hrefFor} />
    </ComposerProvider>
  );
}

export default function MailPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <MailPageInner />
    </Suspense>
  );
}
