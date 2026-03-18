#!/usr/bin/env node
/**
 * NIP-05 DM Listener — jorgenclaw.ai registration daemon
 *
 * Listens for NIP-04 DMs, processes "register NAME" commands,
 * generates Lightning invoices via NWC, and writes to Cloudflare KV.
 */

import { loadConfig } from './config.js';
import { createListener } from './listener.js';
import { createInvoiceManager } from './invoice.js';
import { createRegistry } from './registry.js';

const config = loadConfig();

const listener = createListener(config.secretKey, config.pubkey, config.relays);
const invoices = createInvoiceManager(config.nwc);
const registry = createRegistry(config.cfAccountId, config.cfKvNamespaceId, config.cfApiToken);

// In-progress registrations: paymentHash -> { name, pubkey, timestamp }
const pending = new Map();

// Clean expired pending entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of pending) {
    if (now - entry.timestamp > config.paymentTimeoutMs + 60000) {
      pending.delete(hash);
    }
  }
}, 5 * 60 * 1000);

async function handleDM(senderPubkey, plaintext) {
  const text = plaintext.trim().toLowerCase();

  // Parse: "register NAME"
  const match = text.match(/^register\s+([a-z0-9][a-z0-9-]{0,29})$/);
  if (!match) {
    await listener.sendDM(senderPubkey,
      'Hi! To register a NIP-05 name, send:\n' +
      '  register yourname\n\n' +
      'Example: register myagent\n' +
      `You'll get yourname@jorgenclaw.ai for ${config.priceSats} sats.`,
    );
    return;
  }

  const name = match[1];

  // Must not end with hyphen
  if (name.endsWith('-')) {
    await listener.sendDM(senderPubkey, `"${name}" is not a valid name — cannot end with a hyphen.`);
    return;
  }

  // Reserved check
  if (config.reservedNames.includes(name)) {
    await listener.sendDM(senderPubkey, `Sorry, "${name}" is a reserved name.`);
    return;
  }

  // Already taken?
  if (await registry.nameExists(name)) {
    await listener.sendDM(senderPubkey, `Sorry, "${name}" is already taken.`);
    return;
  }

  // One name per pubkey (v1)
  const existingName = await registry.pubkeyHasName(senderPubkey);
  if (existingName) {
    await listener.sendDM(senderPubkey,
      `You already have ${existingName}@jorgenclaw.ai registered. One name per pubkey for now.`,
    );
    return;
  }

  // Generate invoice
  let bolt11, paymentHash;
  try {
    ({ bolt11, paymentHash } = await invoices.makeInvoice(
      config.priceSats,
      `NIP-05: ${name}@jorgenclaw.ai`,
    ));
  } catch (err) {
    console.error(`[invoice error] ${err.message}`);
    await listener.sendDM(senderPubkey, 'Sorry, invoice generation failed. Try again in a moment.');
    return;
  }

  // Track pending
  pending.set(paymentHash, { name, pubkey: senderPubkey, timestamp: Date.now() });

  const timeoutMin = Math.floor(config.paymentTimeoutMs / 60000);
  await listener.sendDM(senderPubkey,
    `To claim ${name}@jorgenclaw.ai, pay ${config.priceSats} sats:\n\n${bolt11}\n\n` +
    `I'll confirm automatically once paid. Invoice expires in ${timeoutMin} minutes.`,
  );

  console.log(`[pending] ${name}@jorgenclaw.ai for ${senderPubkey.slice(0, 12)}... hash=${paymentHash.slice(0, 12)}...`);

  // Poll for payment in background
  invoices.pollForPayment(paymentHash, config.paymentTimeoutMs)
    .then(async (paid) => {
      const entry = pending.get(paymentHash);
      pending.delete(paymentHash);
      if (!entry) return; // Already cleaned up

      if (!paid) {
        await listener.sendDM(entry.pubkey,
          `Invoice for ${entry.name}@jorgenclaw.ai expired unpaid. ` +
          `Send "register ${entry.name}" to try again.`,
        );
        console.log(`[expired] ${entry.name}@jorgenclaw.ai`);
        return;
      }

      // Register in KV
      try {
        await registry.registerName(entry.name, entry.pubkey);
      } catch (err) {
        console.error(`[kv error] Failed to register ${entry.name}: ${err.message}`);
        await listener.sendDM(entry.pubkey,
          `Payment received but registration failed. Contact @jorgenclaw for help.`,
        );
        return;
      }

      await listener.sendDM(entry.pubkey,
        `${entry.name}@jorgenclaw.ai is yours!\n\n` +
        `Your NIP-05 is live on all Nostr clients. Set it in your profile:\n` +
        `nip05: "${entry.name}@jorgenclaw.ai"`,
      );

      console.log(`[registered] ${entry.name}@jorgenclaw.ai -> ${entry.pubkey.slice(0, 12)}...`);
    })
    .catch(err => console.error(`[payment poll error] ${err.message}`));
}

// --- Start ---

listener.subscribe(handleDM);
console.log(`[nip05-dm-listener] Listening as ${config.pubkey.slice(0, 12)}...`);
console.log(`[nip05-dm-listener] Price: ${config.priceSats} sats`);
console.log(`[nip05-dm-listener] Relays: ${config.relays.join(', ')}`);
