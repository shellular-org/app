package io.foxbiz.shellular.scanner;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;

import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Payload;
import io.foxbiz.shellular.Service;
import io.foxbiz.shellular.utils.Theme;

public class Scanner extends Service {

    private ScannerView scannerView;
    private Callback onScanListener;
    private Callback onHideListener;
    private Callback onShowListener;
    private Theme theme = null;
    private boolean scanOnce = false;

    public Scanner(Context context, WebView webView) {
        super(context, webView);
    }

    public boolean exec(String action, JSONArray args, Callback callback) {
        try {
            final Method method = this.getClass().getDeclaredMethod(action, JSONArray.class, Callback.class);
            ((Activity) context).runOnUiThread(() -> {
                try {
                    method.invoke(this, args, callback);
                } catch (Exception e) {
                    callback.error(e.toString());
                }
            });
            return true;
        } catch (NoSuchMethodException e) {
            callback.error(e.toString());
        }
        return false;
    }

    public void show(JSONArray args, Callback callback) {
        try {
            if (scannerView == null) {
                scannerView = new ScannerView(context, theme);
                scannerView.setListener(
                        new ScannerView.Listener() {
                            @Override
                            public void onScan(JSONArray barcodes) {
                                if (onScanListener == null){
                                    return;
                                }

                                if (scanOnce) {
                                    scannerView.dismiss();
                                    onScanListener.success(barcodes);
                                    onScannerViewHide();
                                    scannerView = null;
                                    return;
                                }

                                onScanListener.sendPayload(new Payload(barcodes, true));
                            }
                        }
                );
            }

            View parent = (View) webview.getParent();
            JSONObject dimension = args.optJSONObject(0);

            if (dimension != null) {
                float x = (float) dimension.optDouble("x");
                float y = (float) dimension.optDouble("y");
                float h = (float) dimension.optDouble("h");
                float w = (float) dimension.optDouble("w");
                scannerView.setBoundingRect(pxToDp(x), pxToDp(w), pxToDp(y), pxToDp(h));
            }

            scannerView.show(parent);
            callback.success();
            onScannerViewShow();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void update(JSONArray args, Callback callback){
        JSONObject dimension = args.optJSONObject(0);
        if (dimension != null) {
            float x = (float) dimension.optDouble("x");
            float y = (float) dimension.optDouble("y");
            float h = (float) dimension.optDouble("h");
            float w = (float) dimension.optDouble("w");
            scannerView.update((int) pxToDp(x), (int) pxToDp(y), (int) pxToDp(w), (int) pxToDp(h));
        }
    }

    public void hide(JSONArray ignoredArgs, Callback callback) {
        try {
            if (scannerView != null) {
                scannerView.dismiss();
                scannerView = null;
            }

            callback.success();
            onScannerViewHide();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void scan(JSONArray args, Callback callback) {
        scanOnce = args.optBoolean(0, false);
        onScanListener = callback;
        Log.d("Scanner", "scanOnce: " + scanOnce);
    }

    public void scanImage(JSONArray args, Callback callback) {
        try {
            String base64 = args.getString(0);
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length);

            if (bitmap == null) {
                callback.error("Could not read this image. Please try another file.");
                return;
            }

            InputImage inputImage = InputImage.fromBitmap(bitmap, 0);
            BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build();
            BarcodeScanner scanner = BarcodeScanning.getClient(options);

            scanner.process(inputImage)
                    .addOnSuccessListener(barcodes -> {
                        if (barcodes.isEmpty()) {
                            callback.error("No QR code was found in this image. Please try another image.");
                            return;
                        }
                        try {
                            callback.success(ScannerView.getJsonArray(barcodes));
                        } catch (Exception e) {
                            callback.error(e.toString());
                        }
                    })
                    .addOnFailureListener(e -> callback.error(e.toString()));
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void setTheme(JSONArray args, Callback callback) {
        try {
            theme = new Theme(args.optJSONObject(0));
            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void setOnShowListener(JSONArray ignoredArgs, Callback callback) {
        onShowListener = callback;
    }

    public void setOnHideListener(JSONArray ignoredArgs, Callback callback) {
        onHideListener = callback;
    }

    private float pxToDp(float px) {
        return px * context.getResources().getDisplayMetrics().density;
    }

    private void onScannerViewHide() {
        scanOnce = false;
        onScanListener = null;
        if (onHideListener == null) return;
        onHideListener.sendPayload(new Payload(null, true));
    }

    private void onScannerViewShow() {
        if (onShowListener == null) return;
        onShowListener.sendPayload(new Payload(null, true));
    }
}
