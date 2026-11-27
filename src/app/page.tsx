'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/providers/AppProvider';
import { Spinner } from '@/components/ui/Spinner';

export default function HomePage() {
  const { session, t } = useApp();
  const router = useRouter();

  useEffect(() => {
    router.replace(session ? '/mail/' : '/login/');
  }, [session, router]);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }} aria-busy="true">
      <Spinner size="lg" label={t('common.loading')} />
    </main>
  );
}
