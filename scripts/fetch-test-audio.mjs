// Downloads the real-human-voice corpora used by the DSP tests into test-data/ (gitignored).
// Dev-time only; the app never touches the network.
//   vocadito   — 40 solo singing excerpts with musician-annotated f0 (CC-BY-4.0, Zenodo 5578259)
//   CMU ARCTIC — same sentences read by different speakers + phone labels (permissive CMU licence)
//   Wikimedia Commons — real Torah cantillation of Gen 1:1-13 by two readers (CC BY-SA 3.0 / CC BY 2.5)
// Usage: node scripts/fetch-test-audio.mjs   (needs curl; Windows 10+ ships it)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'test-data');
mkdirSync(root, { recursive: true });
const win = process.platform === 'win32';

// ponytail: curl, not fetch — festvox answers undici's request with HTTP 400, zenodo 403s node's UA.
const UA = 'torah-tutor-test-fetch/1.0 (offline Torah-reading tutor POC; dev-time test corpus download) curl';
const curl = (url, dest) => execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-delay', '10', '-A', UA, ...(dest ? ['-o', dest] : []), url]); // wikimedia 429s bursts
const download = (url, dest) => existsSync(dest) || curl(url, dest);

// vocadito
const meta = JSON.parse(curl('https://zenodo.org/api/records/5578259').toString());
const file = meta.files.find((f) => f.key === 'vocadito.zip');
const zip = join(root, 'vocadito.zip');
download(file.links.self, zip);
const md5 = 'md5:' + createHash('md5').update(readFileSync(zip)).digest('hex');
if (md5 !== file.checksum) throw new Error(`vocadito checksum mismatch ${md5} != ${file.checksum}`);
if (!existsSync(join(root, 'zenodo_data'))) {
  // Windows ships bsdtar (reads zip) in System32; Git Bash's GNU tar on PATH does not read zip.
  execFileSync(win ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'unzip', win ? ['-xf', 'vocadito.zip'] : ['-q', 'vocadito.zip'], { cwd: root });
}
console.log('vocadito ok');

// CMU ARCTIC: utterances a0001..a0020 for two male (bdl, rms) and one female (slt) speaker
for (const spk of ['bdl', 'rms', 'slt']) {
  const dir = join(root, 'arctic', spk);
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 20; i++) {
    const id = `arctic_a${String(i).padStart(4, '0')}`;
    const base = `http://festvox.org/cmu_arctic/cmu_arctic/cmu_us_${spk}_arctic`;
    download(`${base}/wav/${id}.wav`, join(dir, `${id}.wav`));
    download(`${base}/lab/${id}.lab`, join(dir, `${id}.lab`));
  }
  console.log(`arctic ${spk} ok`);
}

// Real Torah cantillation, Wikimedia Commons "Cantillation for Parashat Bereshit": the weekday readings
// (0a = Gen 1:1-5, 0b = 1:6-8, 0c = 1:9-13) by two readers. Asael: CC BY-SA 3.0; Nahum: CC BY 2.5.
// Asael recorded each with Ashkenazi and with Israeli pronunciation.
const cant = join(root, 'cantillation');
mkdirSync(cant, { recursive: true });
for (const part of ['0a-Kohen', '0b-Levi', "0c-Yisra'el"]) {
  for (const reader of ['Asael Ashkenaz', 'Asael', 'Nahum']) {
    const name = `Aa Genesis Bereshit-${part} ${reader}.oga`;
    download(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`, join(cant, name));
  }
}
console.log('cantillation ok');
