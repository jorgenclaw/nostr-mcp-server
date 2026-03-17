import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('NIP-46 signer module', () => {
  let signerModule;

  before(async () => {
    signerModule = await import('../dist/signer/nip46-signer.js');
  });

  it('isBunkerMode returns false when not initialized', () => {
    assert.equal(signerModule.isBunkerMode(), false);
  });

  it('getBunkerPubkey returns null when not initialized', () => {
    assert.equal(signerModule.getBunkerPubkey(), null);
  });

  it('signEventWithBunker throws when not initialized', async () => {
    await assert.rejects(
      () => signerModule.signEventWithBunker({ kind: 1, content: 'test', tags: [], created_at: 0 }),
      { message: 'NIP-46 signer not initialized' },
    );
  });

  it('nip04EncryptWithBunker throws when not initialized', async () => {
    await assert.rejects(
      () => signerModule.nip04EncryptWithBunker('abc', 'hello'),
      { message: 'NIP-46 signer not initialized' },
    );
  });
});

describe('keys module', () => {
  let keysModule;

  before(async () => {
    keysModule = await import('../dist/utils/keys.js');
  });

  it('normalizePrivateKey accepts 64-char hex', () => {
    const hex = 'a'.repeat(64);
    const result = keysModule.normalizePrivateKey(hex);
    assert.equal(result instanceof Uint8Array, true);
    assert.equal(result.length, 32);
  });

  it('normalizePrivateKey rejects invalid input', () => {
    assert.throws(() => keysModule.normalizePrivateKey('invalid'), /Invalid private key/);
  });

  it('normalizePubkey accepts 64-char hex', () => {
    const hex = 'b'.repeat(64);
    assert.equal(keysModule.normalizePubkey(hex), hex);
  });

  it('normalizePubkey rejects invalid input', () => {
    assert.throws(() => keysModule.normalizePubkey('bad'), /Invalid pubkey/);
  });

  it('resolveSigningPubkey throws without bunker and without key', () => {
    assert.throws(
      () => keysModule.resolveSigningPubkey(),
      /privateKey is required/,
    );
  });

  it('resolveSigningPubkey returns pubkey from provided key', () => {
    const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const pubkey = keysModule.resolveSigningPubkey(hex);
    assert.equal(typeof pubkey, 'string');
    assert.equal(pubkey.length, 64);
  });
});

describe('note tools', () => {
  let noteTools;

  before(async () => {
    noteTools = await import('../dist/tools/note-tools.js');
  });

  it('createNote returns a valid event template', () => {
    const template = noteTools.createNote({ content: 'hello world' });
    assert.equal(template.kind, 1);
    assert.equal(template.content, 'hello world');
    assert.deepEqual(template.tags, []);
    assert.equal(typeof template.created_at, 'number');
  });

  it('createNote includes custom tags', () => {
    const template = noteTools.createNote({
      content: 'tagged',
      tags: [['t', 'nostr']],
    });
    assert.deepEqual(template.tags, [['t', 'nostr']]);
  });
});

describe('signer info tool', () => {
  let signerTools;

  before(async () => {
    signerTools = await import('../dist/tools/signer-tools.js');
  });

  it('returns direct-key mode when no bunker', () => {
    const info = signerTools.getSignerInfo();
    assert.equal(info.mode, 'direct-key');
    assert.equal(info.pubkey, null);
    assert.equal(info.bunkerConfigured, false);
  });
});
