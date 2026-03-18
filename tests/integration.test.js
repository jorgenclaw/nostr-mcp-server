#!/usr/bin/env node
/**
 * Integration test: starts the test bunker, connects BunkerSigner to it,
 * and verifies signing, encryption, and key retrieval work end-to-end.
 *
 * Usage:
 *   node tests/integration.test.js [relay-url]
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import * as nip04 from 'nostr-tools/nip04';
import * as nip44 from 'nostr-tools/nip44';
import { SimplePool } from 'nostr-tools';
import WebSocket from 'ws';

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

useWebSocketImplementation(WebSocket);

const RELAY_URL = process.argv[2] || 'wss://relay.primal.net';

// --- Inline test bunker (runs in-process) ---

function createTestBunker() {
  const userSk = generateSecretKey();
  const userPk = getPublicKey(userSk);
  const bunkerSk = generateSecretKey();
  const bunkerPk = getPublicKey(bunkerSk);
  const secret = bytesToHex(generateSecretKey()).slice(0, 16);

  let relay;
  let sub;

  async function start() {
    relay = await Relay.connect(RELAY_URL);

    sub = relay.subscribe(
      [{ kinds: [24133], '#p': [bunkerPk], since: Math.floor(Date.now() / 1000) - 5 }],
      {
        onevent: async (event) => {
          try {
            const clientPk = event.pubkey;
            const convKey = nip44.v2.utils.getConversationKey(bunkerSk, clientPk);
            const plaintext = nip44.v2.decrypt(event.content, convKey);
            const request = JSON.parse(plaintext);

            let response;
            switch (request.method) {
              case 'connect': {
                const [, clientSecret] = request.params;
                response = clientSecret === secret
                  ? { id: request.id, result: 'ack' }
                  : { id: request.id, error: 'invalid secret' };
                break;
              }
              case 'ping':
                response = { id: request.id, result: 'pong' };
                break;
              case 'get_public_key':
                response = { id: request.id, result: userPk };
                break;
              case 'sign_event': {
                const template = JSON.parse(request.params[0]);
                const signed = finalizeEvent({
                  kind: template.kind,
                  content: template.content,
                  tags: template.tags,
                  created_at: template.created_at,
                }, userSk);
                response = { id: request.id, result: JSON.stringify(signed) };
                break;
              }
              case 'nip04_encrypt': {
                const [pk, pt] = request.params;
                response = { id: request.id, result: await nip04.encrypt(userSk, pk, pt) };
                break;
              }
              case 'nip04_decrypt': {
                const [pk, ct] = request.params;
                response = { id: request.id, result: await nip04.decrypt(userSk, pk, ct) };
                break;
              }
              case 'nip44_encrypt': {
                const [pk, pt] = request.params;
                const ck = nip44.v2.utils.getConversationKey(userSk, pk);
                response = { id: request.id, result: nip44.v2.encrypt(pt, ck) };
                break;
              }
              case 'nip44_decrypt': {
                const [pk, ct] = request.params;
                const ck = nip44.v2.utils.getConversationKey(userSk, pk);
                response = { id: request.id, result: nip44.v2.decrypt(ct, ck) };
                break;
              }
              default:
                response = { id: request.id, error: `unsupported: ${request.method}` };
            }

            const encrypted = nip44.v2.encrypt(JSON.stringify(response), convKey);
            const respEvent = finalizeEvent({
              kind: 24133,
              content: encrypted,
              tags: [['p', clientPk]],
              created_at: Math.floor(Date.now() / 1000),
            }, bunkerSk);

            await relay.publish(respEvent);
          } catch (err) {
            console.error('[test-bunker] error:', err.message);
          }
        },
      },
    );
  }

  function stop() {
    if (sub) sub.close();
    if (relay) relay.close();
  }

  const bunkerUri = `bunker://${bunkerPk}?relay=${encodeURIComponent(RELAY_URL)}&secret=${secret}`;

  return { start, stop, bunkerUri, userPk, bunkerPk };
}

// --- Tests ---

describe('NIP-46 integration', { timeout: 30000 }, () => {
  let bunker;
  let signer; // BunkerSigner instance

  before(async () => {
    bunker = createTestBunker();
    await bunker.start();
    console.error(`[test] Bunker started. URI: ${bunker.bunkerUri}`);

    // Wait a moment for relay subscription to settle
    await new Promise(r => setTimeout(r, 1500));

    // Connect client signer
    const { BunkerSigner } = await import('nostr-tools/nip46');
    const sessionKey = generateSecretKey();
    const pool = new SimplePool();

    const url = new URL(bunker.bunkerUri.replace('bunker://', 'https://'));
    const pointer = {
      pubkey: url.hostname,
      relays: url.searchParams.getAll('relay'),
      secret: url.searchParams.get('secret'),
    };

    signer = BunkerSigner.fromBunker(sessionKey, pointer, { pool });
    console.error('[test] Connecting BunkerSigner...');
    await signer.connect();
    console.error('[test] BunkerSigner connected.');
  });

  after(() => {
    bunker?.stop();
    // Force exit — relay WebSocket keeps the event loop alive
    setTimeout(() => process.exit(0), 500);
  });

  it('get_public_key returns the user pubkey', async () => {
    const pk = await signer.getPublicKey();
    assert.equal(pk, bunker.userPk);
    console.error(`[test] get_public_key: ${pk.slice(0, 16)}...`);
  });

  it('sign_event produces a valid signed event', async () => {
    const signed = await signer.signEvent({
      kind: 1,
      content: 'hello from integration test',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });

    assert.equal(signed.pubkey, bunker.userPk);
    assert.equal(signed.kind, 1);
    assert.equal(signed.content, 'hello from integration test');
    assert.equal(typeof signed.id, 'string');
    assert.equal(typeof signed.sig, 'string');
    assert.equal(signed.id.length, 64);
    assert.equal(signed.sig.length, 128);

    // Verify the signature
    assert.equal(verifyEvent(signed), true);
    console.error(`[test] sign_event: valid, id=${signed.id.slice(0, 16)}...`);
  });

  it('nip04 encrypt/decrypt round-trips', async () => {
    const thirdPartyKey = generateSecretKey();
    const thirdPartyPk = getPublicKey(thirdPartyKey);
    const message = 'NIP-04 test message';

    const encrypted = await signer.nip04Encrypt(thirdPartyPk, message);
    assert.equal(typeof encrypted, 'string');
    assert.notEqual(encrypted, message);

    // Decrypt with the third party's key to verify
    const decrypted = await nip04.decrypt(thirdPartyKey, bunker.userPk, encrypted);
    assert.equal(decrypted, message);
    console.error(`[test] nip04 round-trip: OK`);
  });

  it('nip44 encrypt/decrypt round-trips', async () => {
    const thirdPartyKey = generateSecretKey();
    const thirdPartyPk = getPublicKey(thirdPartyKey);
    const message = 'NIP-44 test message';

    const encrypted = await signer.nip44Encrypt(thirdPartyPk, message);
    assert.equal(typeof encrypted, 'string');
    assert.notEqual(encrypted, message);

    // Decrypt with the third party's key
    const convKey = nip44.v2.utils.getConversationKey(thirdPartyKey, bunker.userPk);
    const decrypted = nip44.v2.decrypt(encrypted, convKey);
    assert.equal(decrypted, message);
    console.error(`[test] nip44 round-trip: OK`);
  });
});
