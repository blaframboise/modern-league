import { MAX_IMAGE_BYTES, validateImageFiles } from '../extraction/index.ts';
import type { ImportValues } from '../results/index.ts';

export const SOURCE_BUCKET = 'tournament-sources';
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid request identifier.');
  return value.toLowerCase();
}
/** Trusted boundary must invoke this on bounded bytes; browser checks are advisory. */
export function validateImageBytes(bytes: Uint8Array, mime: string): void {
  validateImageFiles([{ name: 'Source image', type: mime, size: bytes.length }]);
  const match = (offset: number, expected: number[]) => expected.every((v, i) => bytes[offset + i] === v);
  const valid = mime === 'image/png' ? match(0, [137,80,78,71,13,10,26,10])
    : mime === 'image/jpeg' ? match(0, [255,216,255]) && match(bytes.length - 2, [255,217])
    : mime === 'image/webp' && match(0, [82,73,70,70]) && match(8, [87,69,66,80]) && bytes.length >= 16 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 === bytes.length;
  if (!valid) throw new Error('Image signature does not match the declared MIME type.');
}
export async function boundedBody(request: Request, limit = MAX_IMAGE_BYTES): Promise<Uint8Array> {
  if (!request.body) throw new Error('Empty request.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; length += item.value.length;
      if (length > limit) { await reader.cancel(); throw new Error('Request exceeds size limit.'); } chunks.push(item.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
/** No tournament information or identities inferred from the upload. */
export function unresolvedOriginal(): ImportValues {
  return { tournament: { eventId: '', sourceKey: '', name: '', date: '', start: null, year: 0, kind: '' as ImportValues['tournament']['kind'], scheduledRounds: null }, results: [] };
}
