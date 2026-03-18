/**
 * Cloudflare KV registry for NIP-05 names.
 * Each key is a name, value is the hex pubkey.
 */

export function createRegistry(cfAccountId, cfKvNamespaceId, cfApiToken) {
  const BASE = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/storage/kv/namespaces/${cfKvNamespaceId}`;
  const headers = { Authorization: `Bearer ${cfApiToken}` };

  async function nameExists(name) {
    const res = await fetch(`${BASE}/values/${name}`, { headers });
    return res.ok;
  }

  async function getOwner(name) {
    const res = await fetch(`${BASE}/values/${name}`, { headers });
    if (!res.ok) return null;
    return res.text();
  }

  async function pubkeyHasName(pubkey) {
    // List all keys and check values — not ideal for scale but fine for v1
    const res = await fetch(`${BASE}/keys`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    for (const key of data.result) {
      const owner = await getOwner(key.name);
      if (owner === pubkey) return key.name;
    }
    return null;
  }

  async function registerName(name, pubkeyHex) {
    const res = await fetch(`${BASE}/values/${name}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: pubkeyHex,
    });
    if (!res.ok) throw new Error(`KV write failed: ${await res.text()}`);
  }

  async function listNames() {
    const res = await fetch(`${BASE}/keys`, { headers });
    if (!res.ok) throw new Error(`KV list failed: ${await res.text()}`);
    const data = await res.json();
    return data.result.map(k => k.name);
  }

  return { nameExists, getOwner, pubkeyHasName, registerName, listNames };
}
