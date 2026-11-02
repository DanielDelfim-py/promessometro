import type { Metadata } from 'next';
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--fonte-sans' });
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['600', '700'], variable: '--fonte-serif' });

export const metadata: Metadata = {
  title: 'Atos oficiais',
  description: 'O que saiu no Diário Oficial da União, explicado em linguagem simples e com link para o texto original.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
