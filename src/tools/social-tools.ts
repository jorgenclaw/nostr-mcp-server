import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey, normalizePubkey, resolveSigningPubkey } from '../utils/keys.js';
import { isBunkerMode, signEventWithBunker } from '../signer/nip46-signer.js';
import { publishEvent, queryEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS, KINDS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const followSchema = z.object({
  pubkeyToFollow: z.string().describe('Pubkey (hex or npub) to follow'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const unfollowSchema = followSchema.extend({
  pubkeyToFollow: z.string().describe('Pubkey (hex or npub) to unfollow'),
});

export const reactToEventSchema = z.object({
  eventId: z.string().describe('ID of the event to react to'),
  eventPubkey: z.string().describe('Pubkey of the event author'),
  reaction: z.string().optional().default('+').describe('Reaction content (default: "+")'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const repostEventSchema = z.object({
  eventId: z.string().describe('ID of the event to repost'),
  eventPubkey: z.string().describe('Pubkey of the event author'),
  relayUrl: z.string().optional().describe('Relay URL where the original event lives'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const deleteEventSchema = z.object({
  eventIds: z.array(z.string()).describe('IDs of events to delete'),
  reason: z.string().optional().describe('Reason for deletion'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const replyToEventSchema = z.object({
  eventId: z.string().describe('ID of the event to reply to'),
  eventPubkey: z.string().describe('Pubkey of the event author'),
  content: z.string().describe('Reply content'),
  rootEventId: z.string().optional().describe('Root event ID for threading (NIP-10)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

async function signTemplate(template: EventTemplate, privateKey?: string): Promise<VerifiedEvent> {
  if (isBunkerMode()) {
    return signEventWithBunker(template);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  return finalizeEvent(template, normalizePrivateKey(privateKey));
}

export async function follow({ pubkeyToFollow, privateKey, relays }: z.infer<typeof followSchema>) {
  const targetPubkey = normalizePubkey(pubkeyToFollow);
  const myPubkey = resolveSigningPubkey(privateKey);

  // Fetch current contact list
  const existing = await queryEvent(
    { kinds: [KINDS.CONTACT_LIST], authors: [myPubkey], limit: 1 },
    relays ?? DEFAULT_RELAYS,
  );

  let tags: string[][] = existing?.tags.filter(t => t[0] === 'p') ?? [];
  if (tags.some(t => t[1] === targetPubkey)) {
    return { message: 'Already following this pubkey', pubkey: targetPubkey };
  }
  tags.push(['p', targetPubkey]);

  const template: EventTemplate = {
    kind: KINDS.CONTACT_LIST,
    content: existing?.content ?? '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function unfollow({ pubkeyToFollow: pubkeyToUnfollow, privateKey, relays }: z.infer<typeof unfollowSchema>) {
  const targetPubkey = normalizePubkey(pubkeyToUnfollow);
  const myPubkey = resolveSigningPubkey(privateKey);

  const existing = await queryEvent(
    { kinds: [KINDS.CONTACT_LIST], authors: [myPubkey], limit: 1 },
    relays ?? DEFAULT_RELAYS,
  );

  if (!existing) throw new Error('No contact list found');
  const tags = existing.tags.filter(t => !(t[0] === 'p' && t[1] === targetPubkey));

  const template: EventTemplate = {
    kind: KINDS.CONTACT_LIST,
    content: existing.content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function reactToEvent({ eventId, eventPubkey, reaction, privateKey, relays }: z.infer<typeof reactToEventSchema>) {
  const template: EventTemplate = {
    kind: KINDS.REACTION,
    content: reaction ?? '+',
    tags: [
      ['e', eventId],
      ['p', normalizePubkey(eventPubkey)],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function repostEvent({ eventId, eventPubkey, relayUrl, privateKey, relays }: z.infer<typeof repostEventSchema>) {
  const eTag = relayUrl ? ['e', eventId, relayUrl] : ['e', eventId];
  const template: EventTemplate = {
    kind: KINDS.REPOST,
    content: '',
    tags: [eTag, ['p', normalizePubkey(eventPubkey)]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function deleteEvent({ eventIds, reason, privateKey, relays }: z.infer<typeof deleteEventSchema>) {
  const tags: string[][] = eventIds.map(id => ['e', id]);
  const template: EventTemplate = {
    kind: KINDS.DELETE,
    content: reason ?? '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function replyToEvent({ eventId, eventPubkey, content, rootEventId, privateKey, relays }: z.infer<typeof replyToEventSchema>) {
  const tags: string[][] = [['p', normalizePubkey(eventPubkey)]];

  if (rootEventId && rootEventId !== eventId) {
    // Threaded reply: root + reply markers (NIP-10)
    tags.push(['e', rootEventId, '', 'root']);
    tags.push(['e', eventId, '', 'reply']);
  } else {
    // Direct reply
    tags.push(['e', eventId, '', 'root']);
  }

  const template: EventTemplate = {
    kind: KINDS.TEXT,
    content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signTemplate(template, privateKey);
  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}
