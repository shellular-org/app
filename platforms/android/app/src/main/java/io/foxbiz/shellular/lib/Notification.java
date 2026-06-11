package io.foxbiz.shellular.lib;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Payload;
import io.foxbiz.shellular.R;
import io.foxbiz.shellular.Service;

public class Notification extends Service {

    private static final String CHANNEL_ID = "io.foxbiz.shellular.notification";
    private static final String CHANNEL_NAME = "Shellular notification";
    private final Activity activity;
    private final HashMap<Integer, NotificationCompat.Builder> notifications = new HashMap<Integer, NotificationCompat.Builder>();
    private final HashMap<Integer, Callback> notificationCallbacks = new HashMap<Integer, Callback>();
    private int notificationCount = 99;

    public Notification(Context context, WebView webView) {
        super(context, webView);
        this.activity = (Activity) context;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermission();
        }
    }

    public void onNewIntent(Intent intent) {
        String action = intent.getAction();
        if (action == null || !action.equals("notification")) {
            return;
        }

        int notificationId = intent.getIntExtra("notificationId", 0);
        Callback callback = notificationCallbacks.get(notificationId);
        if (callback == null) {
            return;
        }

        callback.sendPayload(new Payload(null, true));
    }

    public void create(JSONArray args, Callback callback) {
        String title = args.optString(0);
        String message = args.optString(1);
        JSONObject options = args.optJSONObject(2);
        int notificationId = notificationCount++;

        // options has silent, vibrate, re-notify, and icon

        try {
            Intent intent = new Intent(context, activity.getClass());

            intent.putExtra("notificationId", notificationId);
            intent.setAction("notification");
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);

            PendingIntent pendingIntent = PendingIntent.getActivity(context, notificationId, intent, PendingIntent.FLAG_IMMUTABLE);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                requestPermission();
            }
            createNotificationChannel();
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID).setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(message).setContentIntent(pendingIntent).setPriority(NotificationCompat.PRIORITY_HIGH);

            if (options != null) {
                if (options.has("silent")) {
                    boolean silent = options.optBoolean("silent");
                    if (silent) {
                        builder.setSound(null);
                    }
                }

                if (options.has("vibrate")) {
                    boolean vibrate = options.optBoolean("vibrate");
                    if (vibrate) {
                        builder.setVibrate(new long[]{1000, 1000, 1000, 1000, 1000});
                    }
                }

                if (options.has("renotify")) {
                    boolean renotify = options.optBoolean("renotify");
                    if (renotify) {
                        builder.setOnlyAlertOnce(false);
                    }
                }

                if (options.has("icon")) {
                    String icon = options.optString("icon");
                    int iconId = context.getResources().getIdentifier(icon, "drawable", context.getPackageName());
                    if (iconId != 0) {
                        builder.setSmallIcon(iconId);
                    }
                }
            }

            notifications.put(notificationId, builder);
            callback.success(notificationId);
        } catch (Exception error) {
            callback.error(error.toString());
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.TIRAMISU)
    public void show(JSONArray args, Callback callback) {
        int notificationId = args.optInt(0);
        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
        NotificationCompat.Builder builder = notifications.get(notificationId);

        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
            return;
        }
        assert builder != null;
        notificationManager.notify(notificationId, builder.build());
        callback.success();
    }

    public void hide(JSONArray args, Callback callback) {
        int notificationId = args.optInt(0);
        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
        notificationManager.cancel(notificationId);
        callback.success();
    }

    public void delete(JSONArray args, Callback callback) {
        int notificationId = args.optInt(0);
        notifications.remove(notificationId);
        notificationCallbacks.remove(notificationId);

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
        notificationManager.cancel(notificationId);

        callback.success();
    }

    public void addListener(JSONArray args, Callback callback) {
        try {
            int notificationId = args.optInt(0);
            notificationCallbacks.put(notificationId, callback);
        } catch (Exception error) {
            callback.error(error.toString());
        }
    }

    public void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (notificationManager != null) {
                    int importance = NotificationManager.IMPORTANCE_HIGH;
                    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance);
                    channel.setDescription("Channel description");
                    notificationManager.createNotificationChannel(channel);
                    Log.d("Notification", "Notification channel created: " + CHANNEL_ID);
                } else {
                    Log.e("Notification", "NotificationManager is null");
                }
            } catch (Exception e) {
                Log.e("Notification", "Error creating notification channel: " + e.getMessage(), e);
            }
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.TIRAMISU)
    private void requestPermission() {
        if (ActivityCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }
}
