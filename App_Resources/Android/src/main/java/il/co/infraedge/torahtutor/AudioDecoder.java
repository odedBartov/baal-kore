package il.co.infraedge.torahtutor;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Decodes a time range of any Android-supported audio file (Ogg Vorbis, MP3, AAC, FLAC, WAV…) into a
 * mono 16-bit WAV at the source sample rate. Reference recordings stay in their original files; this
 * produces the per-verse PCM the analysis and playback need. Returns the sample rate.
 */
public final class AudioDecoder {
    private AudioDecoder() {
    }

    public static int decodeToWav(String src, String dst, long startMs, long endMs) throws IOException {
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
            long startUs = startMs * 1000L, endUs = endMs > 0 ? endMs * 1000L : Long.MAX_VALUE;
            ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);

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
                        if (n < 0 || ex.getSampleTime() > endUs) {
                            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0);
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
                    int kept = 0;
                    for (int f = 0; f < n; f++) {
                        long t = info.presentationTimeUs + f * 1_000_000L / rate; // trim by timestamp: seeks are approximate
                        if (t < startUs) continue;
                        if (t >= endUs) {
                            outDone = true;
                            break;
                        }
                        float s = 0;
                        for (int c = 0; c < channels; c++) {
                            int p = (f * channels + c) * bytesPerSample;
                            s += floatPcm ? ob.getFloat(p) : ob.getShort(p) / 32768f;
                        }
                        int v = Math.max(-32768, Math.min(32767, Math.round(s / channels * 32767f)));
                        pcm[2 * kept] = (byte) v;
                        pcm[2 * kept + 1] = (byte) (v >> 8);
                        kept++;
                    }
                    out.write(pcm, 0, 2 * kept);
                    frames += kept;
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
