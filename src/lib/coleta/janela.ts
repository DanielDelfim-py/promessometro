const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

export function diasDaJanela(hoje: Date, retroativos: number): string[] {
  const dias: string[] = [];
  for (let i = 0; i <= retroativos; i++) {
    const d = new Date(hoje.getTime() - i * 86_400_000);
    dias.push(formato.format(d).replaceAll('-', ''));
  }
  return dias;
}
