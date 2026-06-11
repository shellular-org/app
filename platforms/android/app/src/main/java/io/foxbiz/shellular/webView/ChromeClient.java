package io.foxbiz.shellular.webView;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.util.Arrays;
import java.util.Set;

import io.foxbiz.shellular.MainActivity;

public class ChromeClient extends WebChromeClient {
    public static final int FILE_SELECT_CODE = 1;
    private static final String TAG = "FoxbizChromeClient";
    private final MainActivity activity;
    public ValueCallback<Uri[]> filePathCallback;
    private Uri capturedUri;

    // Request code for runtime permissions triggered by WebView getUserMedia
    private static final int WEBVIEW_PERMISSION_REQUEST_CODE = 12345;

    // Pending PermissionRequest from the WebView while waiting for runtime permissions
    private PermissionRequest pendingPermissionRequest;

    public ChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    public Uri getCapturedUri() {
        Uri capturedUri = this.capturedUri;
        this.capturedUri = null; // Clear the captured URI after retrieval
        return capturedUri;
    }

    @Override
    public Bitmap getDefaultVideoPoster() {
        Log.d(TAG, "getDefaultVideoPoster");
        return Bitmap.createBitmap(50, 50, Bitmap.Config.ARGB_8888);
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        Log.d(TAG, "onPermissionRequest: " + Arrays.toString(request.getResources()));

        // Map WebView resource strings to Android runtime permissions
        Set<String> permsSet = getStrings(request);
        String[] perms = permsSet.toArray(new String[0]);

        // Check which permissions are missing
        java.util.List<String> missing = new java.util.ArrayList<>();
        for (String p : perms) {
            if (ActivityCompat.checkSelfPermission(activity, p) != PackageManager.PERMISSION_GRANTED) {
                missing.add(p);
            }
        }

        if (missing.isEmpty()) {
            // All runtime permissions already granted -> grant the WebView request
            try {
                request.grant(request.getResources());
            } catch (Exception e) {
                Log.e(TAG, "Failed to grant permission request", e);
                request.deny();
            }
            return;
        }

        // Store pending request and ask for runtime permissions
        pendingPermissionRequest = request;
        ActivityCompat.requestPermissions(activity, missing.toArray(new String[0]), WEBVIEW_PERMISSION_REQUEST_CODE);
    }

    @NonNull
    private static Set<String> getStrings(PermissionRequest request) {
        java.util.List<String> needed = new java.util.ArrayList<>();
        for (String r : request.getResources()) {
            switch (r) {
                case PermissionRequest.RESOURCE_VIDEO_CAPTURE:
                    needed.add(Manifest.permission.CAMERA);
                    break;
                case PermissionRequest.RESOURCE_AUDIO_CAPTURE:
                    needed.add(Manifest.permission.RECORD_AUDIO);
                    break;
                default:
                    // Other resources are generally safe to ignore or grant
                    break;
            }
        }

        // Remove duplicates
        return new java.util.HashSet<>(needed);
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        Log.d(TAG, "onPermissionRequestCanceled");
        if (pendingPermissionRequest != null && pendingPermissionRequest.equals(request)) {
            pendingPermissionRequest = null;
        }
        try {
            request.deny();
        } catch (Exception e) {
            Log.e(TAG, "Error denying permission request", e);
        }
    }

    @Override
    public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            WebChromeClient.FileChooserParams params
    ) {
        Log.d(TAG, "onShowFileChooser: " + Arrays.toString(params.getAcceptTypes()));
        this.filePathCallback = filePathCallback;

        Intent filePickerIntent = params.createIntent();

        String[] acceptTypes = params.getAcceptTypes();
        String title = "Select File";

        if(params.getTitle() != null){
            title = params.getTitle().toString();
        }

        Intent cameraIntent = null;
        if(params.isCaptureEnabled() && activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)){
            cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            try{
                File file = File.createTempFile("temp", ".jpg", activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES));
                capturedUri = getContentProviderUri(file);
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, capturedUri);
                cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception e){
                cameraIntent = null;
                Log.e(TAG, "onShowFileChooser: ", e);
            }
        }

        filePickerIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() ==
                WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);


        if(acceptTypes.length > 1){
            filePickerIntent.setType("*/*");
            filePickerIntent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
        }

        Intent intent;
        if(cameraIntent != null){
            intent = Intent.createChooser(cameraIntent, title);
            intent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{filePickerIntent});
        }else{
            intent = Intent.createChooser(filePickerIntent, title);
        }

        ((Activity) activity).startActivityForResult(
                intent,
                FILE_SELECT_CODE
        );
        return true;
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        Log.d(TAG, String.format("JS: %s -- From line %d of %s",
                consoleMessage.message(),
                consoleMessage.lineNumber(),
                consoleMessage.sourceId()
        ));
        return super.onConsoleMessage(consoleMessage);
    }

    private Uri getContentProviderUri(File file) {
        String Id = activity.getPackageName();
        return FileProvider.getUriForFile(activity, Id + ".provider", file);
    }
}
