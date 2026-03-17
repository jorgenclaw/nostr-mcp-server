import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey, resolveSigningPubkey } from '../utils/keys.js';
import { isBunkerMode, signEventWithBunker, getBunkerPubkey } from '../signer/nip46-signer.js';
import { publishEvent, queryEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS, KINDS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const createProfileSchema = z.object({
  name: z.string().optional().describe('Display name'),
  about: z.string().optional().describe('Bio / about text'),
  picture: z.string().optional().describe('Profile picture URL'),
  nip05: z.string().optional().describe('NIP-05 identifier'),
  lud16: z.string().optional().describe('Lightning address'),
  banner: z.string().optional().describe('Banner image URL'),
  website: z.string().optional().describe('Website URL'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const updateProfileSchema = createProfileSchema;

async function buildAndPublishProfile(
  fields: Record<string, string | undefined>,
  privateKey: string | undefined,
  relays: string[] | undefined,
): Promise<{ event: VerifiedEvent; published: { successes: string[]; failures: string[] } }> {
  const content: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) content[k] = v;
  }

  const template: EventTemplate = {
    kind: KINDS.METADATA,
    content: JSON.stringify(content),
    tags: [],
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

export async function createProfile(params: z.infer<typeof createProfileSchema>) {
  const { privateKey, relays, ...fields } = params;
  return buildAndPublishProfile(fields, privateKey, relays);
}

export async function updateProfile(params: z.infer<typeof updateProfileSchema>) {
  const { privateKey, relays, ...newFields } = params;

  // Fetch existing profile to merge
  const pubkey = resolveSigningPubkey(privateKey);
  const existing = await queryEvent(
    { kinds: [KINDS.METADATA], authors: [pubkey], limit: 1 },
    relays ?? DEFAULT_RELAYS,
  );

  let mergedFields: Record<string, string | undefined> = {};
  if (existing) {
    try {
      mergedFields = JSON.parse(existing.content);
    } catch {}
  }

  for (const [k, v] of Object.entries(newFields)) {
    if (v !== undefined) mergedFields[k] = v;
  }

  return buildAndPublishProfile(mergedFields, privateKey, relays);
}
