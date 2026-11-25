// Online Coupon System for Ba'al Kore.
// Coupons are NOT hardcoded in the app. Instead, they are managed online via `coupons.json`
// hosted on GitHub (`https://raw.githubusercontent.com/odedBartov/baal-kore/main/coupons.json`).
// This allows the app owner to create new coupons or revoke existing coupons at any time
// without rebuilding or updating the app.

export type CouponKind = 'free-parasha' | 'free-all';

export const ONLINE_COUPONS_URL =
  'https://raw.githubusercontent.com/odedBartov/baal-kore/main/coupons.json';

const COUPON_HASH_SALT = 'BaalKore-OnlineCoupon-2026!#97531';

export interface OnlineCouponEntry {
  /** Unique identifier or label for admin management (e.g. "oded-test-1"). */
  id: string;
  /**
   * Salted SHA-256 hex digest of the normalized coupon code (`hashCouponCode(raw)`).
   * Using `sha256` hides the actual keyword from anyone viewing the public repository.
   */
  sha256?: string;
  /**
   * Optional plain-text coupon code (case-insensitive). Supported so the owner can also
   * add a quick code directly in the GitHub web editor without running the CLI hash tool.
   */
  code?: string;
  /** Whether the coupon unlocks 1 selected Parasha ('free-parasha') or all 54 Parashot ('free-all'). */
  kind: CouponKind;
  /** If false, the coupon is revoked/disabled and will not validate (and previously unlocked Parashot from it are revoked on sync). */
  active: boolean;
  /** If true, can only be redeemed once on a device (ideal for single-Parasha gift codes). If false, can unlock multiple Parashot. */
  singleUse?: boolean;
  /** Optional expiration date in ISO YYYY-MM-DD format. */
  expiresAt?: string;
  /** Optional custom Hebrew confirmation message shown upon redemption. */
  descriptionHe?: string;
}

export interface OnlineCouponsManifest {
  version: number;
  updatedAt?: string;
  coupons: OnlineCouponEntry[];
}

export interface VerifiedCoupon {
  id: string;
  kind: CouponKind;
  descriptionHe: string;
  singleUse: boolean;
}

/** Normalizes user input by trimming, uppercasing, and stripping spaces/hyphens. */
export function normalizeCouponInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

// Pure TypeScript SHA-256 implementation (works identically in Node.js tests and Android V8 without native modules).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const u = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(
        0xf0 | (u >> 18),
        0x80 | ((u >> 12) & 0x3f),
        0x80 | ((u >> 6) & 0x3f),
        0x80 | (u & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

export function sha256Hex(asciiOrUtf8: string): string {
  const msg = utf8Bytes(asciiOrUtf8);
  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

/** Computes the salted SHA-256 hash stored in `coupons.json` for a coupon keyword. */
export function hashCouponCode(rawCode: string): string {
  const normalized = normalizeCouponInput(rawCode);
  return sha256Hex(`${normalized}:${COUPON_HASH_SALT}`);
}

/**
 * Checks a user-entered coupon code against an `OnlineCouponsManifest`.
 * Returns `{ status: 'valid', coupon }` if active and valid,
 * `{ status: 'revoked' }` if found but revoked/expired, or `{ status: 'invalid' }`.
 */
export function verifyCouponAgainstManifest(
  rawCode: string,
  manifest: OnlineCouponsManifest,
  todayIsoStr?: string,
): { status: 'valid'; coupon: VerifiedCoupon } | { status: 'revoked'; messageHe: string } | { status: 'invalid'; messageHe: string } {
  const normalized = normalizeCouponInput(rawCode);
  if (!normalized || !manifest || !Array.isArray(manifest.coupons)) {
    return { status: 'invalid', messageHe: 'קוד הקופון אינו תקין. בדקו שהקלדתם אותו נכון ונסו שוב.' };
  }

  const candidateHash = hashCouponCode(normalized);
  const today = todayIsoStr ?? new Date().toISOString().slice(0, 10);

  for (const entry of manifest.coupons) {
    const matchesHash = Boolean(entry.sha256 && entry.sha256.toLowerCase() === candidateHash);
    const matchesPlain = Boolean(entry.code && normalizeCouponInput(entry.code) === normalized);
    if (!matchesHash && !matchesPlain) continue;

    if (!entry.active) {
      return {
        status: 'revoked',
        messageHe: 'קוד קופון זה בוטל ואינו בתוקף עוד.',
      };
    }

    if (entry.expiresAt && entry.expiresAt < today) {
      return {
        status: 'revoked',
        messageHe: 'תוקף קוד הקופון פג.',
      };
    }

    const defaultDesc =
      entry.kind === 'free-all'
        ? 'קופון VIP אומת אונליין! כל 54 פרשות התורה (כל העליות א׳–ז׳) נפתחו בחינם!'
        : 'הקופון אומת אונליין! כל העליות בפרשה נפתחו בחינם (100% הנחה)!';

    return {
      status: 'valid',
      coupon: {
        id: entry.id || candidateHash.slice(0, 12),
        kind: entry.kind === 'free-all' ? 'free-all' : 'free-parasha',
        descriptionHe: entry.descriptionHe || defaultDesc,
        singleUse: entry.singleUse ?? false,
      },
    };
  }

  return {
    status: 'invalid',
    messageHe: 'קוד הקופון אינו קיים או שאינו תקין. בדקו שהקלדתם אותו נכון ונסו שוב.',
  };
}

/**
 * Returns the list of coupon IDs from `redeemedCouponIds` that have been revoked, expired,
 * or deleted from the online `manifest`.
 */
export function findRevokedCouponIds(
  redeemedCouponIds: string[],
  manifest: OnlineCouponsManifest,
  todayIsoStr?: string,
): string[] {
  if (!redeemedCouponIds.length || !manifest || !Array.isArray(manifest.coupons)) return [];
  const today = todayIsoStr ?? new Date().toISOString().slice(0, 10);
  const activeIds = new Set<string>();
  for (const entry of manifest.coupons) {
    if (!entry.active) continue;
    if (entry.expiresAt && entry.expiresAt < today) continue;
    if (entry.id) activeIds.add(entry.id);
  }
  return redeemedCouponIds.filter((id) => !activeIds.has(id));
}

/** Fetches the live `coupons.json` manifest from GitHub with cache-busting. */
export async function fetchOnlineCouponsManifest(url = ONLINE_COUPONS_URL): Promise<OnlineCouponsManifest> {
  const sep = url.includes('?') ? '&' : '?';
  const cacheBustedUrl = `${url}${sep}t=${Date.now()}`;
  const res = await fetch(cacheBustedUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as OnlineCouponsManifest;
  if (!data || !Array.isArray(data.coupons)) {
    throw new Error('Invalid coupons manifest format');
  }
  return data;
}
