// CLI tool for managing online Ba'al Kore coupons in `coupons.json`.
// Coupons are stored as salted SHA-256 hashes in `coupons.json` so the secret keywords
// are hidden in the public GitHub repository, while `.coupons-local.json` (git-ignored)
// remembers the plain keyword on your computer so you can list them easily.
//
// Usage examples:
//   npm run make-coupon                                   -> Lists all coupons you have
//   npm run make-coupon -- add <CODE> single              -> Adds a SINGLE-USE 1-Parasha coupon
//   npm run make-coupon -- add <CODE> multi               -> Adds a MULTI-USE 1-Parasha coupon
//   npm run make-coupon -- add <CODE> single free-all     -> Adds a SINGLE-USE All-54-Parashot VIP coupon
//   npm run make-coupon -- revoke <CODE>                  -> Revokes a coupon (sets active: false)
//   npm run make-coupon -- delete <CODE>                  -> Completely deletes a coupon
//   Add `--push` to any command to automatically commit & push `coupons.json` to GitHub!

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
const LOCAL_NAMES_PATH = join(import.meta.dirname, '..', '.coupons-local.json');

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

function loadLocalNames(): Record<string, string> {
  if (!existsSync(LOCAL_NAMES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LOCAL_NAMES_PATH, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveLocalNames(names: Record<string, string>): void {
  writeFileSync(LOCAL_NAMES_PATH, JSON.stringify(names, null, 2) + '\n', 'utf8');
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
    console.log('Tip: Add `--push` (or run `git add coupons.json && git commit -m "Update coupons" && git push`) to publish online.');
  }
}

const rawArgs = process.argv.slice(2);
const autoPush = rawArgs.includes('--push');
const args = rawArgs.filter((a) => a !== '--push');

const cmd = (args[0] ?? 'list').toLowerCase();
const manifest = loadManifest();
const localNames = loadLocalNames();

if (cmd === 'list') {
  console.log(`=== Your Online Coupons (${MANIFEST_PATH}) ===`);
  console.log(`Live URL: ${ONLINE_COUPONS_URL}`);
  console.log(`Updated:  ${manifest.updatedAt ?? 'never'}\n`);
  if (!manifest.coupons.length) {
    console.log('  (no coupons configured)');
  } else {
    for (const c of manifest.coupons) {
      const keyword = localNames[c.id] ?? c.code ?? '(hashed)';
      const status = c.active ? '🟢 ACTIVE ' : '🔴 REVOKED';
      const use = c.singleUse ? '1x SINGLE-USE' : '∞  MULTI-USE ';
      const scope = c.kind === 'free-all' ? 'All 54 Parashot' : '1 Parasha      ';
      console.log(`  ${status} | Keyword: ${keyword.padEnd(14)} | ${use} | ${scope} | ID: ${c.id}`);
    }
  }
  process.exit(0);
}

if (cmd === 'add') {
  const keyword = args[1];
  if (!keyword) {
    console.error('Usage: npm run make-coupon -- add <CODE> [single|multi] [free-parasha|free-all] [--push]');
    process.exit(1);
  }
  const rest = args.slice(2).map((s) => s.toLowerCase());
  const singleUse = rest.includes('single') || rest.includes('1') || rest.includes('true');
  const kind: CouponKind =
    rest.includes('free-all') || rest.includes('vip') || rest.includes('all')
      ? 'free-all'
      : 'free-parasha';

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
    console.log(`✓ Updated & activated coupon "${keyword}" (${singleUse ? 'SINGLE-USE' : 'MULTI-USE'}, ${kind})`);
  } else {
    manifest.coupons.push(entry);
    console.log(`✓ Created online coupon "${keyword}" (${singleUse ? 'SINGLE-USE' : 'MULTI-USE'}, ${kind})`);
  }
  localNames[id] = keyword;
  saveLocalNames(localNames);
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
      const kw = localNames[c.id] ?? target;
      console.log(`🔴 Revoked coupon "${kw}" (ID: ${c.id})`);
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
  for (const c of manifest.coupons) {
    if (c.id === target || c.sha256 === sha256 || (c.code && normalizeCouponInput(c.code) === norm)) {
      delete localNames[c.id];
    }
  }
  manifest.coupons = manifest.coupons.filter(
    (c) => !(c.id === target || c.sha256 === sha256 || (c.code && normalizeCouponInput(c.code) === norm)),
  );
  if (manifest.coupons.length === before) {
    console.error(`No matching coupon found for "${target}".`);
    process.exit(1);
  }
  saveLocalNames(localNames);
  console.log(`🗑️ Deleted coupon "${target}" from coupons.json`);
  saveManifest(manifest, autoPush, `Delete online coupon`);
  process.exit(0);
}

console.error(`Unknown command "${cmd}". Available commands: list, add, revoke, delete.`);
process.exit(1);
