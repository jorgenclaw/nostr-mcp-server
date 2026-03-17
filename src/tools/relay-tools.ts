import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey } from '../utils/keys.js';
import { isBunkerMode, signEventWithBunker } from '../signer/nip46-signer.js';
import { publishEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS, KINDS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const setRelayListSchema = z.object({
  readRelays: z.array(z.string()).optional().describe('Relays for reading'),
  writeRelays: z.array(z.string()).optional().describe('Relays for writing'),
  readWriteRelays: z.array(z.string()).optional().describe('Relays for both read and write'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish the list to'),
});

export async function setRelayList({ readRelays, writeRelays, readWriteRelays, privateKey, relays }: z.infer<typeof setRelayListSchema>) {
  const tags: string[][] = [];

  for (const r of readWriteRelays ?? []) {
    tags.push(['r', r]);
  }
  for (const r of readRelays ?? []) {
    tags.push(['r', r, 'read']);
  }
  for (const r of writeRelays ?? []) {
    tags.push(['r', r, 'write']);
  }

  const template: EventTemplate = {
    kind: KINDS.RELAY_LIST,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  let signed: VerifiedEvent;
  if (isBunkerMode()) {
    signed = await signEventWithBunker(template);
  } else {
    if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
    signed = finalizeEvent(template, normalizePrivateKey(privateKey));
  }

  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}
