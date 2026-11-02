const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** dd/mm/aaaa no fuso de Sao Paulo a partir de um timestamp ISO; '' se invalido. */
export function dataBrasil(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : FORMATO.format(d);
}
