interface Campos {
  titulo: string;
  resumo: string;
  temaId: string;
}

export function decidir(
  form: Campos,
  sugerido: { titulo: string; resumo: string; temaId: string | null } | null,
): 'aprovou' | 'ajustou' {
  if (!sugerido) return 'ajustou';
  const igual =
    form.titulo.trim() === sugerido.titulo.trim() &&
    form.resumo.trim() === sugerido.resumo.trim() &&
    form.temaId === sugerido.temaId;
  return igual ? 'aprovou' : 'ajustou';
}
