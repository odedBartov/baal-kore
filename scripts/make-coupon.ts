// CLI tool for managing online Ba'al Kore coupons in `coupons.json`.
// Coupons are stored as salted SHA-256 hashes in `coupons.json` so the secret keywords
// are hidden even in the public GitHub repository, and can be created or revoked anytime.
//
// Usage examples:
//   npm run make-coupon                                   -> Lists all coupons in coupons.json
//   npm run make-coupon -- add odedTest                   -> Adds/updates 100% free Parasha coupon "odedTest"
//   npm run make-coupon -- add vip2026 free-all           -> Adds/updates 100% free All-54-Parashot VIP coupon "vip2026"
//   npm run make-coupon -- add gift1 free-parasha single  -> Adds a single-use 1-Parasha coupon "gift1"
//   npm run make-coupon -- revoke odedTest                -> Revokes coupon "odedTest" (sets active: false)
//   npm run make-coupon -- delete odedTest                -> Completely removes coupon "odedTest" from coupons.json
//   Add `--push` at the end of any command to automatically git commit & push `coupons.json` to GitHub!

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  hashCouponCode,
  normalizeCouponInput,
  ONLINE_COUPONS_URL,
  type CouponKind,
  type OnlineCouponsManifest,
} from '../src/app/core/coupons';

const MANIFEST_PATH = join(import.meta.dirname, '..', 'coupons.json');

function loadManifest(): OnlineCouponsManifest {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      coupons: [],
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as OnlineCouponsManifest;
}

function saveManifest(manifest: OnlineCouponsManifest, autoPush: boolean, commitMsg: string): void {
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`✓ Saved ${MANIFEST_PATH}`);
  if (autoPush) {
    console.log('Pushing coupons.json to GitHub...');
    execSync('git add coupons.json', { stdio: 'inherit' });
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log(`✓ Live online at: ${ONLINE_COUPONS_URL}`);
  } else {
    console.log('Tip: Run `git add coupons.json && git commit -m "Update coupons" && git push` (or pass `--push`) to publish online.');
  }
}

const rawArgs = process.argv.slice(2);
const autoPush = rawArgs.includes('--push');
const args = rawArgs.filter((a) => a !== '--push');

const cmd = (args[0] ?? 'list').toLowerCase();
const manifest = loadManifest();

if (cmd === 'list') {
  console.log(`=== Online Coupons Manifest (${MANIFEST_PATH}) ===`);
  console.log(`Remote URL: ${ONLINE_COUPONS_URL}`);
  console.log(`Updated At: ${manifest.updatedAt ?? 'never'}\n`);
  if (!manifest.coupons.length) {
    console.log('  (no coupons configured)');
  } else {
    for (const c of manifest.coupons) {
      const status = c.active ? '🟢 ACTIVE ' : '🔴 REVOKED';
      const use = c.singleUse ? 'single-use' : 'multi-use';
      const exp = c.expiresAt ? ` (expires ${c.expiresAt})` : '';
      console.log(`  ${status} | id: ${c.id.padEnd(18)} | kind: ${c.kind.padEnd(13)} | ${use}${exp}`);
    }
  }
  process.exit(0);
}

if (cmd === 'add') {
  const keyword = args[1];
  if (!keyword) {
    console.error('Usage: npm run make-coupon -- add <CODE> [free-parasha|free-all] [single|multi] [--push]');
    process.exit(1);
  }
  const kindArg = (args[2] ?? 'free-parasha').toLowerCase();
  const kind: CouponKind = kindArg === 'free-all' || kindArg === 'vip' ? 'free-all' : 'free-parasha';
  const useArg = (args[3] ?? 'multi').toLowerCase();
  const singleUse = useArg === 'single' || useArg === 'true' || useArg === '1';

  const normalized = normalizeCouponInput(keyword);
  const sha256 = hashCouponCode(normalized);
  const id = `coupon-${normalized.slice(0, 4).toLowerCase()}-${sha256.slice(0, 6)}`;

  const existingIdx = manifest.coupons.findIndex((c) => c.sha256 === sha256 || c.id === id);
  const entry = {
    id,
    sha256,
    kind,
    active: true,
    singleUse,
    descriptionHe:
      kind === 'free-all'
        ? 'קופון VIP אומת אונליין! כל 54 פרשות התורה (כל העליות א׳–ז׳) נפתחו בחינם (100% הנחה)!'
        : 'הקופון אומת אונליין! כל העליות בפרשה נפתחו בחינם (100% הנחה)!',
  };

  if (existingIdx >= 0) {
    manifest.coupons[existingIdx] = entry;
    console.log(`✓ Updated & activated coupon "${keyword}" (id: ${id}, kind: ${kind}, singleUse: ${singleUse})`);
  } else {
    manifest.coupons.push(entry);
    console.log(`✓ Added online coupon "${keyword}" (id: ${id}, kind: ${kind}, singleUse: ${singleUse})`);
  }
  saveManifest(manifest, autoPush, `Update online coupon ${id}`);
  process.exit(0);
}

if (cmd === 'revoke' || cmd === 'disable') {
  const target = args[1];
  if (!target) {
    console.error('Usage: npm run make-coupon -- revoke <CODE_OR_ID> [--push]');
    process.exit(1);
  }
  const sha256 = hashCouponCode(target);
  const norm = normalizeCouponInput(target);
  let found = 0;
  for (const c of manifest.coupons) {
    if (c.id === target || c.sha256 === sha256 || (c.code && normalizeCouponInput(c.code) === norm)) {
      c.active = false;
      found++;
      console.log(`🔴 Revoked coupon (id: ${c.id})`);
    }
  }
  if (!found) {
    console.error(`No matching coupon found for "${target}".`);
    process.exit(1);
  }
  saveManifest(manifest, autoPush, `Revoke online coupon ${target}`);
  process.exit(0);
}

if (cmd === 'delete' || cmd === 'remove') {
  const target = args[1];
  if (!target) {
    console.error('Usage: npm run make-coupon -- delete <CODE_OR_ID> [--push]');
    process.exit(1);
  }
  const sha256 = hashCouponCode(target);
  const norm = normalizeCouponInput(target);
  const before = manifest.coupons.length;
  manifest.coupons = manifest.coupons.filter(
    (c) => !(c.id === target || c.sha256 === sha256 || (c.code && normalizeCouponInput(c.code) === norm)),
  );
  if (manifest.coupons.length === before) {
    console.error(`No matching coupon found for "${target}".`);
    process.exit(1);
  }
  console.log(`🗑️ Deleted coupon "${target}" from coupons.json`);
  saveManifest(manifest, autoPush, `Delete online coupon`);
  process.exit(0);
}

console.error(`Unknown command "${cmd}". Available commands: list, add, revoke, delete.`);
process.exit(1);
