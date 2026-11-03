import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Os testes SQL sobem Postgres em WebAssembly; numa maquina carregada (CI) o padrao de 5 s estoura.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Monta uma vez as bases-modelo do PGlite (stubs + migracoes) para os bancos de teste nascerem rapido.
    // Muitos workers disputando CPU/memoria com bancos PGlite deixam tudo mais lento (medido: 12 -> 58 s, 6 -> 29 s).
    maxWorkers: 6,
    globalSetup: ['tests/sql/global-setup.ts'],
  },
});
