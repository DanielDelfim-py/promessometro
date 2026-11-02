import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { baixarZip, lerEntradas } from '@/lib/dou/zip';

function zipDeTeste(): Buffer {
  const z = new AdmZip();
  z.addFile('20261028/DO1/515_20261028_1.xml', Buffer.from('<xml>28</xml>'));
  z.addFile('20261029/DO1/515_20261029_2.xml', Buffer.from('<xml>29a</xml>'));
  z.addFile('20261029/DO1E/515_20261029_3.xml', Buffer.from('<xml>29e</xml>'));
  z.addFile('20261029/DO1/leiame.txt', Buffer.from('ignorar'));
  return z.toBuffer();
}

describe('lerEntradas', () => {
  it('le so os dias pedidos e so XML', () => {
    const e = lerEntradas(zipDeTeste(), new Set(['20261029']));
    expect(e.map((x) => [x.dia, x.secao, x.conteudo])).toEqual([
      ['20261029', 'DO1', '<xml>29a</xml>'],
      ['20261029', 'DO1E', '<xml>29e</xml>'],
    ]);
  });

  it('devolve vazio quando o dia nao existe', () => {
    expect(lerEntradas(zipDeTeste(), new Set(['20250101']))).toEqual([]);
  });
});

describe('baixarZip', () => {
  it('devolve o corpo como Buffer', async () => {
    const fake = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch;
    const b = await baixarZip('https://x/y.zip', fake);
    expect([...b]).toEqual([1, 2, 3]);
  });

  it('falha com status diferente de 200', async () => {
    const fake = (async () => new Response('no', { status: 403 })) as typeof fetch;
    await expect(baixarZip('https://x/y.zip', fake)).rejects.toThrow(/403/);
  });
});
