package il.co.infraedge.torahtutor;

import android.content.Context;
import android.content.res.AssetFileDescriptor;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.channels.FileChannel;
import java.util.Collections;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * On-device CTC acoustic model (Omnilingual ASR CTC-300M int8, Apache-2.0) via onnxruntime-android.
 * Mirrors scripts/lib/ctc-model.ts: 30 s windows with 2 s context, log-softmax, and only the columns the
 * aligner needs (see src/app/analysis/ctc.ts) are written out, so a few KB — not 20 MB — reach JS.
 */
public final class CtcModel {
    private static final int STRIDE = 320, RF = 400, OWN = 1500, CTX = 100, PAD = 20; // PAD frames = 0.4 s of silence each side
    private final OrtEnvironment env;
    private final OrtSession session;
    private final int[][] cols; // model token ids feeding each reduced column ("anything else" excluded)
    private boolean[] keep;

    /** columnTokenIds: columns separated by ',', the token ids of one column by '|' (see ctc.ts columnTokenIds). */
    public CtcModel(String modelPath, String columnTokenIds, int threads) throws OrtException {
        String[] p = columnTokenIds.split(",");
        cols = new int[p.length][];
        for (int i = 0; i < p.length; i++) {
            String[] q = p[i].split("\\|");
            cols[i] = new int[q.length];
            for (int j = 0; j < q.length; j++) cols[i][j] = Integer.parseInt(q[j].trim());
        }
        env = OrtEnvironment.getEnvironment();
        env.setTelemetry(false); // no remote telemetry (spec §2); the network permission is stripped as well
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(threads);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        session = env.createSession(modelPath, o);
    }

    /** Reads a 16 kHz mono 16-bit WAV, writes T×K little-endian float32 log-probs to outPath, returns T. */
    public int logProbsToFile(String wavPath, String outPath) throws IOException, OrtException {
        float[] audio = readWav16k(wavPath);
        float[] x = new float[audio.length + 2 * PAD * STRIDE]; // silence around the audio, as in ctc-model.ts
        System.arraycopy(audio, 0, x, PAD * STRIDE, audio.length);
        int T = x.length < RF ? 0 : (x.length - RF) / STRIDE + 1;
        int K = cols.length + 1;
        float[] out = new float[T * K];
        for (int own0 = 0; own0 < T; own0 += OWN) {
            int own1 = Math.min(T, own0 + OWN), f0 = Math.max(0, own0 - CTX), f1 = Math.min(T, own1 + CTX);
            int a = f0 * STRIDE, n = (f1 - 1) * STRIDE + RF - a;
            float[] w = new float[n];
            double mean = 0, sd = 0;
            for (int i = 0; i < n; i++) mean += x[a + i];
            mean /= n;
            for (int i = 0; i < n; i++) sd += (x[a + i] - mean) * (x[a + i] - mean);
            sd = Math.sqrt(sd / n) + 1e-7;
            for (int i = 0; i < n; i++) w[i] = (float) ((x[a + i] - mean) / sd);
            try (OnnxTensor in = OnnxTensor.createTensor(env, FloatBuffer.wrap(w), new long[]{1, n});
                 OrtSession.Result r = session.run(Collections.singletonMap("x", in))) {
                OnnxTensor logits = (OnnxTensor) r.get(0);
                long[] shape = logits.getInfo().getShape();
                int Tw = (int) shape[1], V = (int) shape[2];
                FloatBuffer fb = logits.getFloatBuffer();
                float[] row = new float[V];
                for (int g = own0; g < own1; g++) {
                    int f = g - f0;
                    if (f >= Tw) break;
                    fb.position(f * V);
                    fb.get(row);
                    reduce(row, out, g * K);
                }
            }
        }
        int keepT = audio.length < RF ? 0 : (audio.length - RF) / STRIDE + 1;
        ByteBuffer b = ByteBuffer.allocate(keepT * K * 4).order(ByteOrder.LITTLE_ENDIAN);
        b.asFloatBuffer().put(out, PAD * K, keepT * K);
        try (FileOutputStream fo = new FileOutputStream(outPath)) {
            fo.write(b.array());
        }
        return keepT;
    }

    /** Same as reduceLogits in ctc.ts: log-softmax, log-sum over each column's tokens, then the best unused token. */
    private void reduce(float[] row, float[] out, int at) {
        if (keep == null || keep.length != row.length) {
            keep = new boolean[row.length];
            for (int[] c : cols) for (int id : c) keep[id] = true;
        }
        float max = Float.NEGATIVE_INFINITY, otherMax = Float.NEGATIVE_INFINITY;
        for (int v = 0; v < row.length; v++) {
            float l = row[v];
            if (l > max) max = l;
            if (!keep[v] && l > otherMax) otherMax = l;
        }
        double sum = 0;
        for (float l : row) sum += Math.exp(l - max);
        double lse = max + Math.log(sum);
        for (int k = 0; k < cols.length; k++) {
            double p = 0;
            for (int id : cols[k]) p += Math.exp(row[id] - max);
            out[at + k] = (float) (max + Math.log(p) - lse);
        }
        out[at + cols.length] = (float) (otherMax - lse);
    }

    public void close() throws OrtException {
        session.close();
    }

    private static float[] readWav16k(String path) throws IOException {
        try (RandomAccessFile f = new RandomAccessFile(path, "r"); FileChannel ch = f.getChannel()) {
            ByteBuffer b = ch.map(FileChannel.MapMode.READ_ONLY, 0, ch.size()).order(ByteOrder.LITTLE_ENDIAN);
            int pos = 12, rate = 0, channels = 0, bits = 0;
            while (pos + 8 <= b.limit()) {
                String id = "" + (char) b.get(pos) + (char) b.get(pos + 1) + (char) b.get(pos + 2) + (char) b.get(pos + 3);
                int size = b.getInt(pos + 4);
                if (id.equals("fmt ")) {
                    channels = b.getShort(pos + 10);
                    rate = b.getInt(pos + 12);
                    bits = b.getShort(pos + 22);
                } else if (id.equals("data")) {
                    if (rate != 16000 || channels != 1 || bits != 16) throw new IOException("expected 16 kHz mono 16-bit WAV, got " + rate + "/" + channels + "/" + bits);
                    int n = Math.min(size, b.limit() - pos - 8) / 2;
                    float[] x = new float[n];
                    for (int i = 0; i < n; i++) x[i] = b.getShort(pos + 8 + 2 * i) / 32768f;
                    return x;
                }
                pos += 8 + size + (size & 1);
            }
            throw new IOException("no data chunk in " + path);
        }
    }

    /** True when the model ships in the APK (it is optional: without it, word checks report "unavailable"). */
    public static boolean hasAsset(String assetName) {
        try (InputStream ignored = context().getAssets().open(assetName)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** Copies an (uncompressed) APK asset to app storage once and returns its path — ORT needs a real file. */
    public static String ensureAsset(String assetName) throws IOException {
        Context ctx = context();
        File dst = new File(ctx.getFilesDir(), assetName);
        long size;
        try (AssetFileDescriptor fd = ctx.getAssets().openFd(assetName)) {
            size = fd.getLength();
        }
        if (dst.exists() && dst.length() == size) return dst.getAbsolutePath();
        File tmp = new File(dst.getPath() + ".tmp");
        dst.getParentFile().mkdirs();
        try (InputStream in = ctx.getAssets().open(assetName); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 20];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        }
        if (!tmp.renameTo(dst)) throw new IOException("cannot move model into place");
        return dst.getAbsolutePath();
    }

    private static Context context() {
        return com.tns.NativeScriptApplication.getInstance();
    }
}
