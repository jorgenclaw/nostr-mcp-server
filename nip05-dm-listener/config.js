import { readFileSync } from 'fs';
import { nip19, getPublicKey } from 'nostr-tools';

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function loadConfig() {
  // --- Nostr identity ---
  const nsec = requireEnv('JORGENCLAW_NSEC');
  const { data: secretKey } = nip19.decode(nsec);
  const pubkey = getPublicKey(secretKey);

  // --- Cloudflare ---
  const cfApiToken = requireEnv('CF_API_TOKEN');
  const cfAccountId = requireEnv('CF_ACCOUNT_ID');
  const cfKvNamespaceId = requireEnv('CF_KV_NAMESPACE_ID');

  // --- NWC ---
  let nwcString = process.env.NWC_CONNECTION_STRING;
  if (!nwcString) {
    const nwcPath = process.env.NWC_CONFIG_PATH || '/workspace/group/config/nwc.json';
    try {
      const cfg = JSON.parse(readFileSync(nwcPath, 'utf8'));
      nwcString = cfg.connectionString || cfg.nwcString || cfg.connection_string;
    } catch {
      throw new Error(`NWC_CONNECTION_STRING not set and cannot read ${nwcPath}`);
    }
  }

  const nwcUrl = new URL(nwcString);
  const nwcWalletPubkey = nwcUrl.pathname || nwcUrl.host;
  const nwcRelay = nwcUrl.searchParams.get('relay');
  const nwcSecret = nwcUrl.searchParams.get('secret');
  if (!nwcWalletPubkey || !nwcRelay || !nwcSecret) {
    throw new Error('Invalid NWC connection string');
  }
  const nwcSecretKey = hexToBytes(nwcSecret);
  const nwcClientPubkey = getPublicKey(nwcSecretKey);

  // --- Options ---
  const relays = (process.env.RELAYS || 'wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band').split(',');
  const priceSats = parseInt(process.env.PRICE_SATS || '1000');
  const paymentTimeoutMs = parseInt(process.env.PAYMENT_TIMEOUT_MS || '600000');
  const reservedNames = ['jorgenclaw', 'scott', 'admin', 'nostr', 'api', 'well-known', 'support', '_', 'www'];

  return {
    secretKey,
    pubkey,
    cfApiToken,
    cfAccountId,
    cfKvNamespaceId,
    nwc: {
      walletPubkey: nwcWalletPubkey,
      relay: nwcRelay,
      secretKey: nwcSecretKey,
      clientPubkey: nwcClientPubkey,
    },
    relays,
    priceSats,
    paymentTimeoutMs,
    reservedNames,
  };
}
