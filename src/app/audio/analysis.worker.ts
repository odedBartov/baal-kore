// All heavy audio work runs here, off the UI thread. Only file paths and small plain results cross the
// boundary (NativeScript worker messages are serialised). Native helpers (Java) are callable from workers.
import '@nativescript/core/globals';
import { getFileAccess } from '@nativescript/core';
import { synthesizeCantillationWav, SYNTH_SAMPLE_RATE } from './cantillation-synth';
import { alignAliyahRecording, type AlignableVerse, type AlignedVerseTiming } from './aliyah-align';
import { asaelCommonsUrl, preAlignedTimingsUrl } from '../torah/asael-catalog';
import { decodeWav, encodeWav, resample } from './wav';
import { detectPitch, medianVoicedHz, signalQuality, type PitchFrame, type SignalQuality } from './pitch';
import { mfcc } from './mfcc';
import { compareContours, dtw, type ContourComparison } from './align';
import { evaluate, type EvalCharts, type EvalWord, type MelodyConfig } from '../analysis/evaluate';
import { K } from '../analysis/ctc';
import type { VerseEvaluation } from '../analysis/types';
import { checkLesson, cutPhrase, type LessonCheck } from '../teaching/lesson-check';
import type { VerseData } from '../torah/model';
import ctcModel from '../../data/ctc-model.json';
import phoneModel from '../../data/phone-model.json';
import { fbank } from './fbank';
import { tokenIndex, type PhoneLogProbs } from '../analysis/vowels';

const RATE = 16000;

declare const com: {
  baalkore: {
    app: {
      AudioDecoder: {
        decodeToWav(src: string, dst: string, startMs: number, endMs: number): number;
        downloadIfMissing(url: string, dst: string): boolean;
      };
      PhoneModel: new (modelPath: string, threads: number) => { logProbsToFile(featPath: string, n: number, out: string): number };
      CtcModel: {
        new (modelPath: string, columns: string, threads: number): { logProbsToFile(wav: string, out: string): number };
        hasAsset(name: string): boolean;
        ensureAsset(name: string): string;
      };
    };
  };
};

export type WorkerRequest =
  | { type: 'decode'; src: string; dst: string; startMs: number; endMs: number }
  | {
      type: 'prepare-asael-verse';
      portionId: string;
      aliyah: number;
      verseId: string;
      dstWav: string;
      cacheDir: string;
      portionVerses: AlignableVerse[];
    }
  | { type: 'synth-reference'; dst: string; verse: VerseData }
  | { type: 'clip'; src: string; dst: string; words: { startMs: number; endMs: number }[]; first: number; last: number }
  | { type: 'contour'; wav: string }
  | { type: 'ctc-status' }
  | {
      type: 'evaluate';
      verseId: string;
      words: EvalWord[];
      groups: { words: number[]; taam: string | null }[];
      studentWav: string;
      referenceWav: string | null;
      referenceWords: { startMs: number; endMs: number }[] | null;
      referenceApproval: 'approved' | 'pending' | 'missing';
      passingThreshold: number;
      pronunciation: 'israeli' | 'ashkenazi';
      melody?: Partial<MelodyConfig>;
    }
  | { type: 'lesson'; studentWav: string; referenceWav: string; maxDeviation: number; spokenWords: string[] } // referenceWav: the phrase clip
  | { type: 'compare'; paths: string[] }; // diagnostics screen

export interface ContourResult {
  durationMs: number;
  medianHz: number | null;
  semitones: (number | null)[];
  quality: SignalQuality;
}
export interface CtcStatus {
  available: boolean;
  reasonHe?: string;
  loadMs?: number;
}
export interface CompareResult {
  recordings: { path: string; frames: PitchFrame[]; medianHz: number | null; quality: SignalQuality; timingsMs: Record<string, number> }[];
  alignment: { aToB: number[]; normalizedCost: number; comparison: ContourComparison; dtwMs: number } | null;
}
export interface PreparedVerseResult {
  startMs: number;
  endMs: number;
  words: { startMs: number; endMs: number; confidence: number }[];
  timingQuality: 'good' | 'check';
}
export type WorkerResult =
  | { sampleRate: number }
  | { startMs: number; endMs: number }
  | PreparedVerseResult
  | ContourResult
  | CtcStatus
  | { evaluation: VerseEvaluation; charts: EvalCharts; timingsMs: Record<string, number> }
  | LessonCheck
  | CompareResult
  | Record<string, never>;

