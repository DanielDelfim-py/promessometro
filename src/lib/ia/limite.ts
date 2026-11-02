export function limiteIa(valor: string | undefined): number {
  const n = valor === undefined || valor.trim() === '' ? NaN : Number(valor);
  if (!Number.isFinite(n)) return 40;
  return Math.min(200, Math.max(0, Math.trunc(n)));
}
