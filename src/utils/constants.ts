export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
  'wss://relay.snort.social',
];

export const QUERY_TIMEOUT = 8000;

export const KINDS = {
  METADATA: 0,
  TEXT: 1,
  CONTACT_LIST: 3,
  DM: 4,
  DELETE: 5,
  REPOST: 6,
  REACTION: 7,
  RELAY_LIST: 10002,
  NIP44_GIFT_WRAP: 1059,
} as const;
