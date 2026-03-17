import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey } from '../utils/keys.js';
import { isBunkerMode, signEventWithBunker } from '../signer/nip46-signer.js';
import { publishEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const createNostrEventSchema = z.object({
  kind: z.number().describe('Event kind number'),
  content: z.string().describe('Event content'),
  tags: z.array(z.array(z.string())).optional().describe('Event tags'),
});

export const signNostrEventSchema = z.object({
  unsignedEvent: z.object({
    kind: z.number(),
    content: z.string(),
    tags: z.array(z.array(z.string())),
    created_at: z.number(),
  }).describe('Unsigned event template'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const publishNostrEventSchema = z.object({
  signedEvent: z.object({
    id: z.string(),
    kind: z.number(),
    content: z.string(),
    tags: z.array(z.array(z.string())),
    created_at: z.number(),
    pubkey: z.string(),
    sig: z.string(),
  }).describe('Signed event to publish'),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export function createNostrEvent({ kind, content, tags }: z.infer<typeof createNostrEventSchema>): EventTemplate {
  return {
    kind,
    content,
    tags: tags ?? [],
    created_at: Math.floor(Date.now() / 1000),
  };
}

export async function signNostrEvent({ unsignedEvent, privateKey }: z.infer<typeof signNostrEventSchema>): Promise<VerifiedEvent> {
  const template: EventTemplate = {
    kind: unsignedEvent.kind,
    content: unsignedEvent.content,
    tags: unsignedEvent.tags,
    created_at: unsignedEvent.created_at,
  };

  if (isBunkerMode()) {
    return signEventWithBunker(template);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  return finalizeEvent(template, sk);
}

export async function publishNostrEvent({ signedEvent, relays }: z.infer<typeof publishNostrEventSchema>) {
  return publishEvent(signedEvent as any, relays ?? DEFAULT_RELAYS);
}
