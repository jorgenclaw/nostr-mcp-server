/**
 * NWC (NIP-47) invoice generation and payment polling.
 * Implements make_invoice and lookup_invoice natively.
 */

import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { encrypt, decrypt } from 'nostr-tools/nip04';

useWebSocketImplementation(WebSocket);

export function createInvoiceManager(nwcConfig) {
  const { walletPubkey, relay, secretKey, clientPubkey } = nwcConfig;

  async function nwcRequest(method, params = {}) {
    const pool = new SimplePool();
    try {
      const content = JSON.stringify({ method, params });
      const encrypted = encrypt(secretKey, walletPubkey, content);

      const event = finalizeEvent({
        kind: 23194,
        content: encrypted,
        tags: [['p', walletPubkey]],
        created_at: Math.floor(Date.now() / 1000),
      }, secretKey);

      const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sub.close();
          reject(new Error(`NWC ${method} timed out after 30s`));
        }, 30000);

        const sub = pool.subscribeMany(
          [relay],
          {
            kinds: [23195],
            authors: [walletPubkey],
            '#p': [clientPubkey],
            '#e': [event.id],
          },
          {
            onevent: (responseEvent) => {
              clearTimeout(timeout);
              sub.close();
              try {
                const decrypted = decrypt(secretKey, walletPubkey, responseEvent.content);
                resolve(JSON.parse(decrypted));
              } catch (err) {
                reject(new Error(`Failed to decrypt NWC response: ${err.message}`));
              }
            },
          },
        );
      });

      await Promise.all(pool.publish([relay], event));
      return await responsePromise;
    } finally {
      pool.close([relay]);
    }
  }

  async function makeInvoice(amountSats, description) {
    const response = await nwcRequest('make_invoice', {
      amount: amountSats * 1000, // millisats
      description: description || 'NIP-05 registration',
    });

    if (response.error) {
      throw new Error(`make_invoice failed: ${response.error.message || JSON.stringify(response.error)}`);
    }

    const invoice = response.result?.invoice;
    const paymentHash = response.result?.payment_hash;
    if (!invoice) throw new Error('make_invoice returned no invoice');

    return { bolt11: invoice, paymentHash };
  }

  async function lookupInvoice(paymentHash) {
    const response = await nwcRequest('lookup_invoice', {
      payment_hash: paymentHash,
    });

    if (response.error) {
      throw new Error(`lookup_invoice failed: ${response.error.message || JSON.stringify(response.error)}`);
    }

    // NIP-47 returns settled_at (unix timestamp) when paid
    const settled = !!response.result?.settled_at;
    return { settled, result: response.result };
  }

  async function pollForPayment(paymentHash, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 10000; // 10 seconds

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, pollInterval));

      try {
        const { settled } = await lookupInvoice(paymentHash);
        if (settled) return true;
      } catch (err) {
        console.error(`[invoice] lookup_invoice error: ${err.message}`);
        // Continue polling on transient errors
      }
    }

    return false;
  }

  return { makeInvoice, lookupInvoice, pollForPayment };
}
