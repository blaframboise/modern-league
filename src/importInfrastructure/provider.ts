import type { ExtractionReport } from '../extraction/index.ts';
/** Server-only adapter interface v1. No production provider is selected. */
export interface ServerExtractionAdapterV1 {
  readonly interfaceVersion: 1;
  readonly providerVersion: string;
  extract(input: { sources: readonly { id: string; sha256: string; mime: string; bytes: Uint8Array }[]; signal: AbortSignal }): Promise<ExtractionReport>;
}
export function configuredExtractionAdapter(): ServerExtractionAdapterV1 {
  throw new Error('EXTRACTION_NOT_CONFIGURED: no image interpretation is available.');
}
