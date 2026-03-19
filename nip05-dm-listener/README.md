# NIP-05 DM Listener

Automated NIP-05 registration for `jorgenclaw.ai`. Listens for Nostr DMs, generates Lightning invoices, and registers names in Cloudflare KV on payment.

## How It Works

1. Someone sends a NIP-04 DM to Jorgenclaw: `register myname`
2. Daemon replies with a Lightning invoice (5,000 sats)
3. Sender pays the invoice
4. Daemon detects payment via NWC `lookup_invoice` polling
5. Daemon writes `myname → pubkey` to Cloudflare KV
6. Daemon confirms: `myname@jorgenclaw.ai is yours!`

## Setup

```bash
cp .env.example .env
# Fill in all required values

npm install
npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JORGENCLAW_NSEC` | Yes | Jorgenclaw's nsec (for DM decrypt/encrypt) |
| `CF_API_TOKEN` | Yes | Cloudflare API token with KV write access |
| `CF_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CF_KV_NAMESPACE_ID` | Yes | KV namespace for NIP-05 names |
| `NWC_CONNECTION_STRING` | Yes* | NWC connection string for invoice generation |
| `NWC_CONFIG_PATH` | No | Path to JSON file with connection string |
| `RELAYS` | No | Comma-separated relay URLs (default: damus, nos.lol, nostr.band) |
| `PRICE_SATS` | No | Registration price (default: 5000) |
| `PAYMENT_TIMEOUT_MS` | No | Invoice expiry (default: 600000 / 10 min) |

## Running as a Service

Copy the systemd unit file and environment:

```bash
cp install/nip05-dm-listener.service ~/.config/systemd/user/
# Edit the service file paths if needed

systemctl --user daemon-reload
systemctl --user enable nip05-dm-listener
systemctl --user start nip05-dm-listener
```

## Name Rules

- 1-30 characters: lowercase letters, numbers, hyphens
- Cannot start or end with a hyphen
- Reserved: jorgenclaw, scott, admin, nostr, api, well-known, support, www
- One name per pubkey (v1)
- Lifetime registration (no renewal)
