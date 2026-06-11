package io.foxbiz.shellular.lib;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.text.InputType;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;

import org.json.JSONArray;

import java.util.Objects;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class Dialog extends Service {
    private static final String TAG = "Dialog";
    private final Activity activity;

    public Dialog(Context context, WebView webview) {
        super(context, webview);
        this.activity = (Activity) context;
    }

    @Override
    public boolean exec(String action, JSONArray args, Callback callback) {
        if (Objects.equals(action, "alert")) {
            activity.runOnUiThread(() -> alert(args, callback));
            return true;
        }
        if (Objects.equals(action, "confirm")) {
            activity.runOnUiThread(() -> confirm(args, callback));
            return true;
        }
        if (Objects.equals(action, "prompt")) {
            activity.runOnUiThread(() -> prompt(args, callback));
            return true;
        }
        return super.exec(action, args, callback);
    }

    private void alert(JSONArray args, Callback callback) {
        String message = args.optString(0, "");
        String title = args.optString(1, "");

        AlertDialog.Builder builder = new AlertDialog.Builder(activity);
        if (!title.isEmpty()) builder.setTitle(title);
        builder.setMessage(message);
        builder.setPositiveButton(android.R.string.ok, (d, w) -> callback.success());
        builder.setOnCancelListener(d -> callback.success());
        builder.show();
    }

    private void confirm(JSONArray args, Callback callback) {
        String message = args.optString(0, "");
        String title = args.optString(1, "");

        AlertDialog.Builder builder = new AlertDialog.Builder(activity);
        if (!title.isEmpty()) builder.setTitle(title);
        builder.setMessage(message);
        builder.setPositiveButton(android.R.string.ok, (d, w) -> callback.success(true));
        builder.setNegativeButton(android.R.string.cancel, (d, w) -> callback.success(false));
        builder.setOnCancelListener(d -> callback.success(false));
        builder.show();
    }

    private void prompt(JSONArray args, Callback callback) {
        String message = args.optString(0, "");
        String defaultValue = args.optString(1, "");
        String title = args.optString(2, "");

        EditText input = new EditText(activity);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(defaultValue);

        // Add padding so the EditText doesn't hug the dialog edges
        FrameLayout container = new FrameLayout(activity);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        int dp16 = (int) (16 * activity.getResources().getDisplayMetrics().density);
        params.setMargins(dp16, dp16 / 2, dp16, 0);
        input.setLayoutParams(params);
        container.addView(input);

        AlertDialog.Builder builder = new AlertDialog.Builder(activity);
        if (!title.isEmpty()) builder.setTitle(title);
        builder.setMessage(message);
        builder.setView(container);
        builder.setPositiveButton(android.R.string.ok, (d, w) ->
                callback.success(input.getText().toString()));
        builder.setNegativeButton(android.R.string.cancel, (d, w) ->
                callback.success((Object) null));
        builder.setOnCancelListener(d -> callback.success((Object) null));
        builder.show();
    }
}
