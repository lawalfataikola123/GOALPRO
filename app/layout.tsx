import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GOALPRO | Football Goals Intelligence',
  description: 'Football goals analysis for BTTS, Over/Under, and first-half and second-half markets.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
