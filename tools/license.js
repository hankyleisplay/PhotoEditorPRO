#!/usr/bin/env node
/**
 * Photo Editor PRO - license tool (vendor side, never ship this file or the private key)
 *
 *   node tools/license.js init            create a key pair (license-private.pem + license-public.json)
 *   node tools/license.js sign <HWID>     print the license key for a customer's hardware ID
 *
 * A license key is an Ed25519 signature of the hardware ID, written as grouped Base32.
 * The app only contains the PUBLIC key (license-public.json), so a copy of the app can verify keys
 * but can never create them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PRIVATE_KEY_FILE = path.join(ROOT, 'license-private.pem');
const PUBLIC_KEY_FILE = path.join(ROOT, 'license-public.json');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function group(text) {
    return text.match(/.{1,5}/g).join('-');
}

function init() {
    if (fs.existsSync(PRIVATE_KEY_FILE)) {
        console.error('license-private.pem already exists. Refusing to overwrite it (all issued keys would stop working).');
        process.exit(1);
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(PRIVATE_KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    fs.writeFileSync(PUBLIC_KEY_FILE, JSON.stringify({ publicKey: spki }, null, 2) + '\n');
    console.log('Created license-private.pem (KEEP SECRET, back it up, it is git-ignored)');
    console.log('Created license-public.json (ships with the app)');
}

function sign(hwid) {
    if (!hwid) {
        console.error('Usage: node tools/license.js sign <HWID>');
        process.exit(1);
    }
    if (!fs.existsSync(PRIVATE_KEY_FILE)) {
        console.error('license-private.pem not found. Run "node tools/license.js init" first.');
        process.exit(1);
    }
    const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_FILE));
    const signature = crypto.sign(null, Buffer.from(hwid.trim(), 'utf8'), privateKey);
    console.log('Hardware ID : ' + hwid.trim());
    console.log('License Key : ' + group(base32(signature)));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'init') init();
else if (cmd === 'sign') sign(args.join(' '));
else {
    console.error('Usage:\n  node tools/license.js init\n  node tools/license.js sign <HWID>');
    process.exit(1);
}
