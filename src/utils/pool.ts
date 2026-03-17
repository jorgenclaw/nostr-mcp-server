import { SimplePool } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/relay';
import WebSocket from 'ws';
import { DEFAULT_RELAYS } from './constants.js';
import type { Event, Filter } from 'nostr-tools';

// Use ws for Node.js
useWebSocketImplementation(WebSocket as any);

let sharedPool: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!sharedPool) {
    sharedPool = new SimplePool();
  }
  return sharedPool;
}

export async function queryEvents(
  filter: Filter,
  relays: string[] = DEFAULT_RELAYS,
  timeout: number = 8000,
): Promise<Event[]> {
  const pool = getPool();
  return pool.querySync(relays, filter, { maxWait: timeout });
}

export async function queryEvent(
  filter: Filter,
  relays: string[] = DEFAULT_RELAYS,
): Promise<Event | null> {
  const pool = getPool();
  return pool.get(relays, filter);
}

export async function publishEvent(
  event: Event,
  relays: string[] = DEFAULT_RELAYS,
): Promise<{ successes: string[]; failures: string[] }> {
  const pool = getPool();
  const successes: string[] = [];
  const failures: string[] = [];

  const results = await Promise.allSettled(
    relays.map(async (relay) => {
      await pool.publish([relay], event);
      return relay;
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      failures.push(String(result.reason));
    }
  }

  if (successes.length === 0) {
    throw new Error(`Failed to publish to any relay: ${failures.join(', ')}`);
  }

  return { successes, failures };
}
