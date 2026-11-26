// Maps all 54 Parashot (and all 7 Aliyot of each Parasha = 378 recordings) to Asael Israeli's
// real human cantillation recordings on Wikimedia Commons (CC BY-SA 3.0, Ashkenazi cantillation with Israeli pronunciation).

export const ASAEL_PORTION_PREFIX: Record<string, string> = {
  'bereshit': 'Aa Genesis Bereshit',
  'noach': "Ab Genesis No'aḥ",
  'lech-lecha': 'Ac Genesis Lekh Lekha',
  'vayera': 'Ad Genesis Vayyera',
  'chayei-sara': 'Ae Genesis Ḥayyei Sarah',
  'toldot': 'Af Genesis Toledot',
  'vayetzei': 'Ag Genesis Vayyeẓei',
  'vayishlach': 'Ah Genesis Vayyishlaḥ',
  'vayeshev': 'Ai Genesis Vayyeshev',
  'miketz': 'Aj Genesis Miqqeẓ',
  'vayigash': 'Ak Genesis Vayyigash',
  'vayechi': 'Al Genesis Vayḥi',
  'shemot': 'Ba Exodus Shemot',
  'vaera': "Bb Exodus Va'era",
  'bo': 'Bc Exodus Bo',
  'beshalach': 'Bd Exodus Beshallaḥ',
  'yitro': 'Be Exodus Yitro',
  'mishpatim': 'Bf Exodus Mishpatim',
  'terumah': 'Bg Exodus Terumah',
  'tetzaveh': 'Bh Exodus Teẓavveh',
  'ki-tisa': 'Bi Exodus Ki Tissa',
  'vayakhel': 'Bj Exodus Vayyaqhel',
  'pekudei': 'Bk Exodus Pequdei',
  'vayikra': 'Ca Leviticus Vayyiqra',
  'tzav': 'Cb Leviticus Ẓav',
  'shmini': 'Cc Leviticus Shemini',
  'tazria': "Cd Leviticus Tazria'",
  'metzora': "Ce Leviticus Meẓora'",
  'achrei-mot': 'Cf Leviticus Aḥarei Mot',
  'kedoshim': 'Cg Leviticus Qedoshim',
  'emor': 'Ch Leviticus Emor',
  'behar': 'Ci Leviticus Behar',
  'bechukotai': 'Cj Leviticus Beḥuqqotai',
  'bamidbar': 'Da Numbers Bemidbar',
  'nasso': 'Db Numbers Naso',
  'behaalotcha': "Dc Numbers Beha'alotekha",
  'shlach': 'Dd Numbers Shelaḥ',
  'korach': 'De Numbers Qoraḥ',
  'chukat': 'Df Numbers Ḥuqqat',
  'balak': 'Dg Numbers Balaq',
  'pinchas': 'Dh Numbers Pineḥas',
  'matot': 'Di Numbers Mattot',
  'masei': "Dj Numbers Mas'ei",
  'devarim': 'Ea Deuteronomy Devarim',
  'vaetchanan': "Eb Deuteronomy Va'etḥannan",
  'eikev': "Ec Deuteronomy 'Ekev",
  'reeh': "Ed Deuteronomy Re'eh",
  'shoftim': 'Ee Deuteronomy Shofetim',
  'ki-teitzei': 'Ef Deuteronomy Ki Teẓei',
  'ki-tavo': 'Eg Deuteronomy Ki Tavo',
  'nitzavim': 'Eh Deuteronomy Niẓẓavim',
  'vayeilech': 'Ei Deuteronomy Vayelekh',
  'haazinu': "Ej Deuteronomy Ha'azinu",
};

const VZOT_HABERACHAH_FILES: Record<number, string> = {
  1: 'ZGf Simḥat Torah-1 Asael.oga',
  2: 'ZGf Simḥat Torah-2-S3 Asael.oga',
  3: 'ZGf Simḥat Torah-3-S4 Asael.oga',
  4: 'ZGf Simḥat Torah-4-S5 Asael.oga',
  5: 'ZGf Simḥat Torah-5-S6 Asael.oga',
  6: "ZGf Simḥat Torah-6Ḥatanim-0-Ḥatan Me'onah-S7 Asael.oga",
  7: 'ZGf Simḥat Torah-6Ḥatanim-1-Ḥatan Torah Asael.oga',
};

/** Returns the exact Wikimedia Commons filename for `(portionId, aliyah)` (1..7). */
export function asaelCommonsFileName(portionId: string, aliyah: number): string | null {
  if (portionId === 'vzot-haberachah') {
    return VZOT_HABERACHAH_FILES[aliyah] ?? null;
  }
  const prefix = ASAEL_PORTION_PREFIX[portionId];
  if (!prefix || aliyah < 1 || aliyah > 7) return null;
  return `${prefix}-${aliyah} Asael.oga`;
}

/** Returns the direct Wikimedia Commons download URL for `(portionId, aliyah)` (1..7). */
export function asaelCommonsUrl(portionId: string, aliyah: number): string | null {
  const fileName = asaelCommonsFileName(portionId, aliyah);
  if (!fileName) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

import pocketCatalogJson from '../../data/pockettorah-audio-catalog.json';

const POCKET_CATALOG = pocketCatalogJson as Record<string, Record<string, string>>;

/** Returns the exact studio MP3 filename from the PocketTorah/Sefaria corpus for `(portionId, aliyah)` (1..7). */
export function studioAudioFileName(portionId: string, aliyah: number): string | null {
  return POCKET_CATALOG[portionId]?.[String(aliyah)] ?? null;
}

/** Returns the direct GitHub CDN URL for the studio MP3 recording of `(portionId, aliyah)` (1..7). */
export function studioAudioUrl(portionId: string, aliyah: number): string | null {
  const fn = studioAudioFileName(portionId, aliyah);
  if (!fn) return null;
  return `https://raw.githubusercontent.com/rneiss/PocketTorah/master/data/audio/${encodeURIComponent(fn)}`;
}

/** Optional GitHub-hosted pre-aligned timings URL for a Parasha (`reference-timings/<portionId>.json`). */
export function preAlignedTimingsUrl(portionId: string): string {
  return `https://raw.githubusercontent.com/odedBartov/baal-kore/main/reference-timings/${portionId}.json`;
}
