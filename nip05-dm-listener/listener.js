/**
 * Nostr relay subscription for NIP-04 DMs + DM sending.
 * Encryption/decryption delegated to the signing daemon via Unix socket.
 */

import { connect } from 'net';
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';

useWebSocketImplementation(WebSocket);

function signerRequest(socketPath, payload) {
  return new Promise((resolve, reject) => {
    const sock = connect(socketPath);
    let data = '';
    sock.on('connect', () => {
      sock.write(JSON.stringify(payload));
      sock.end();
    });
    sock.on('data', (chunk) => { data += chunk; });
    sock.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error(`Bad response from signer: ${data}`)); }
    });
    sock.on('error', (err) => {
      sock.destroy();
      reject(new Error(`Cannot connect to signing daemon: ${err.message}`));
    });
  });
}

export function createListener(pubkey, relays, signerSocketPath) {
  const pool = new SimplePool();

  function subscribe(onMessage) {
    const since = Math.floor(Date.now() / 1000);

    pool.subscribeMany(relays, [{
      kinds: [4],
      '#p': [pubkey],
      since,
    }], {
      onevent: async (event) => {
        // Skip our own messages
        if (event.pubkey === pubkey) return;

        try {
          const res = await signerRequest(signerSocketPath, {
            method: 'nip04_decrypt',
            params: { senderPubkey: event.pubkey, ciphertext: event.content },
          });
          if (res.error) throw new Error(res.error);

          console.log(`[dm] from ${event.pubkey.slice(0, 12)}...: ${res.plaintext}`);
          await onMessage(event.pubkey, res.plaintext);
        } catch (err) {
          console.error(`[dm] decrypt error from ${event.pubkey.slice(0, 12)}...: ${err.message}`);
        }
      },
    });

    console.log(`[listener] Subscribed to kind:4 DMs on ${relays.length} relays`);
  }

  async function sendDM(recipientPubkey, text) {
    // Encrypt via signing daemon
    const encRes = await signerRequest(signerSocketPath, {
      method: 'nip04_encrypt',
      params: { recipientPubkey, plaintext: text },
    });
    if (encRes.error) throw new Error(`Encrypt failed: ${encRes.error}`);

    // Sign via signing daemon
    const signRes = await signerRequest(signerSocketPath, {
      method: 'sign_event',
      params: {
        kind: 4,
        content: encRes.ciphertext,
        tags: [['p', recipientPubkey]],
      },
    });
    if (signRes.error) throw new Error(`Sign failed: ${signRes.error}`);

    try {
      await Promise.any(pool.publish(relays, signRes.event));
      console.log(`[dm sent] to ${recipientPubkey.slice(0, 12)}...`);
    } catch (err) {
      console.error(`[dm send error] ${err.message}`);
      throw err;
    }
  }

  return { subscribe, sendDM };
}
