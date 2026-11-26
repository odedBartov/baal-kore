package com.baalkore.app;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Fast native audio downloader and range decoder for Ba'al Kore.
 * Decodes only the requested [startMs .. endMs] slice of any Android-supported audio file
 * (Ogg Vorbis, MP3, AAC, FLAC, WAV…) into a mono 16-bit WAV, stopping immediately once `endMs` is reached
 * so a 5-second verse inside a 6-minute Aliyah file decodes in ~40 ms instead of 6 seconds.
 */
public final class AudioDecoder {
    private AudioDecoder() {
    }

    /**
     * Downloads a remote file (e.g. an Asael Israeli Aliyah .oga recording from Wikimedia Commons or pre-aligned timings JSON)
     * to `dstPath` if not already cached locally. Follows HTTP/HTTPS redirects and writes atomically via a `.tmp` file.
     * Returns true if the file exists (or was downloaded) with size > 0, or false if the remote URL returned 404.
     */
    public static boolean downloadIfMissing(String urlStr, String dstPath) throws IOException {
        File dstFile = new File(dstPath);
        if (dstFile.exists() && dstFile.length() > 64) {
            return true;
        }
        File parent = dstFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        File tmpFile = new File(dstPath + ".tmp");
        String currentUrl = urlStr;
        HttpURLConnection conn = null;
        try {
            for (int redirects = 0; redirects < 6; redirects++) {
                URL url = new URL(currentUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("User-Agent", "BaalKoreTorahTutor/1.0 (https://github.com/odedBartov/baal-kore; Android)");
                int code = conn.getResponseCode();
                if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP || code == HttpURLConnection.HTTP_SEE_OTHER || code == 307 || code == 308) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null || loc.isEmpty()) throw new IOException("Redirect without Location header");
                    currentUrl = loc;
                    continue;
                }
                if (code == HttpURLConnection.HTTP_NOT_FOUND) {
                    return false;
                }
                if (code < 200 || code >= 300) {
                    throw new IOException("HTTP " + code + " from " + currentUrl);
                }
                try (InputStream in = conn.getInputStream();
                     BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(tmpFile), 1 << 16)) {
                    byte[] buf = new byte[1 << 15];
                    int r;
                    while ((r = in.read(buf)) > 0) {
                        out.write(buf, 0, r);
                    }
                }
                if (dstFile.exists()) dstFile.delete();
                if (!tmpFile.renameTo(dstFile)) {
                    throw new IOException("Failed to move downloaded file to " + dstPath);
                }
                return dstFile.length() > 0;
            }
            throw new IOException("Too many redirects for " + urlStr);
        } finally {
            if (conn != null) conn.disconnect();
            if (tmpFile.exists()) tmpFile.delete();
        }
    }

    public static String readTextFile(String path) {
        File f = new File(path);
        if (!f.exists() || f.length() == 0) return "";
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            byte[] b = new byte[(int) f.length()];
            raf.readFully(b);
            return new String(b, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    public static void writeTextFile(String path, String content) throws IOException {
        File f = new File(path);
        File parent = f.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Returns the duration of an audio file in milliseconds using MediaExtractor header metadata (~1 ms). */
    public static long getDurationMs(String src) {
        MediaExtractor ex = new MediaExtractor();
        try {
            ex.setDataSource(src);
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/") && f.containsKey(MediaFormat.KEY_DURATION)) {
                    return Math.max(1000L, f.getLong(MediaFormat.KEY_DURATION) / 1000L);
                }
            }
        } catch (Exception ignored) {
        } finally {
            ex.release();
        }
        return 180000L;
    }

    /**
     * Decodes [startMs .. endMs] of `src` directly to a 16-bit mono WAV at `dst`.
     * Seeks near `startMs` when far into the file and halts decoding as soon as `endMs` is reached.
     */
    public static int decodeToWav(String src, String dst, long startMs, long endMs) throws IOException {
        File dstFile = new File(dst);
        File parent = dstFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        MediaExtractor ex = new MediaExtractor();
        MediaCodec codec = null;
        try {
            ex.setDataSource(src);
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    ex.selectTrack(i);
                    fmt = f;
                    break;
                }
            }
            if (fmt == null) throw new IOException("no audio track in " + src);
            int rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            boolean floatPcm = false;

            // If startMs is more than 12 seconds into the file, seek to 1.5s before startMs so we don't decode minutes of preceding audio.
            long currentFrame = 0;
            if (startMs > 12000L) {
                long seekTargetUs = Math.max(0L, (startMs - 1500L) * 1000L);
                ex.seekTo(seekTargetUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                long actualUs = ex.getSampleTime();
                if (actualUs > 0 && actualUs <= startMs * 1000L) {
                    currentFrame = Math.round((actualUs / 1_000_000.0) * rate);
                } else {
                    ex.seekTo(0L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                    currentFrame = 0;
                }
            }

            long startFrame = startMs > 0 ? Math.round((startMs / 1000.0) * rate) : 0L;
            long endFrame = endMs > 0 ? Math.round((endMs / 1000.0) * rate) : Long.MAX_VALUE;

            codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();

            int estSamples = (endMs > startMs && endMs < Long.MAX_VALUE)
                    ? (int) Math.min(rate * 180L, ((endMs - startMs) * rate) / 1000L + rate * 2L)
                    : rate * 30;
            float[] rawSamples = new float[Math.max(4096, estSamples)];
            int sampleCount = 0;

            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inDone = false, outDone = false;
            while (!outDone) {
                if (!inDone) {
                    int ii = codec.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer b = codec.getInputBuffer(ii);
                        int n = ex.readSampleData(b, 0);
                        if (n < 0) {
                            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            long pts = Math.max(0L, ex.getSampleTime());
                            codec.queueInputBuffer(ii, 0, n, pts, 0);
                            ex.advance();
                        }
                    }
                }
                int oi = codec.dequeueOutputBuffer(info, 10000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = codec.getOutputFormat();
                    int newRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    if (newRate != rate) {
                        currentFrame = Math.round(currentFrame * ((double) newRate / rate));
                        rate = newRate;
                        startFrame = startMs > 0 ? Math.round((startMs / 1000.0) * rate) : 0L;
                        endFrame = endMs > 0 ? Math.round((endMs / 1000.0) * rate) : Long.MAX_VALUE;
                    }
                    channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    floatPcm = of.containsKey(MediaFormat.KEY_PCM_ENCODING) && of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                } else if (oi >= 0) {
                    ByteBuffer ob = codec.getOutputBuffer(oi);
                    ob.position(info.offset).limit(info.offset + info.size);
                    ob = ob.slice().order(ByteOrder.nativeOrder());
                    int bytesPerSample = floatPcm ? 4 : 2;
                    int n = info.size / bytesPerSample / channels;

                    long bufStartFrame = currentFrame;
                    long bufEndFrame = currentFrame + n;
                    currentFrame = bufEndFrame;

                    if (bufEndFrame > startFrame && bufStartFrame < endFrame) {
                        int f0 = (int) Math.max(0L, startFrame - bufStartFrame);
                        int f1 = (int) Math.min((long) n, endFrame - bufStartFrame);
                        int count = Math.max(0, f1 - f0);
                        if (count > 0) {
                            if (sampleCount + count > rawSamples.length) {
                                int newCap = Math.max(rawSamples.length * 2, sampleCount + count + rate);
                                float[] grown = new float[newCap];
                                System.arraycopy(rawSamples, 0, grown, 0, sampleCount);
                                rawSamples = grown;
                            }
                            for (int i = 0; i < count; i++) {
                                int f = f0 + i;
                                float s = 0;
                                for (int c = 0; c < channels; c++) {
                                    int p = (f * channels + c) * bytesPerSample;
                                    s += floatPcm ? ob.getFloat(p) : ob.getShort(p) / 32768f;
                                }
                                rawSamples[sampleCount++] = s / channels;
                            }
                        }
                    }

                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0 || currentFrame >= endFrame) {
                        outDone = true;
                    }
                }
            }

            masterVocalTrack(rawSamples, sampleCount, rate);

            try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(dstFile), 1 << 16)) {
                out.write(new byte[44]);
                byte[] pcm = new byte[Math.min(sampleCount, 16384) * 2];
                int pos = 0;
                while (pos < sampleCount) {
                    int chunk = Math.min(16384, sampleCount - pos);
                    for (int i = 0; i < chunk; i++) {
                        int v = Math.max(-32768, Math.min(32767, Math.round(rawSamples[pos + i] * 32767f)));
                        pcm[2 * i] = (byte) v;
                        pcm[2 * i + 1] = (byte) (v >> 8);
                    }
                    out.write(pcm, 0, chunk * 2);
                    pos += chunk;
                }
            }
            writeHeader(dstFile.getAbsolutePath(), rate, sampleCount);
            return rate;
        } finally {
            if (codec != null) {
                try {
                    codec.stop();
                } catch (Exception ignored) {
                }
                codec.release();
            }
            ex.release();
        }
    }

    /**
     * Broadcast-grade vocal restoration & mastering chain for Torah cantillation recordings:
     * 1. 105 Hz High-Pass Filter (removes low-frequency rumble & DC offset).
     * 2. If the recording has the 2009 Audacity FFT spectral-ringing & +20 dB 350-750 Hz boxiness hump (hot RMS > -14 dB),
     *    applies a 480 Hz Peaking Cut (-6.5 dB, Q=0.85) + 2300 Hz Presence Boost (+3.0 dB, Q=0.8) + smooth inter-word
     *    downward noise-gate expander to silence the -15..-20 dB electronic "musical noise" warble during pauses.
     * 3. Normalizes RMS loudness to match Bereshit (-16.8 dB RMS) with a smooth tanh soft-knee limiter at 0.75.
     */
    private static void masterVocalTrack(float[] x, int n, int rate) {
        if (n < 256 || rate <= 0) return;

        // Measure initial RMS to detect hot/over-processed 2009 recordings (like Lech-Lecha at -11.4 dB RMS)
        double sumSq0 = 0;
        for (int i = 0; i < n; i++) sumSq0 += (double) x[i] * x[i];
        double rms0 = Math.sqrt(sumSq0 / n);
        double rmsDb0 = 20.0 * Math.log10(Math.max(1e-7, rms0));

        // 1. 1st-order High-Pass Filter at 105 Hz
        float hpR = (float) Math.exp((-2.0 * Math.PI * 105.0) / rate);
        float prevX = 0f, prevY = 0f;
        for (int i = 0; i < n; i++) {
            float s = x[i];
            prevY = s - prevX + hpR * prevY;
            prevX = s;
            x[i] = prevY;
        }

        // 2. De-boxiness & De-ringing EQ + Smooth Inter-Word Downward Expander on hot/noisy recordings
        if (rmsDb0 > -14.8) {
            applyPeakingBiquad(x, n, rate, 480.0, -6.5, 0.85);
            applyPeakingBiquad(x, n, rate, 2300.0, 3.0, 0.80);

            // Compute 12 ms short-term envelope and apply smooth downward expansion below the vocal gate threshold
            int win = Math.max(64, (int) Math.round(rate * 0.012));
            double gateThresh = rms0 * 0.34; // ~ -9.5 dB below mean RMS (catches the -15..-20 dB inter-word FFT ringing)
            float envGain = 1.0f;
            float attack = (float) Math.exp(-1.0 / (rate * 0.004));
            float release = (float) Math.exp(-1.0 / (rate * 0.025));

            double runSq = 0;
            for (int i = 0; i < Math.min(n, win); i++) runSq += (double) x[i] * x[i];
            for (int i = 0; i < n; i++) {
                if (i + win < n) runSq += (double) x[i + win] * x[i + win];
                if (i >= win) runSq -= (double) x[i - win] * x[i - win];
                double localRms = Math.sqrt(Math.max(0.0, runSq) / (2 * win));
                float targetG = localRms >= gateThresh
                        ? 1.0f
                        : (float) Math.max(0.18, Math.pow(localRms / Math.max(1e-6, gateThresh), 1.6));
                envGain = targetG > envGain
                        ? attack * envGain + (1.0f - attack) * targetG
                        : release * envGain + (1.0f - release) * targetG;
                x[i] *= envGain;
            }
        }

        // 3. RMS Normalization to -16.8 dB (matching Bereshit) + soft-knee tanh limiter at 0.75
        double sumSq1 = 0;
        for (int i = 0; i < n; i++) sumSq1 += (double) x[i] * x[i];
        double rms1 = Math.sqrt(sumSq1 / n);
        double targetRms = Math.pow(10.0, -16.8 / 20.0);
        float gain = (float) Math.min(1.8, targetRms / Math.max(1e-5, rms1));
        for (int i = 0; i < n; i++) {
            double v = x[i] * gain;
            x[i] = (float) (Math.tanh(v / 0.75) * 0.75);
        }
    }

    private static void applyPeakingBiquad(float[] x, int n, int rate, double f0, double dBgain, double Q) {
        double A = Math.pow(10.0, dBgain / 40.0);
        double w0 = (2.0 * Math.PI * f0) / rate;
        double alpha = Math.sin(w0) / (2.0 * Q);
        double a0 = 1.0 + alpha / A;
        float b0 = (float) ((1.0 + alpha * A) / a0);
        float b1 = (float) ((-2.0 * Math.cos(w0)) / a0);
        float b2 = (float) ((1.0 - alpha * A) / a0);
        float a1 = (float) ((-2.0 * Math.cos(w0)) / a0);
        float a2 = (float) ((1.0 - alpha / A) / a0);
        float x1 = 0f, x2 = 0f, y1 = 0f, y2 = 0f;
        for (int i = 0; i < n; i++) {
            float s = x[i];
            float out = b0 * s + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = s;
            y2 = y1;
            y1 = out;
            x[i] = out;
        }
    }

    static void writeHeader(String path, int rate, long frames) throws IOException {
        int data = (int) (frames * 2);
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + data).put("WAVE".getBytes(StandardCharsets.US_ASCII));
        h.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1)
                .putInt(rate).putInt(rate * 2).putShort((short) 2).putShort((short) 16);
        h.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(data);
        try (RandomAccessFile f = new RandomAccessFile(path, "rw")) {
            f.seek(0);
            f.write(h.array());
        }
    }
}