const ctx = self as unknown as { onmessage: (m: { data: { id: number; req: WorkerRequest } }) => void; postMessage(r: { id: number; ok: boolean; result?: WorkerResult; error?: string }): void };

const read16k = (path: string) => {
  const buf = getFileAccess().readBufferSync(path, (e: unknown) => {
    throw new Error(`cannot read ${path}: ${e}`);
  });
  const w = decodeWav(buf);
  return resample(w.samples, w.sampleRate, RATE);
};

/**
 * Writes bytes to a file. core's writeBufferSync cannot marshal a JS buffer into Java inside a worker (and swallows
 * the error), so the bytes go into a direct Java ByteBuffer viewed zero-copy from JS, then out through a channel.
 */
function writeBytes(path: string, data: ArrayBuffer): void {
  const bb = java.nio.ByteBuffer.allocateDirect(data.byteLength);
  new Uint8Array((ArrayBuffer as unknown as { from(b: java.nio.ByteBuffer): ArrayBuffer }).from(bb)).set(new Uint8Array(data));
  const out = new java.io.FileOutputStream(path);
  try {
    out.getChannel().write(bb);
  } finally {
    out.close();
  }
}

let ctcInstance: { logProbsToFile(wav: string, out: string): number } | null = null;
let ctcStatus: CtcStatus | null = null;
function ensureCtc(): CtcStatus {
  if (ctcStatus) return ctcStatus;
  const T = com.baalkore.app;
  if (!T.CtcModel.hasAsset(ctcModel.asset)) return (ctcStatus = { available: false, reasonHe: 'רכיב זיהוי המילים אינו מותקן במכשיר זה.' });
  try {
    const t = Date.now();
    ctcInstance = new T.CtcModel(T.CtcModel.ensureAsset(ctcModel.asset), ctcModel.columns.map((c: number[]) => c.join('|')).join(','), 4);
    return (ctcStatus = { available: true, loadMs: Date.now() - t });
  } catch (e) {
    return (ctcStatus = { available: false, reasonHe: `לא ניתן לטעון את רכיב זיהוי המילים (${e}).` });
  }
}

let phoneInstance: { logProbsToFile(featPath: string, n: number, out: string): number } | null = null;
let phoneStatus: CtcStatus | null = null;
const phoneIdx = tokenIndex(phoneModel.tokens);
function ensurePhones(): CtcStatus {
  if (phoneStatus) return phoneStatus;
  const T = com.baalkore.app;
  if (!T.CtcModel.hasAsset(phoneModel.asset)) return (phoneStatus = { available: false, reasonHe: 'רכיב בדיקת הניקוד אינו מותקן במכשיר זה.' });
  try {
    const t = Date.now();
    phoneInstance = new T.PhoneModel(T.CtcModel.ensureAsset(phoneModel.asset), 4);
    return (phoneStatus = { available: true, loadMs: Date.now() - t });
  } catch (e) {
    return (phoneStatus = { available: false, reasonHe: `לא ניתן לטעון את רכיב בדיקת הניקוד (${e}).` });
  }
}

/** ZIPA log-probs for 16 kHz audio: features in JS (the code the validation used), inference in Java. */
function phonesFor(x: Float32Array, wav16k: string): (PhoneLogProbs & { idx: Map<string, number> }) | null {
  if (!ensurePhones().available) return null;
  const f = fbank(x), feat = wav16k + '.fb', out = wav16k + '.ph';
  writeBytes(feat, f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer);
  phoneInstance!.logProbsToFile(feat, f.n, out);
  const buf = getFileAccess().readBufferSync(out), h = new Int32Array(buf.slice(0, 8));
  return { T: h[0], V: h[1], lp: new Float32Array(buf.slice(8)), idx: phoneIdx };
}

/** Student recordings are 16 kHz WAV already, as the model needs. */
function ctcFor(wav16k: string): { lp: Float32Array; T: number } | null {
  if (!ensureCtc().available) return null;
  const out = wav16k + '.lp';
  const T = ctcInstance!.logProbsToFile(wav16k, out);
  const lp = new Float32Array(getFileAccess().readBufferSync(out));
  return { lp: lp.subarray(0, T * K), T };
}

