package il.co.infraedge.torahtutor;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Captures mono 16-bit PCM on its own thread and streams it into a WAV file, so capture never waits on
 * the JS thread (UI work or GC pauses would otherwise drop audio). JS polls level()/error() and calls stop().
 */
public final class PcmRecorder {
    private final int sampleRate;
    private volatile boolean running;
    private volatile float level;
    private volatile long frames;
    private volatile String error;
    private Thread thread;

    public PcmRecorder(int sampleRate) {
        this.sampleRate = sampleRate;
    }

    /** Throws when the microphone cannot be opened (no permission, busy, unsupported rate). */
    public synchronized void start(String path) throws IOException {
        if (thread != null) throw new IllegalStateException("already recording");
        int min = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) throw new IllegalStateException("sample rate " + sampleRate + " not supported");
        // VOICE_RECOGNITION skips AGC and heavy noise suppression on most devices, keeping pitch and level honest.
        final AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, sampleRate * 2)); // >= 1 s
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
            rec.release();
            throw new IllegalStateException("microphone could not be opened");
        }
        final RandomAccessFile out;
        try {
            out = new RandomAccessFile(path, "rw");
            out.setLength(0);
            out.write(new byte[44]); // header is written on stop, once the length is known
        } catch (IOException e) {
            rec.release();
            throw e;
        }
        rec.startRecording();
        if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            rec.release();
            out.close();
            throw new IllegalStateException("microphone is in use by another app");
        }
        frames = 0;
        level = 0;
        error = null;
        running = true;
        thread = new Thread(() -> capture(rec, out), "PcmRecorder");
        thread.start();
    }

    private void capture(AudioRecord rec, RandomAccessFile out) {
        short[] buf = new short[sampleRate / 20]; // 50 ms
        byte[] bytes = new byte[buf.length * 2];
        try {
            while (running) {
                int n = rec.read(buf, 0, buf.length);
                if (n < 0) throw new IllegalStateException("AudioRecord.read failed: " + n);
                double sum = 0;
                for (int i = 0; i < n; i++) {
                    short s = buf[i];
                    sum += (double) s * s;
                    bytes[2 * i] = (byte) s;
                    bytes[2 * i + 1] = (byte) (s >> 8);
                }
                out.write(bytes, 0, 2 * n);
                frames += n;
                level = n > 0 ? (float) (Math.sqrt(sum / n) / 32768.0) : 0f;
            }
        } catch (Exception e) {
            error = e.toString();
        } finally {
            running = false;
            try {
                rec.stop();
            } catch (Exception ignored) {
            }
            rec.release();
            try {
                writeHeader(out, frames);
                out.close();
            } catch (IOException e) {
                if (error == null) error = e.toString();
            }
        }
    }

    /** Stops capture and finalises the WAV header; returns the number of samples written. */
    public long stop() throws InterruptedException {
        Thread t;
        synchronized (this) {
            t = thread;
            thread = null;
        }
        running = false;
        if (t != null) t.join();
        return frames;
    }

    public boolean isRecording() {
        return running;
    }

    /** RMS of the last 50 ms, 0..1. */
    public float level() {
        return level;
    }

    public long frames() {
        return frames;
    }

    public String error() {
        return error;
    }

    private void writeHeader(RandomAccessFile f, long samples) throws IOException {
        int data = (int) (samples * 2);
        ByteBuffer h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        h.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + data).put("WAVE".getBytes(StandardCharsets.US_ASCII));
        h.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1)
                .putInt(sampleRate).putInt(sampleRate * 2).putShort((short) 2).putShort((short) 16);
        h.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(data);
        f.seek(0);
        f.write(h.array());
    }
}
