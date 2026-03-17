import { isBunkerMode, getBunkerPubkey } from '../signer/nip46-signer.js';

export function getSignerInfo() {
  return {
    mode: isBunkerMode() ? 'nip46-bunker' : 'direct-key',
    pubkey: isBunkerMode() ? getBunkerPubkey() : null,
    bunkerConfigured: isBunkerMode(),
  };
}
