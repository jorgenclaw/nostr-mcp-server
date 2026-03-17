#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initNip46Signer } from './signer/nip46-signer.js';

// Note tools
import {
  createNoteSchema, signNoteSchema, postNoteSchema, publishNoteSchema,
  createNote, signNote, postNote, publishNote,
} from './tools/note-tools.js';

// Event tools
import {
  createNostrEventSchema, signNostrEventSchema, publishNostrEventSchema,
  createNostrEvent, signNostrEvent, publishNostrEvent,
} from './tools/event-tools.js';

// Profile tools
import {
  createProfileSchema, updateProfileSchema,
  createProfile, updateProfile,
} from './tools/profile-tools.js';

// Social tools
import {
  followSchema, unfollowSchema, reactToEventSchema, repostEventSchema,
  deleteEventSchema, replyToEventSchema,
  follow, unfollow, reactToEvent, repostEvent, deleteEvent, replyToEvent,
} from './tools/social-tools.js';

// DM tools
import {
  encryptNip04Schema, decryptNip04Schema, sendDmNip04Schema,
  encryptNip44Schema, decryptNip44Schema, sendDmNip44Schema,
  encryptNip04Fn, decryptNip04Fn, sendDmNip04Fn,
  encryptNip44Fn, decryptNip44Fn, sendDmNip44Fn,
} from './tools/dm-tools.js';

// Relay tools
import { setRelayListSchema, setRelayList } from './tools/relay-tools.js';

// Signer tools
import { getSignerInfo } from './tools/signer-tools.js';

const server = new McpServer({
  name: 'nostr-mcp-server',
  version: '1.0.0',
  description: 'Nostr MCP server with NIP-46 remote signing support',
});

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// --- Note tools ---

server.tool('createNote', 'Create an unsigned kind 1 text note', createNoteSchema.shape, async (params) => {
  return textResult(createNote(params));
});

server.tool('signNote', 'Sign a note event', signNoteSchema.shape, async (params) => {
  return textResult(await signNote(params));
});

server.tool('postNote', 'Create, sign, and publish a text note (all-in-one)', postNoteSchema.shape, async (params) => {
  return textResult(await postNote(params));
});

server.tool('publishNote', 'Publish a signed note to relays', publishNoteSchema.shape, async (params) => {
  return textResult(await publishNote(params));
});

// --- Event tools ---

server.tool('createNostrEvent', 'Create an unsigned Nostr event of any kind', createNostrEventSchema.shape, async (params) => {
  return textResult(createNostrEvent(params));
});

server.tool('signNostrEvent', 'Sign any unsigned Nostr event', signNostrEventSchema.shape, async (params) => {
  return textResult(await signNostrEvent(params));
});

server.tool('publishNostrEvent', 'Publish a signed event to relays', publishNostrEventSchema.shape, async (params) => {
  return textResult(await publishNostrEvent(params));
});

// --- Profile tools ---

server.tool('createProfile', 'Create a new Nostr profile (kind 0)', createProfileSchema.shape, async (params) => {
  return textResult(await createProfile(params));
});

server.tool('updateProfile', 'Update an existing Nostr profile (merges with current)', updateProfileSchema.shape, async (params) => {
  return textResult(await updateProfile(params));
});

// --- Social tools ---

server.tool('follow', 'Follow a pubkey (updates kind 3 contact list)', followSchema.shape, async (params) => {
  return textResult(await follow(params));
});

server.tool('unfollow', 'Unfollow a pubkey', unfollowSchema.shape, async (params) => {
  return textResult(await unfollow(params));
});

server.tool('reactToEvent', 'React to an event (kind 7)', reactToEventSchema.shape, async (params) => {
  return textResult(await reactToEvent(params));
});

server.tool('repostEvent', 'Repost an event (kind 6)', repostEventSchema.shape, async (params) => {
  return textResult(await repostEvent(params));
});

server.tool('deleteEvent', 'Delete events (kind 5)', deleteEventSchema.shape, async (params) => {
  return textResult(await deleteEvent(params));
});

server.tool('replyToEvent', 'Reply to an event with NIP-10 threading', replyToEventSchema.shape, async (params) => {
  return textResult(await replyToEvent(params));
});

// --- DM tools ---

server.tool('encryptNip04', 'Encrypt text with NIP-04 (legacy)', encryptNip04Schema.shape, async (params) => {
  return textResult({ encrypted: await encryptNip04Fn(params) });
});

server.tool('decryptNip04', 'Decrypt NIP-04 ciphertext', decryptNip04Schema.shape, async (params) => {
  return textResult({ decrypted: await decryptNip04Fn(params) });
});

server.tool('sendDmNip04', 'Send a NIP-04 direct message', sendDmNip04Schema.shape, async (params) => {
  return textResult(await sendDmNip04Fn(params));
});

server.tool('encryptNip44', 'Encrypt text with NIP-44', encryptNip44Schema.shape, async (params) => {
  return textResult({ encrypted: await encryptNip44Fn(params) });
});

server.tool('decryptNip44', 'Decrypt NIP-44 ciphertext', decryptNip44Schema.shape, async (params) => {
  return textResult({ decrypted: await decryptNip44Fn(params) });
});

server.tool('sendDmNip44', 'Send a NIP-44 direct message', sendDmNip44Schema.shape, async (params) => {
  return textResult(await sendDmNip44Fn(params));
});

// --- Relay tools ---

server.tool('setRelayList', 'Publish a relay list (NIP-65 kind 10002)', setRelayListSchema.shape, async (params) => {
  return textResult(await setRelayList(params));
});

// --- Signer info ---

server.tool('getSignerInfo', 'Returns current signing configuration and pubkey', {}, async () => {
  return textResult(getSignerInfo());
});

// --- Startup ---

async function main() {
  const bunkerUri = process.env.NOSTR_BUNKER_URI;
  if (bunkerUri) {
    console.error('[nostr-mcp] NIP-46 bunker mode enabled. Connecting...');
    try {
      await initNip46Signer(bunkerUri);
      console.error('[nostr-mcp] Bunker ready. privateKey params are optional.');
    } catch (err) {
      console.error('[nostr-mcp] Failed to connect to bunker:', err);
      process.exit(1);
    }
  } else {
    console.error('[nostr-mcp] Direct key mode. privateKey required on signing tools.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[nostr-mcp] Server started on stdio.');
}

main().catch((err) => {
  console.error('[nostr-mcp] Fatal error:', err);
  process.exit(1);
});
