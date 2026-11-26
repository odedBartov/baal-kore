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
 * Decodes a time range of any Android-supported audio file (Ogg Vorbis, MP3, AAC, FLAC, WAV…) into a
 * mono 16-bit WAV at the source sample rate. To avoid Ogg Vorbis page-granule seek/timestamp drift in
 * Android's MediaExtractor, full source files are decoded sequentially from sample 0 once into a cached
 * mono WAV and sliced by exact PCM sample index. Returns the sample rate.
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

    public static int decodeToWav(String src, String dst, long startMs, long endMs) throws IOException {
        if (startMs <= 0 && endMs <= 0) {
            return decodeFullToWav(src, dst);
        }
        File dstFile = new File(dst);
        File parent = dstFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }
        File srcFile = new File(src);
        File fullWav = new File(parent, "_full_" + srcFile.getName() + "_" + srcFile.length() + ".wav");
        if (!isValidWav(fullWav)) {
            File tmp = new File(parent, fullWav.getName() + ".tmp");
            decodeFullToWav(src, tmp.getAbsolutePath());
            if (fullWav.exists()) fullWav.delete();
            if (!tmp.renameTo(fullWav)) {
                decodeFullToWav(src, fullWav.getAbsolutePath());
                tmp.delete();
            }
        }
        return sliceWav(fullWav, dstFile, startMs, endMs);
    }

    private static boolean isValidWav(File f) {
        if (!f.exists() || f.length() <= 44) return false;
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            byte[] h = new byte[44];
            raf.readFully(h);
            ByteBuffer bb = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN);
            int riffSize = bb.getInt(4);
            int rate = bb.getInt(24);
            int dataSize = bb.getInt(40);
            return rate > 0 && dataSize > 0 && (long) riffSize + 8L == f.length() && (long) dataSize + 44L == f.length();
        } catch (IOException e) {
            return false;
        }
    }

    private static int sliceWav(File fullWav, File dstFile, long startMs, long endMs) throws IOException {
        try (RandomAccessFile in = new RandomAccessFile(fullWav, "r")) {
            byte[] h = new byte[44];
            in.readFully(h);
            ByteBuffer bb = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN);
            int rate = bb.getInt(24);
            long totalFrames = (fullWav.length() - 44L) / 2L;
            long startFrame = Math.max(0L, Math.min(totalFrames, Math.round(startMs * (double) rate / 1000.0)));
            long endFrame = endMs > 0 ? Math.max(startFrame, Math.min(totalFrames, Math.round(endMs * (double) rate / 1000.0))) : totalFrames;
            long frames = endFrame - startFrame;
            in.seek(44L + startFrame * 2L);
            try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(dstFile), 1 << 16)) {
                out.write(new byte[44]);
                byte[] buf = new byte[1 << 15];
                long remaining = frames * 2L;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buf.length, remaining);
                    int r = in.read(buf, 0, toRead);
                    if (r <= 0) break;
                    out.write(buf, 0, r);
                    remaining -= r;
                }
            }
            writeHeader(dstFile.getAbsolutePath(), rate, frames);
            return rate;
        }
    }

    private static int decodeFullToWav(String src, String dst) throws IOException {
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

            codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();

            BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(dst), 1 << 16);
            out.write(new byte[44]);
            long frames = 0;
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
                    rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    floatPcm = of.containsKey(MediaFormat.KEY_PCM_ENCODING) && of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                } else if (oi >= 0) {
                    ByteBuffer ob = codec.getOutputBuffer(oi);
                    ob.position(info.offset).limit(info.offset + info.size);
                    ob = ob.slice().order(ByteOrder.nativeOrder());
                    int bytesPerSample = floatPcm ? 4 : 2;
                    int n = info.size / bytesPerSample / channels;
                    byte[] pcm = new byte[n * 2];
                    for (int f = 0; f < n; f++) {
                        float s = 0;
                        for (int c = 0; c < channels; c++) {
                            int p = (f * channels + c) * bytesPerSample;
                            s += floatPcm ? ob.getFloat(p) : ob.getShort(p) / 32768f;
                        }
                        int v = Math.max(-32768, Math.min(32767, Math.round(s / channels * 32767f)));
                        pcm[2 * f] = (byte) v;
                        pcm[2 * f + 1] = (byte) (v >> 8);
                    }
                    out.write(pcm, 0, 2 * n);
                    frames += n;
                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
            out.close();
            writeHeader(dst, rate, frames);
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
