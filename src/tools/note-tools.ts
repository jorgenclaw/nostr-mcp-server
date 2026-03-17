import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey, resolveSigningPubkey } from '../utils/keys.js';
import { isBunkerMode, signEventWithBunker, getBunkerPubkey } from '../signer/nip46-signer.js';
import { publishEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS, KINDS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const createNoteSchema = z.object({
  content: z.string().describe('Text content of the note'),
  tags: z.array(z.array(z.string())).optional().describe('Event tags'),
});

export const signNoteSchema = z.object({
  unsignedEvent: z.object({
    kind: z.number(),
    content: z.string(),
    tags: z.array(z.array(z.string())),
    created_at: z.number(),
    pubkey: z.string(),
  }).describe('The unsigned event to sign'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const postNoteSchema = z.object({
  content: z.string().describe('Text content of the note'),
  tags: z.array(z.array(z.string())).optional().describe('Event tags'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const publishNoteSchema = z.object({
  signedEvent: z.object({
    id: z.string(),
    kind: z.number(),
    content: z.string(),
    tags: z.array(z.array(z.string())),
    created_at: z.number(),
    pubkey: z.string(),
    sig: z.string(),
  }).describe('The signed event to publish'),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export function createNote({ content, tags }: z.infer<typeof createNoteSchema>) {
  const template: EventTemplate = {
    kind: KINDS.TEXT,
    content,
    tags: tags ?? [],
    created_at: Math.floor(Date.now() / 1000),
  };
  return template;
}

export async function signNote({ unsignedEvent, privateKey }: z.infer<typeof signNoteSchema>): Promise<VerifiedEvent> {
  if (isBunkerMode()) {
    const template: EventTemplate = {
      kind: unsignedEvent.kind,
      content: unsignedEvent.content,
      tags: unsignedEvent.tags,
      created_at: unsignedEvent.created_at,
    };
    return signEventWithBunker(template);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  return finalizeEvent({
    kind: unsignedEvent.kind,
    content: unsignedEvent.content,
    tags: unsignedEvent.tags,
    created_at: unsignedEvent.created_at,
  }, sk);
}

export async function postNote({ content, tags, privateKey, relays }: z.infer<typeof postNoteSchema>) {
  const template: EventTemplate = {
    kind: KINDS.TEXT,
    content,
    tags: tags ?? [],
    created_at: Math.floor(Date.now() / 1000),
  };

  let signed: VerifiedEvent;
  if (isBunkerMode()) {
    signed = await signEventWithBunker(template);
  } else {
    if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
    const sk = normalizePrivateKey(privateKey);
    signed = finalizeEvent(template, sk);
  }

  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function publishNote({ signedEvent, relays }: z.infer<typeof publishNoteSchema>) {
  return publishEvent(signedEvent as any, relays ?? DEFAULT_RELAYS);
}
