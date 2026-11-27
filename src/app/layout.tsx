import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/providers/AppProvider';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'FrankiFlow Mail',
  applicationName: 'FrankiFlow Mail',
  description: 'Postfach von FrankiFlow: E-Mails lesen, beantworten und organisieren.',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#14181f' },
  ],
};

// Runs before paint to apply saved theme/density/language (no theme flash).
// Static string; uses backticks only, so no HTML escaping can alter it.
const uiBootScript = `(function(){try{var u=JSON.parse(localStorage.getItem(\`ffmail.ui\`)||\`{}\`)||{},d=document.documentElement;d.setAttribute(\`data-theme\`,[\`light\`,\`dark\`].indexOf(u.theme)+1?u.theme:\`system\`);d.setAttribute(\`data-density\`,u.density===\`compact\`?\`compact\`:\`comfortable\`);if(u.language===\`en\`)d.lang=\`en\`}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" data-theme="system" data-density="comfortable" suppressHydrationWarning>
      <head>
        <script>{uiBootScript}</script>
      </head>
      <body>
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
