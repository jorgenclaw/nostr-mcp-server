import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import WebSocket from 'ws';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';

useWebSocketImplementation(WebSocket as any);

export interface Nip46Config {
  bunkerUri: string;
}

interface BunkerPointer {
  pubkey: string;
  relays: string[];
  secret: string | null;
}

let signerInstance: any = null;
let signerPubkey: string | null = null;

function parseBunkerUri(uri: string): BunkerPointer {
  const url = new URL(uri.replace('bunker://', 'https://'));
  const pubkey = url.hostname;
  const relays = url.searchParams.getAll('relay');
  const secret = url.searchParams.get('secret') ?? null;

  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error(`Invalid bunker pubkey: ${pubkey}`);
  }
  if (relays.length === 0) {
    throw new Error('Bunker URI must include at least one relay');
  }

  return { pubkey, relays, secret };
}

export async function initNip46Signer(bunkerUri: string): Promise<string> {
  const { parseBunkerInput, BunkerSigner } = await import('nostr-tools/nip46');

  const pointer = parseBunkerUri(bunkerUri);
  const pool = new SimplePool();

  const sessionKey = generateSecretKey();

  const signer = BunkerSigner.fromBunker(sessionKey, pointer, { pool });
  await signer.connect();

  const pubkey = await signer.getPublicKey();
  if (!pubkey) throw new Error('Failed to get pubkey from bunker');
  signerPubkey = pubkey;
  signerInstance = signer;

  console.error(`[nip46-signer] Connected to bunker. Signing pubkey: ${signerPubkey}`);
  return signerPubkey;
}

export async function signEventWithBunker(template: EventTemplate): Promise<VerifiedEvent> {
  if (!signerInstance) throw new Error('NIP-46 signer not initialized');
  return signerInstance.signEvent(template);
}

export async function nip04EncryptWithBunker(recipientPubkey: string, plaintext: string): Promise<string> {
  if (!signerInstance) throw new Error('NIP-46 signer not initialized');
  return signerInstance.nip04Encrypt(recipientPubkey, plaintext);
}

export async function nip04DecryptWithBunker(senderPubkey: string, ciphertext: string): Promise<string> {
  if (!signerInstance) throw new Error('NIP-46 signer not initialized');
  return signerInstance.nip04Decrypt(senderPubkey, ciphertext);
}

export async function nip44EncryptWithBunker(recipientPubkey: string, plaintext: string): Promise<string> {
  if (!signerInstance) throw new Error('NIP-46 signer not initialized');
  return signerInstance.nip44Encrypt(recipientPubkey, plaintext);
}

export async function nip44DecryptWithBunker(senderPubkey: string, ciphertext: string): Promise<string> {
  if (!signerInstance) throw new Error('NIP-46 signer not initialized');
  return signerInstance.nip44Decrypt(senderPubkey, ciphertext);
}

export function getBunkerPubkey(): string | null {
  return signerPubkey;
}

export function isBunkerMode(): boolean {
  return signerInstance !== null;
}
