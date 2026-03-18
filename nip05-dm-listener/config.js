import { readFileSync } from 'fs';
import { connect } from 'net';

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

/**
 * Get pubkey from the signing daemon.
 */
async function getPubkeyFromSigner(socketPath) {
  return new Promise((resolve, reject) => {
    const sock = connect(socketPath);
    let data = '';
    sock.on('connect', () => {
      sock.write(JSON.stringify({ method: 'get_public_key' }));
      sock.end();
    });
    sock.on('data', (chunk) => { data += chunk; });
    sock.on('end', () => {
      try {
        const res = JSON.parse(data);
        if (res.error) reject(new Error(res.error));
        else resolve(res.pubkey);
      } catch { reject(new Error(`Bad signer response: ${data}`)); }
    });
    sock.on('error', (err) => {
      sock.destroy();
      reject(new Error(`Cannot connect to signing daemon at ${socketPath}: ${err.message}`));
    });
  });
}

export async function loadConfig() {
  // --- Signing daemon ---
  const signerSocket = process.env.NOSTR_SIGNER_SOCKET
    || `${process.env.XDG_RUNTIME_DIR || '/run/user/1000'}/nostr-signer.sock`;

  const pubkey = await getPubkeyFromSigner(signerSocket);

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
  const { getPublicKey } = await import('nostr-tools/pure');
  const nwcSecretKey = hexToBytes(nwcSecret);
  const nwcClientPubkey = getPublicKey(nwcSecretKey);

  // --- Options ---
  const relays = (process.env.RELAYS || 'wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band').split(',');
  const priceSats = parseInt(process.env.PRICE_SATS || '1000');
  const paymentTimeoutMs = parseInt(process.env.PAYMENT_TIMEOUT_MS || '600000');
  const reservedNames = ['jorgenclaw', 'scott', 'admin', 'nostr', 'api', 'well-known', 'support', '_', 'www'];

  return {
    signerSocket,
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
