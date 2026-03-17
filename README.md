# nostr-mcp-server

A Nostr MCP (Model Context Protocol) server with **NIP-46 remote signing** support. Private keys never need to touch the AI context window.

## Features

- **NIP-46 bunker mode** — Set `NOSTR_BUNKER_URI` once, all signing routes through your bunker
- **Direct key mode** — Pass `privateKey` per-tool call (backwards compatible with existing patterns)
- **20 signing tools** — Notes, profiles, social actions, DMs (NIP-04/44), relay lists
- **MCP native** — Works with any MCP-compatible client (Claude, etc.)

## Quick Start

```bash
npm install
npm run build
```

### Direct key mode (no bunker)

```bash
node dist/index.js
```

Tools require `privateKey` parameter on each signing call.

### Bunker mode (recommended)

```bash
NOSTR_BUNKER_URI="bunker://<pubkey>?relay=wss://relay.example.com&secret=abc" node dist/index.js
```

All signing tools use the bunker. `privateKey` parameter becomes optional.

## Tools

| Tool | Description |
|------|-------------|
| `postNote` | Create, sign, and publish a text note |
| `createNote` | Create unsigned text note |
| `signNote` | Sign a note event |
| `publishNote` | Publish signed note to relays |
| `createNostrEvent` | Create unsigned event of any kind |
| `signNostrEvent` | Sign any unsigned event |
| `publishNostrEvent` | Publish signed event to relays |
| `createProfile` | Create Nostr profile (kind 0) |
| `updateProfile` | Update existing profile |
| `follow` | Follow a pubkey |
| `unfollow` | Unfollow a pubkey |
| `reactToEvent` | React to event (kind 7) |
| `repostEvent` | Repost event (kind 6) |
| `deleteEvent` | Delete events (kind 5) |
| `replyToEvent` | Reply with NIP-10 threading |
| `encryptNip04` / `decryptNip04` | NIP-04 encryption |
| `sendDmNip04` | Send NIP-04 DM |
| `encryptNip44` / `decryptNip44` | NIP-44 encryption |
| `sendDmNip44` | Send NIP-44 DM |
| `setRelayList` | Publish relay list (NIP-65) |
| `getSignerInfo` | Check signing mode and pubkey |

## NIP-46 Bunker URI

Format: `bunker://<bunker-hex-pubkey>?relay=wss://relay.com&secret=optional`

Compatible with: [nsecbunker](https://github.com/kind-0/nsecbunker), [Amber](https://github.com/nickyknox/Amber), any NIP-46 signer.

## Dependencies

- `nostr-tools` — Nostr protocol library (signing, encryption, NIP-46)
- `@modelcontextprotocol/sdk` — MCP server framework
- `ws` — WebSocket for Node.js relay connections
- `zod` — Input validation

## License

MIT