function contour(wav: string): ContourResult {
  const x = read16k(wav);
  const frames = detectPitch(x, RATE);
  const med = medianVoicedHz(frames);
  return { durationMs: (x.length / RATE) * 1000, medianHz: med, semitones: frames.map((f) => (f.frequencyHz && med ? +(12 * Math.log2(f.frequencyHz / med)).toFixed(2) : null)), quality: signalQuality(x, RATE, frames) };
}

function readJsonMap(filePath: string): Record<string, AlignedVerseTiming> {
  try {
    const f = new java.io.File(filePath);
    if (!f.exists() || f.length() < 2) return {};
    const bytes = java.nio.file.Files.readAllBytes(f.toPath());
    const str = String(new java.lang.String(bytes, java.nio.charset.StandardCharsets.UTF_8));
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      return (parsed.verses && typeof parsed.verses === 'object' ? parsed.verses : parsed) as Record<string, AlignedVerseTiming>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeJsonMap(filePath: string, data: Record<string, AlignedVerseTiming>): void {
  const f = new java.io.File(filePath);
  const parent = f.getParentFile();
  if (parent && !parent.exists()) parent.mkdirs();
  const jStr = new java.lang.String(JSON.stringify(data));
  java.nio.file.Files.write(f.toPath(), jStr.getBytes(java.nio.charset.StandardCharsets.UTF_8), java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
}

/**
 * Downloads (if needed) Asael Israeli's real human Aliyah recording from Wikimedia Commons,
 * aligns it against the Masoretic Torah text using on-device CTC forced alignment (or pre-aligned timings from GitHub),
 * caches the timings for the whole Aliyah, and extracts the requested verse WAV.
 */
function prepareAsaelVerse(req: Extract<WorkerRequest, { type: 'prepare-asael-verse' }>): PreparedVerseResult {
  const timingsPath = `${req.cacheDir}/timings-${req.portionId}.json`;
  const timingsFile = new java.io.File(timingsPath);

  // 1. Try downloading pre-aligned timings JSON from GitHub if we don't have local timings yet
  if (!timingsFile.exists() || timingsFile.length() < 10) {
    try {
      com.baalkore.app.AudioDecoder.downloadIfMissing(preAlignedTimingsUrl(req.portionId), timingsPath);
    } catch {
      // Ignore network/404 if pre-aligned file is not on GitHub yet; we will align on-device below.
    }
  }

  const timingsMap = readJsonMap(timingsPath);

  const alignOneAliyah = (al: number) => {
    const url = asaelCommonsUrl(req.portionId, al);
    if (!url) throw new Error(`לא נמצאה הקלטת קורא לעלייה ${al} בפרשה זו.`);
    const ogaPath = `${req.cacheDir}/${req.portionId}-aliyah-${al}.oga`;
    const ok = com.baalkore.app.AudioDecoder.downloadIfMissing(url, ogaPath);
    if (!ok) throw new Error(`לא ניתן להוריד את הקלטת העלייה (${req.portionId} עלייה ${al}). בדקו חיבור לאינטרנט.`);

    const fullWavPath = `${req.cacheDir}/${req.portionId}-aliyah-${al}-full.wav`;
    com.baalkore.app.AudioDecoder.decodeToWav(ogaPath, fullWavPath, 0, 0);
    const x = read16k(fullWavPath);
    const wav16kPath = `${req.cacheDir}/${req.portionId}-aliyah-${al}-16k.wav`;
    writeBytes(wav16kPath, encodeWav(x, RATE));
    const ctc = ctcFor(wav16kPath);
    try {
      new java.io.File(fullWavPath).delete();
      new java.io.File(wav16kPath).delete();
      new java.io.File(wav16kPath + '.lp').delete();
    } catch {
      // ignore cleanup errors
    }

    const aligned = alignAliyahRecording(x, ctc, req.portionVerses, al);
    Object.assign(timingsMap, aligned);
    writeJsonMap(timingsPath, timingsMap);
  };

  if (!timingsMap[req.verseId]) {
    alignOneAliyah(req.aliyah);
  }
  // Handle Tikkun Aliyah split differences (e.g. if Asael split Aliyah N/N+1 a few verses earlier or later than Sefaria)
  if (!timingsMap[req.verseId] && req.aliyah > 1) {
    alignOneAliyah(req.aliyah - 1);
  }
  if (!timingsMap[req.verseId] && req.aliyah < 7) {
    alignOneAliyah(req.aliyah + 1);
  }

  const vt = timingsMap[req.verseId];
  if (!vt) {
    throw new Error(`לא ניתן היה לתזמן את פסוק ${req.verseId} מתוך הקלטת העלייה.`);
  }

  const targetAliyah = vt.aliyahFile || req.aliyah;
  const ogaUrl = asaelCommonsUrl(req.portionId, targetAliyah)!;
  const ogaPath = `${req.cacheDir}/${req.portionId}-aliyah-${targetAliyah}.oga`;
  com.baalkore.app.AudioDecoder.downloadIfMissing(ogaUrl, ogaPath);
  com.baalkore.app.AudioDecoder.decodeToWav(ogaPath, req.dstWav, Math.round(vt.startMs), Math.round(vt.endMs));

  return {
    startMs: vt.startMs,
    endMs: vt.endMs,
    words: vt.words.map(([s, e, c]) => ({
      startMs: Math.max(0, s - vt.startMs),
      endMs: Math.max(40, e - vt.startMs),
      confidence: c,
    })),
    timingQuality: vt.quality,
  };
}

function handle(req: WorkerRequest): WorkerResult {
  switch (req.type) {
    case 'decode':
      return { sampleRate: com.baalkore.app.AudioDecoder.decodeToWav(req.src, req.dst, Math.round(req.startMs), Math.round(req.endMs)) };
    case 'prepare-asael-verse':
      return prepareAsaelVerse(req);
    case 'synth-reference': {
      const wavBuf = synthesizeCantillationWav(req.verse);
      writeBytes(req.dst, wavBuf);
      return { sampleRate: SYNTH_SAMPLE_RATE };
    }
    case 'clip': {
      const w = decodeWav(getFileAccess().readBufferSync(req.src));
      const c = cutPhrase(w.samples, w.sampleRate, req.words, req.first, req.last);
      writeBytes(req.dst, encodeWav(c.samples, w.sampleRate));
      return { startMs: c.startMs, endMs: c.endMs };
    }
    case 'contour':
      return contour(req.wav);
    case 'ctc-status':
      return ensureCtc();
    case 'evaluate': {
      const timings: Record<string, number> = {};
      let t = Date.now();
      const student = read16k(req.studentWav);
      const reference = req.referenceWav ? read16k(req.referenceWav) : null;
      timings.read = Date.now() - t;
      t = Date.now();
      const ctc = ctcFor(req.studentWav);
      timings.ctc = Date.now() - t;
      t = Date.now();
      const phones = phonesFor(student, req.studentWav);
      timings.phones = Date.now() - t;
      t = Date.now();
      const out = evaluate({ ...req, student, reference, ctc, phones });
      timings.analysis = Date.now() - t;
      return { ...out, timingsMs: timings };
    }
    case 'lesson':
      return checkLesson(read16k(req.studentWav), read16k(req.referenceWav), RATE, req.maxDeviation, ctcFor(req.studentWav), req.spokenWords);
    case 'compare': {
      const feats: ReturnType<typeof mfcc>[] = [];
      const recordings = req.paths.map((path) => {
        let t = Date.now();
        const x = read16k(path);
        const decode = Date.now() - t;
        t = Date.now();
        const frames = detectPitch(x, RATE);
        const pitch = Date.now() - t;
        t = Date.now();
        feats.push(mfcc(x, RATE));
        return { path, frames, medianHz: medianVoicedHz(frames), quality: signalQuality(x, RATE, frames), timingsMs: { decode, pitch, mfcc: Date.now() - t } };
      });
      let alignment: CompareResult['alignment'] = null;
      if (recordings.length === 2) {
        const t = Date.now();
        const al = dtw(feats[0], feats[1]);
        alignment = { aToB: Array.from(al.aToB), normalizedCost: al.normalizedCost, comparison: compareContours(recordings[0].frames, recordings[1].frames, al.aToB), dtwMs: Date.now() - t };
      }
      return { recordings, alignment };
    }
  }
}

ctx.onmessage = ({ data: { id, req } }) => {
  try {
    ctx.postMessage({ id, ok: true, result: handle(req) });
  } catch (e) {
    ctx.postMessage({ id, ok: false, error: String((e as Error)?.message ?? e) });
  }
};
