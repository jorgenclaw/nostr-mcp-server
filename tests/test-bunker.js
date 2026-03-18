#!/usr/bin/env node
/**
 * Minimal NIP-46 test bunker.
 *
 * Generates a fresh keypair, connects to a relay, and handles
 * signing requests from a BunkerSigner client.
 *
 * Usage:
 *   node tests/test-bunker.js [relay-url]
 *
 * Prints a bunker:// URI on stdout that you feed to NOSTR_BUNKER_URI.
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import * as nip04 from 'nostr-tools/nip04';
import * as nip44 from 'nostr-tools/nip44';
import WebSocket from 'ws';

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

useWebSocketImplementation(WebSocket);

// --- Config ---
const RELAY_URL = process.argv[2] || 'wss://relay.primal.net';
const SECRET = bytesToHex(generateSecretKey()).slice(0, 16);

// --- Keys ---
// "User" key — the identity this bunker signs for
const userSk = generateSecretKey();
const userPk = getPublicKey(userSk);

// "Bunker" key — the bunker's own transport identity
const bunkerSk = generateSecretKey();
const bunkerPk = getPublicKey(bunkerSk);

const bunkerUri = `bunker://${bunkerPk}?relay=${encodeURIComponent(RELAY_URL)}&secret=${SECRET}`;

// --- Helpers ---

function nip44ConversationKey(sk, pk) {
  return nip44.v2.utils.getConversationKey(sk, pk);
}

function nip44Encrypt(sk, pk, plaintext) {
  const key = nip44ConversationKey(sk, pk);
  return nip44.v2.encrypt(plaintext, key);
}

function nip44Decrypt(sk, pk, ciphertext) {
  const key = nip44ConversationKey(sk, pk);
  return nip44.v2.decrypt(ciphertext, key);
}

// --- RPC handler ---

async function handleRequest(method, params, clientPubkey) {
  switch (method) {
    case 'connect': {
      const [, clientSecret] = params;
      if (SECRET && clientSecret !== SECRET) {
        return { error: 'invalid secret' };
      }
      return { result: 'ack' };
    }

    case 'ping':
      return { result: 'pong' };

    case 'get_public_key':
      return { result: userPk };

    case 'sign_event': {
      const template = JSON.parse(params[0]);
      const signed = finalizeEvent(
        {
          kind: template.kind,
          content: template.content,
          tags: template.tags,
          created_at: template.created_at,
        },
        userSk,
      );
      return { result: JSON.stringify(signed) };
    }

    case 'nip04_encrypt': {
      const [thirdPartyPk, plaintext] = params;
      const encrypted = await nip04.encrypt(userSk, thirdPartyPk, plaintext);
      return { result: encrypted };
    }

    case 'nip04_decrypt': {
      const [thirdPartyPk, ciphertext] = params;
      const decrypted = await nip04.decrypt(userSk, thirdPartyPk, ciphertext);
      return { result: decrypted };
    }

    case 'nip44_encrypt': {
      const [thirdPartyPk, plaintext] = params;
      const key = nip44.v2.utils.getConversationKey(userSk, thirdPartyPk);
      const encrypted = nip44.v2.encrypt(plaintext, key);
      return { result: encrypted };
    }

    case 'nip44_decrypt': {
      const [thirdPartyPk, ciphertext] = params;
      const key = nip44.v2.utils.getConversationKey(userSk, thirdPartyPk);
      const decrypted = nip44.v2.decrypt(ciphertext, key);
      return { result: decrypted };
    }

    default:
      return { error: `unsupported method: ${method}` };
  }
}

// --- Main ---

async function main() {
  console.error(`[test-bunker] User pubkey:   ${userPk}`);
  console.error(`[test-bunker] Bunker pubkey: ${bunkerPk}`);
  console.error(`[test-bunker] Relay:         ${RELAY_URL}`);
  console.error(`[test-bunker] Connecting...`);

  const relay = await Relay.connect(RELAY_URL);
  console.error(`[test-bunker] Connected to relay.`);

  // Print the URI to stdout (pipe-friendly)
  console.log(bunkerUri);

  // Subscribe to kind 24133 events addressed to us
  relay.subscribe(
    [{ kinds: [24133], '#p': [bunkerPk], since: Math.floor(Date.now() / 1000) - 5 }],
    {
      onevent: async (event) => {
        try {
          const clientPubkey = event.pubkey;
          const plaintext = nip44Decrypt(bunkerSk, clientPubkey, event.content);
          const request = JSON.parse(plaintext);

          console.error(`[test-bunker] ← ${request.method}(${JSON.stringify(request.params)})`);

          const response = await handleRequest(request.method, request.params, clientPubkey);
          const rpcResponse = { id: request.id, ...response };

          console.error(`[test-bunker] → ${JSON.stringify(response).slice(0, 120)}`);

          // Encrypt response and publish
          const encrypted = nip44Encrypt(bunkerSk, clientPubkey, JSON.stringify(rpcResponse));
          const responseEvent = finalizeEvent(
            {
              kind: 24133,
              content: encrypted,
              tags: [['p', clientPubkey]],
              created_at: Math.floor(Date.now() / 1000),
            },
            bunkerSk,
          );

          await relay.publish(responseEvent);
        } catch (err) {
          console.error(`[test-bunker] Error handling event:`, err.message);
        }
      },
    },
  );

  console.error(`[test-bunker] Listening for signing requests. Ctrl+C to stop.`);
  console.error(`[test-bunker]`);
  console.error(`[test-bunker] To test, run in another terminal:`);
  console.error(`[test-bunker]   NOSTR_BUNKER_URI="${bunkerUri}" node dist/index.js`);
}

main().catch((err) => {
  console.error('[test-bunker] Fatal:', err);
  process.exit(1);
});
