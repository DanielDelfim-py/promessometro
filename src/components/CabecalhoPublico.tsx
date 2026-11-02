import Link from 'next/link';
import { NOME_PLATAFORMA } from '@/lib/site';

export function CabecalhoPublico({ ativo }: { ativo: 'atos' | 'como-trabalhamos' }) {
  return (
    <header className="topo">
      <div className="topo-interno">
        <Link href="/" className="marca">{NOME_PLATAFORMA}</Link>
        <nav aria-label="Principal">
          <Link href="/atos" {...(ativo === 'atos' ? { 'aria-current': 'page' as const, className: 'ativo' } : {})}>Atos oficiais</Link>
          <Link href="/como-trabalhamos" {...(ativo === 'como-trabalhamos' ? { 'aria-current': 'page' as const, className: 'ativo' } : {})}>Como trabalhamos</Link>
        </nav>
      </div>
    </header>
  );
}
