import { describe, expect, it } from 'vitest';
import { diasDaJanela } from '@/lib/coleta/janela';

describe('diasDaJanela', () => {
  it('inclui hoje e os dias anteriores', () => {
    const hoje = new Date('2026-10-30T15:00:00Z');
    expect(diasDaJanela(hoje, 2)).toEqual(['20261030', '20261029', '20261028']);
  });

  it('usa o fuso de Sao Paulo (02:00 UTC ainda e o dia anterior)', () => {
    const hoje = new Date('2026-10-30T02:00:00Z');
    expect(diasDaJanela(hoje, 0)).toEqual(['20261029']);
  });

  it('atravessa a virada de mes', () => {
    const hoje = new Date('2026-11-01T15:00:00Z');
    expect(diasDaJanela(hoje, 2)).toEqual(['20261101', '20261031', '20261030']);
  });
});
