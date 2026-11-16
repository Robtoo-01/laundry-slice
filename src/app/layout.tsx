import type { Metadata } from 'next';
import { BRAND } from '@/core/config';
import { AuthProvider } from './AuthProvider';
import { SiteHeader } from './SiteHeader';
import '@fontsource-variable/archivo';
import './globals.css';

export const metadata: Metadata = { title: `${BRAND}: laundry pickup and delivery` };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE">
      <body>
        <AuthProvider>
          <SiteHeader />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
