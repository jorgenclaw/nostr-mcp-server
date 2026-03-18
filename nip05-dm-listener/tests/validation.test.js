import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const RESERVED = ['jorgenclaw', 'scott', 'admin', 'nostr', 'api', 'well-known', 'support', '_', 'www'];
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

function validateName(name) {
  if (!NAME_RE.test(name)) return { valid: false, reason: 'invalid format' };
  if (name.endsWith('-')) return { valid: false, reason: 'cannot end with hyphen' };
  if (RESERVED.includes(name)) return { valid: false, reason: 'reserved' };
  return { valid: true };
}

describe('name validation', () => {
  it('accepts simple names', () => {
    assert.deepEqual(validateName('alice'), { valid: true });
    assert.deepEqual(validateName('bob42'), { valid: true });
    assert.deepEqual(validateName('my-agent'), { valid: true });
    assert.deepEqual(validateName('a'), { valid: true });
  });

  it('accepts max length (30 chars)', () => {
    assert.deepEqual(validateName('a'.repeat(30)), { valid: true });
  });

  it('rejects too long (31+ chars)', () => {
    assert.deepEqual(validateName('a'.repeat(31)), { valid: false, reason: 'invalid format' });
  });

  it('rejects uppercase', () => {
    assert.deepEqual(validateName('Alice'), { valid: false, reason: 'invalid format' });
  });

  it('rejects special characters', () => {
    assert.deepEqual(validateName('alice!'), { valid: false, reason: 'invalid format' });
    assert.deepEqual(validateName('al ice'), { valid: false, reason: 'invalid format' });
    assert.deepEqual(validateName('al.ice'), { valid: false, reason: 'invalid format' });
    assert.deepEqual(validateName('al@ice'), { valid: false, reason: 'invalid format' });
  });

  it('rejects starting with hyphen', () => {
    assert.deepEqual(validateName('-alice'), { valid: false, reason: 'invalid format' });
  });

  it('rejects ending with hyphen', () => {
    assert.deepEqual(validateName('alice-'), { valid: false, reason: 'cannot end with hyphen' });
  });

  it('rejects empty string', () => {
    assert.deepEqual(validateName(''), { valid: false, reason: 'invalid format' });
  });

  it('rejects reserved names', () => {
    for (const name of RESERVED) {
      const result = validateName(name);
      assert.equal(result.valid, false, `${name} should be reserved`);
    }
  });
});

describe('DM parsing', () => {
  const REGISTER_RE = /^register\s+([a-z0-9][a-z0-9-]{0,29})$/;

  it('parses "register name"', () => {
    const match = 'register myagent'.match(REGISTER_RE);
    assert.ok(match);
    assert.equal(match[1], 'myagent');
  });

  it('parses "register name-with-hyphens"', () => {
    const match = 'register my-cool-agent'.match(REGISTER_RE);
    assert.ok(match);
    assert.equal(match[1], 'my-cool-agent');
  });

  it('rejects without register prefix', () => {
    assert.equal('myagent'.match(REGISTER_RE), null);
  });

  it('rejects register with no name', () => {
    assert.equal('register'.match(REGISTER_RE), null);
    assert.equal('register '.match(REGISTER_RE), null);
  });

  it('rejects register with extra words', () => {
    assert.equal('register my agent'.match(REGISTER_RE), null);
  });

  it('rejects register with invalid chars', () => {
    assert.equal('register My_Agent'.match(REGISTER_RE), null);
  });
});

describe('registry mock', () => {
  it('createRegistry returns expected interface', async () => {
    // Just verify the factory returns the right shape
    const { createRegistry } = await import('../registry.js');
    const reg = createRegistry('fake-account', 'fake-namespace', 'fake-token');
    assert.equal(typeof reg.nameExists, 'function');
    assert.equal(typeof reg.getOwner, 'function');
    assert.equal(typeof reg.pubkeyHasName, 'function');
    assert.equal(typeof reg.registerName, 'function');
    assert.equal(typeof reg.listNames, 'function');
  });
});
