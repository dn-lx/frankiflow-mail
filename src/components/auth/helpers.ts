export function mapAuthError(
  rawCode: string | undefined,
  online: boolean,
  t: (key: string) => string,
): string {
  const code = (rawCode ?? '').trim();
  if (code === 'auth:invalid') return t('auth.error.invalid');
  if (code === 'auth:not-authorized') return t('auth.error.notAuthorized');
  if (code === 'network:offline' || !online) return t('auth.error.offline');
  return t('auth.error.generic');
}
