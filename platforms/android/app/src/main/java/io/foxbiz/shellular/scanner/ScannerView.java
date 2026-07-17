package io.foxbiz.shellular.scanner;

import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import android.media.Image;
import android.os.Build;
import android.util.Log;
import android.view.Gravity;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup.LayoutParams;
import android.view.WindowManager;
import android.widget.PopupWindow;
import android.widget.RelativeLayout;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.foxbiz.shellular.utils.Theme;

public class ScannerView extends PopupWindow {

    private final Context context;
    private final PreviewView previewView;
    private Preview preview;
    private ExecutorService executor;
    private ImageAnalysis imageAnalysis;
    private ProcessCameraProvider cameraProvider;
    private Listener listener;

    private float x = 0;
    private float y = 0;

    public ScannerView(Context context, Theme theme) throws Exception {
        super(context);
        this.context = context;
        this.previewView = new PreviewView(context);
        this.preview = new Preview.Builder().build();
        this.imageAnalysis = new ImageAnalysis.Builder().build();

        int rotation = getRotation();

        switch (rotation) {
            case Surface.ROTATION_0:
                preview.setTargetRotation(Surface.ROTATION_0);
                break;
            case Surface.ROTATION_90:
                preview.setTargetRotation(Surface.ROTATION_90);
                break;
            case Surface.ROTATION_180:
                preview.setTargetRotation(Surface.ROTATION_180);
                break;
            case Surface.ROTATION_270:
                preview.setTargetRotation(Surface.ROTATION_270);
                break;
            default:
                throw new Exception("Invalid rotation");
        }

        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(20);
        drawable.setColor(theme.get("popupBackground"));

        RelativeLayout layout = new RelativeLayout(context);
        layout.addView(previewView);
        layout.setLayoutParams(new RelativeLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        previewView.setLayoutParams(new RelativeLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        setElevation(10);
        setContentView(layout);
        setClippingEnabled(false);
        setBackgroundDrawable(drawable);
        setHeight(LayoutParams.MATCH_PARENT);
        setWidth(LayoutParams.MATCH_PARENT);
    }

    public void startCamera() {
        try {
            ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(context);

            executor = Executors.newSingleThreadExecutor();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());
            imageAnalysis.setAnalyzer(executor, new CodeAnalyzer());

            cameraProviderFuture.addListener(
                    () -> {
                        try {
                            cameraProvider = cameraProviderFuture.get();

                            cameraProvider.bindToLifecycle(
                                    (LifecycleOwner) context,
                                    new CameraSelector.Builder().requireLensFacing(CameraSelector.LENS_FACING_BACK).build(),
                                    preview,
                                    imageAnalysis
                            );
                        } catch (ExecutionException | InterruptedException e) {
                            Log.e("ScannerView", "Error starting camera: ", e);
                        }
                    },
                    ContextCompat.getMainExecutor(context)
            );
        } catch (Exception e) {
            Log.e("ScannerView", "Error starting camera: ", e);
        }
    }

    public void setBoundingRect(float x, float w, float y, float h) {
        this.x = x;
        this.y = y;

        setHeight((int) h);
        setWidth((int) w);
    }

    public void show(View view) {
        showAtLocation(view, Gravity.TOP | Gravity.START, (int) x, (int) y);
        startCamera();
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    @Override
    public void dismiss() {
        super.dismiss();
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
            cameraProvider = null;
        }
        if (executor != null) {
            executor.shutdown();
            executor = null;
        }

        if (preview != null) {
            preview.setSurfaceProvider(null);
            preview = null;
        }

        if (imageAnalysis != null) {
            imageAnalysis.clearAnalyzer();
            imageAnalysis = null;
        }
    }

    private int getRotation() {
        if (Build.VERSION.SDK_INT < 30) {
            WindowManager windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            return windowManager.getDefaultDisplay().getRotation();
        }

        return context.getDisplay().getRotation();
    }

    public abstract static class Listener {

        public abstract void onScan(JSONArray barcodes);
    }

    class CodeAnalyzer implements ImageAnalysis.Analyzer {

        @OptIn(markerClass = ExperimentalGetImage.class)
        @Override
        public void analyze(ImageProxy imageProxy) {
            Image image = imageProxy.getImage();

            if (image == null) {
                imageProxy.close();
                return;
            }

            InputImage inputImage = InputImage.fromMediaImage(image, imageProxy.getImageInfo().getRotationDegrees());

            BarcodeScannerOptions options = new BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();

            BarcodeScanner scanner = BarcodeScanning.getClient(options);

            scanner
                    .process(inputImage)
                    .addOnSuccessListener(
                            barcodes -> {
                                imageProxy.close();
                                if (listener == null || barcodes.isEmpty()) return;
                                try {
                                    JSONArray result = getJsonArray(barcodes);
                                    listener.onScan(result);
                                } catch (Exception e) {
                                    Log.e("ScannerView", "onSuccess: ", e);
                                }
                            }
                    );
        }
    }

    @NonNull
    static JSONArray getJsonArray(List<Barcode> barcodes) throws JSONException {
        JSONArray result = new JSONArray();
        for (Barcode barcode : barcodes) {
            JSONObject obj = new JSONObject();
            obj.put("rawValue", barcode.getRawValue());
            obj.put("displayValue", barcode.getDisplayValue());
            obj.put("format", barcode.getFormat());
            obj.put("valueType", barcode.getValueType());
            result.put(obj);
        }
        return result;
    }
}
