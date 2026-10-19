package il.co.infraedge.torahtutor;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.nio.channels.FileChannel;
import java.util.HashMap;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * On-device phone model (ZIPA-small CR-CTC int8, CC BY 4.0) via onnxruntime-android, for the niqqud check.
 * Mirrors scripts/lib/phone-model.ts: the 80-dim fbank features are computed in JS (src/app/audio/fbank.ts, the same
 * code the validation used) and passed as a file; the T×V log-probs come back as a file.
 */
public final class PhoneModel {
    private static final int DIM = 80;
    private final OrtEnvironment env;
    private final OrtSession session;

    public PhoneModel(String modelPath, int threads) throws OrtException {
        env = OrtEnvironment.getEnvironment();
        env.setTelemetry(false);
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(threads);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        session = env.createSession(modelPath, o);
    }

    /** featPath: n×80 little-endian float32. Writes [T, V] (int32) then T×V float32 log-probs to outPath; returns T. */
    public int logProbsToFile(String featPath, int n, String outPath) throws IOException, OrtException {
        float[] feats = new float[n * DIM];
        try (RandomAccessFile f = new RandomAccessFile(featPath, "r"); FileChannel ch = f.getChannel()) {
            ch.map(FileChannel.MapMode.READ_ONLY, 0, (long) n * DIM * 4).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(feats);
        }
        Map<String, OnnxTensor> in = new HashMap<>();
        try (OnnxTensor x = OnnxTensor.createTensor(env, FloatBuffer.wrap(feats), new long[]{1, n, DIM});
             OnnxTensor len = OnnxTensor.createTensor(env, LongBuffer.wrap(new long[]{n}), new long[]{1})) {
            in.put("x", x);
            in.put("x_lens", len);
            try (OrtSession.Result r = session.run(in)) {
                OnnxTensor lp = (OnnxTensor) r.get(0);
                long[] shape = lp.getInfo().getShape();
                int T = (int) shape[1], V = (int) shape[2];
                ByteBuffer b = ByteBuffer.allocate(8 + T * V * 4).order(ByteOrder.LITTLE_ENDIAN);
                b.putInt(T).putInt(V);
                FloatBuffer fb = lp.getFloatBuffer();
                float[] all = new float[T * V];
                fb.get(all);
                b.asFloatBuffer().put(all); // starts after the 8-byte header (the view begins at the current position)
                try (FileOutputStream fo = new FileOutputStream(outPath)) {
                    fo.write(b.array());
                }
                return T;
            }
        }
    }

    public void close() throws OrtException {
        session.close();
    }
}
