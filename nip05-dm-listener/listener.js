/**
 * Nostr relay subscription for NIP-04 DMs + DM sending.
 */

import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools/pure';
import * as nip04 from 'nostr-tools/nip04';

useWebSocketImplementation(WebSocket);

export function createListener(secretKey, pubkey, relays) {
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
          const plaintext = await nip04.decrypt(secretKey, event.pubkey, event.content);
          console.log(`[dm] from ${event.pubkey.slice(0, 12)}...: ${plaintext}`);
          await onMessage(event.pubkey, plaintext);
        } catch (err) {
          console.error(`[dm] decrypt error from ${event.pubkey.slice(0, 12)}...: ${err.message}`);
        }
      },
    });

    console.log(`[listener] Subscribed to kind:4 DMs on ${relays.length} relays`);
  }

  async function sendDM(recipientPubkey, text) {
    const content = await nip04.encrypt(secretKey, recipientPubkey, text);
    const event = finalizeEvent({
      kind: 4,
      content,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    }, secretKey);

    try {
      await Promise.any(pool.publish(relays, event));
      console.log(`[dm sent] to ${recipientPubkey.slice(0, 12)}...`);
    } catch (err) {
      console.error(`[dm send error] ${err.message}`);
      throw err;
    }
  }

  return { subscribe, sendDM };
}
