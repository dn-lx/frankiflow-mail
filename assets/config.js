const hostname = globalThis.location?.hostname || '';
const isDevelopment = hostname === 'mail-frankiflow.shipstatic.com' || hostname === 'localhost' || hostname === '127.0.0.1';

export const CONFIG = {
  appName: 'FrankiFlow Mail',
  mailbox: 'info@frankiflow.de',
  supabaseUrl: 'https://bdeajozhylypiidrldka.supabase.co',
  supabasePublishableKey: 'sb_publishable_FX7QKUBZQmwykGcgv8SdfQ_lGRZF8n2',
  sendFunctionUrl: 'https://bdeajozhylypiidrldka.supabase.co/functions/v1/send-mail',
  mode: isDevelopment ? 'develop' : 'production'
};
