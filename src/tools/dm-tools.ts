import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';
import * as nip04 from 'nostr-tools/nip04';
import * as nip44 from 'nostr-tools/nip44';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { normalizePrivateKey, normalizePubkey, resolveSigningPubkey, bytesToHex } from '../utils/keys.js';
import {
  isBunkerMode,
  signEventWithBunker,
  nip04EncryptWithBunker,
  nip04DecryptWithBunker,
  nip44EncryptWithBunker,
  nip44DecryptWithBunker,
} from '../signer/nip46-signer.js';
import { publishEvent } from '../utils/pool.js';
import { DEFAULT_RELAYS, KINDS } from '../utils/constants.js';

const privateKeyDesc = 'Private key (nsec or hex). Optional when NOSTR_BUNKER_URI is configured.';

export const encryptNip04Schema = z.object({
  plaintext: z.string().describe('Text to encrypt'),
  recipientPubkey: z.string().describe('Recipient pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const decryptNip04Schema = z.object({
  ciphertext: z.string().describe('NIP-04 encrypted text'),
  senderPubkey: z.string().describe('Sender pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const sendDmNip04Schema = z.object({
  content: z.string().describe('Message content'),
  recipientPubkey: z.string().describe('Recipient pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export const encryptNip44Schema = z.object({
  plaintext: z.string().describe('Text to encrypt'),
  recipientPubkey: z.string().describe('Recipient pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const decryptNip44Schema = z.object({
  ciphertext: z.string().describe('NIP-44 encrypted text'),
  senderPubkey: z.string().describe('Sender pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
});

export const sendDmNip44Schema = z.object({
  content: z.string().describe('Message content'),
  recipientPubkey: z.string().describe('Recipient pubkey (hex or npub)'),
  privateKey: z.string().optional().describe(privateKeyDesc),
  relays: z.array(z.string()).optional().describe('Relays to publish to'),
});

export async function encryptNip04Fn({ plaintext, recipientPubkey, privateKey }: z.infer<typeof encryptNip04Schema>) {
  const recipient = normalizePubkey(recipientPubkey);
  if (isBunkerMode()) {
    return nip04EncryptWithBunker(recipient, plaintext);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  return nip04.encrypt(sk, recipient, plaintext);
}

export async function decryptNip04Fn({ ciphertext, senderPubkey, privateKey }: z.infer<typeof decryptNip04Schema>) {
  const sender = normalizePubkey(senderPubkey);
  if (isBunkerMode()) {
    return nip04DecryptWithBunker(sender, ciphertext);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  return nip04.decrypt(sk, sender, ciphertext);
}

export async function sendDmNip04Fn({ content, recipientPubkey, privateKey, relays }: z.infer<typeof sendDmNip04Schema>) {
  const recipient = normalizePubkey(recipientPubkey);
  let encrypted: string;

  if (isBunkerMode()) {
    encrypted = await nip04EncryptWithBunker(recipient, content);
  } else {
    if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
    const sk = normalizePrivateKey(privateKey);
    encrypted = await nip04.encrypt(sk, recipient, content);
  }

  const template: EventTemplate = {
    kind: KINDS.DM,
    content: encrypted,
    tags: [['p', recipient]],
    created_at: Math.floor(Date.now() / 1000),
  };

  let signed: VerifiedEvent;
  if (isBunkerMode()) {
    signed = await signEventWithBunker(template);
  } else {
    signed = finalizeEvent(template, normalizePrivateKey(privateKey!));
  }

  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}

export async function encryptNip44Fn({ plaintext, recipientPubkey, privateKey }: z.infer<typeof encryptNip44Schema>) {
  const recipient = normalizePubkey(recipientPubkey);
  if (isBunkerMode()) {
    return nip44EncryptWithBunker(recipient, plaintext);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  const conversationKey = nip44.v2.utils.getConversationKey(sk, recipient);
  return nip44.v2.encrypt(plaintext, conversationKey);
}

export async function decryptNip44Fn({ ciphertext, senderPubkey, privateKey }: z.infer<typeof decryptNip44Schema>) {
  const sender = normalizePubkey(senderPubkey);
  if (isBunkerMode()) {
    return nip44DecryptWithBunker(sender, ciphertext);
  }
  if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  const sk = normalizePrivateKey(privateKey);
  const conversationKey = nip44.v2.utils.getConversationKey(sk, sender);
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

export async function sendDmNip44Fn({ content, recipientPubkey, privateKey, relays }: z.infer<typeof sendDmNip44Schema>) {
  const recipient = normalizePubkey(recipientPubkey);
  let encrypted: string;

  if (isBunkerMode()) {
    encrypted = await nip44EncryptWithBunker(recipient, content);
  } else {
    if (!privateKey) throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
    const sk = normalizePrivateKey(privateKey);
    const conversationKey = nip44.v2.utils.getConversationKey(sk, recipient);
    encrypted = nip44.v2.encrypt(content, conversationKey);
  }

  const template: EventTemplate = {
    kind: KINDS.DM,
    content: encrypted,
    tags: [['p', recipient]],
    created_at: Math.floor(Date.now() / 1000),
  };

  let signed: VerifiedEvent;
  if (isBunkerMode()) {
    signed = await signEventWithBunker(template);
  } else {
    signed = finalizeEvent(template, normalizePrivateKey(privateKey!));
  }

  const result = await publishEvent(signed, relays ?? DEFAULT_RELAYS);
  return { event: signed, published: result };
}
