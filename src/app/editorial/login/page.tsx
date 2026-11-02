import { entrar } from './actions';

export const dynamic = 'force-dynamic';

const MENSAGENS: Record<string, string> = {
  credenciais: 'E-mail ou senha incorretos.',
  'sem-permissao': 'Esta conta não tem acesso à área editorial.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="editorial-login">
      <h1>Área editorial</h1>
      {erro && <p role="alert" className="erro">{MENSAGENS[erro] ?? 'Não foi possível entrar.'}</p>}
      <form action={entrar}>
        <label>E-mail <input name="email" type="email" required autoComplete="username" /></label>
        <label>Senha <input name="senha" type="password" required autoComplete="current-password" /></label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
