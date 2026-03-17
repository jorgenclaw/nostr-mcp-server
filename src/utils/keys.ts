import { nip19, getPublicKey } from 'nostr-tools';
import { isBunkerMode, getBunkerPubkey } from '../signer/nip46-signer.js';

export function normalizePrivateKey(input: string): Uint8Array {
  let hex: string;
  if (input.startsWith('nsec1')) {
    const decoded = nip19.decode(input);
    if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
    return decoded.data;
  }
  hex = input.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Invalid private key: must be 64-char hex or nsec');
  }
  return hexToBytes(hex);
}

export function normalizePubkey(input: string): string {
  if (input.startsWith('npub1')) {
    const decoded = nip19.decode(input);
    if (decoded.type !== 'npub') throw new Error('Invalid npub');
    return decoded.data;
  }
  const hex = input.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error('Invalid pubkey: must be 64-char hex or npub');
  }
  return hex;
}

export function getPublicKeyFromPrivate(sk: Uint8Array): string {
  return getPublicKey(sk);
}

export function resolveSigningPubkey(providedPrivateKey?: string): string {
  if (isBunkerMode()) {
    const pk = getBunkerPubkey();
    if (!pk) throw new Error('Bunker not ready');
    return pk;
  }
  if (!providedPrivateKey) {
    throw new Error('privateKey is required when NOSTR_BUNKER_URI is not configured');
  }
  const sk = normalizePrivateKey(providedPrivateKey);
  return getPublicKeyFromPrivate(sk);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
