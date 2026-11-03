import { MIGRACOES, prepararBase } from './banco';

/** Monta uma vez, antes dos testes, as bases-modelo (evita que varios workers facam o mesmo initdb ao mesmo tempo). */
export default async function setup(): Promise<void> {
  await prepararBase(MIGRACOES);
  await prepararBase(['0001_schema.sql', '0002_correcoes.sql']);
}
