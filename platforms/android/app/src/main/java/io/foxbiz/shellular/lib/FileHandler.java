package io.foxbiz.shellular.lib;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.URLConnection;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Objects;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class FileHandler extends Service {
    private final static String NOT_FOUND_ERR = "Path does not exist";
    private final static String NOT_FILE_ERR = "Not a file";
    private final static String NOT_DIR_ERR = "Not a directory";
    private final static String ALREADY_EXISTS_ERR = "PATH ALREADY EXISTS";
    private final static String NOT_EMPTY_ERR = "Directory is not empty";

    private final Context context;

    public boolean exec(String action, JSONArray args, Callback callback) {
        if(action.equals("toUrl")){
            ((Activity) context).runOnUiThread(() -> toUrl(args, callback));
            return true;
        }

        return super.exec(action, args, callback);
    }

    public FileHandler(Context context, WebView webView) {
        super(context, webView);
        this.context = context;

        // if there is files directory in rootPath/files copy it to rootPath and delete files and cache dir

        try{
            File filesDir = new File(context.getDataDir().toString(), "files/files");
            if (filesDir.exists()) {
                Log.d("FileHandler", "Files directory exists, copying to root path");
                File newFilesDir = new File(context.getDataDir().toString(), "files");
                // copy all files from filesDir to newFilesDir
                File[] files = filesDir.listFiles();
                Log.d("FileHandler", "Files: " + Arrays.toString(files));
                if (files != null) {
                    for (File file : files) {
                        Log.d("FileHandler", "Copying file: " + file.getAbsolutePath());
                        File newFile = new File(newFilesDir, file.getName());
                        if (!newFile.exists()) {
                            boolean deleted = newFile.delete();
                            if (deleted) {
                                Log.d("FileHandler", "Deleted file: " + newFile.getAbsolutePath());
                            } else {
                                Log.e("FileHandler", "Failed to delete file: " + newFile.getAbsolutePath());
                            }
                        }else{
                            boolean success = file.renameTo(newFile);
                            if (!success) {
                                Log.e("FileHandler", "Failed to move file: " + file.getAbsolutePath());
                            }else{
                                Log.d("FileHandler", "Moved file: " + file.getAbsolutePath() + " to " + newFile.getAbsolutePath());
                                boolean deleted = file.delete();
                                if (deleted) {
                                    Log.d("FileHandler", "Deleted file: " + file.getAbsolutePath());
                                } else {
                                    Log.e("FileHandler", "Failed to delete file: " + file.getAbsolutePath());
                                }
                            }
                        }
                    }
                }

                // delete filesDir
                boolean deleted = filesDir.delete();
                if (!deleted) {
                    Log.e("FileHandler", "Failed to delete files directory: " + filesDir.getAbsolutePath());
                }
                // delete cacheDir
                File cacheDir = new File(context.getDataDir().toString(), "files/cache");
                if (cacheDir.exists()) {
                    boolean cacheDeleted = cacheDir.delete();
                    if (!cacheDeleted) {
                        Log.e("FileHandler", "Failed to delete cache directory: " + cacheDir.getAbsolutePath());
                    }
                }
            }
        }catch (Exception e){
            Log.e("FileHandler", "Error copying files directory: ", e);
        }
    }

    public void saveToDevice(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            String name = args.getString(1);
            String notificationTitle = args.optString(2, "Download Complete");
            String notificationText = args.optString(3, "File downloaded to Downloads folder");
            File sourceFile = new File(path);

            if (!sourceFile.exists()) {
                callback.error(NOT_FOUND_ERR);
                return;
            }

            // Get the Downloads directory
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File destFile = new File(downloadsDir, name);

            // Create a copy of the file
            try (FileInputStream in = new FileInputStream(sourceFile);
                 FileOutputStream out = new FileOutputStream(destFile)) {

                byte[] buffer = new byte[4096];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                out.flush();
            }

            // Make the file visible to the system
            MediaScannerConnection.scanFile(context,
                    new String[] { destFile.getAbsolutePath() },
                    null,
                    (path1, uri) -> {
                        // Show notification
                        showDownloadCompleteNotification(name, destFile, notificationTitle, notificationText);
                    });

            callback.success(destFile.getAbsolutePath());

        } catch (Exception e) {
            Log.e("FileHandler", "Error saving to device: ", e);
            callback.error(e.toString());
        }
    }

    public void read(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);
            if (!file.exists()) {
                callback.error(NOT_FOUND_ERR);
                return;
            }

            if (file.isDirectory()) {
                callback.error(NOT_FILE_ERR);
                return;
            }

            FileInputStream fis = new FileInputStream(file);
            byte[] data = new byte[(int) file.length()];
            int read = fis.read(data);
            fis.close();

            if (read == -1) {
                callback.error("Failed to read file");
                return;
            }

            String content = Base64.encodeToString(data, Base64.DEFAULT);
            JSONObject result = new JSONObject();
            result.put("data", content);
            result.put("isBase64", true);
            callback.success(result);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void write(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            String content = args.getString(1);
            boolean isBase64 = args.optBoolean(2);
            byte[] data;

            if (isBase64) {
                data = Base64.decode(content, Base64.DEFAULT);
            } else {
                data = content.getBytes();
            }

            File file = new File(path);
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(data);
            fos.close();

            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void delete(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            boolean recursive = args.optBoolean(1);
            File file = new File(path);

            if (!file.exists()) {
                callback.error(NOT_FOUND_ERR + ": " + path);
                return;
            }

            if (file.isDirectory()) {
                int files = Objects.requireNonNull(file.listFiles()).length;
                if (files > 0 && !recursive) {
                    callback.error(NOT_EMPTY_ERR);
                    return;
                }

                boolean deleted = true;
                if(files > 0){
                    deleted = deleteDirectoryRecursively(file);
                }else if(!isRootPath(file.getAbsolutePath())){
                    deleted = file.delete();
                }

                if (!deleted) {
                    callback.error("Failed to delete directory: " + file.getAbsolutePath());
                    return;
                }

                callback.success();
            }

            boolean deleted = file.delete();
            if (!deleted) {
                callback.error("Failed to delete file: " + file.getAbsolutePath());
                return;
            }
            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void move(JSONArray args, Callback callback) {
        try {
            String from = resolvePath(args.getString(0));
            String to = resolvePath(args.getString(1));

            File fromFile = new File(from);
            if (!fromFile.exists()) {
                callback.error(NOT_FOUND_ERR);
                return;
            }

            File toFile = new File(to);
            if (toFile.exists()) {
                callback.error(ALREADY_EXISTS_ERR);
                return;
            }

            boolean renamed = fromFile.renameTo(toFile);
            if (!renamed) {
                callback.error("Failed to move file");
                return;
            }
            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void copy(JSONArray args, Callback callback) {
        try {
            String from = resolvePath(args.getString(0));
            String to = resolvePath(args.getString(1));

            File fromFile = new File(from);
            if (!fromFile.exists()) {
                callback.error(NOT_FOUND_ERR);
                return;
            }

            File toFile = new File(to);
            if (toFile.exists()) {
                callback.error(ALREADY_EXISTS_ERR);
                return;
            }

            FileInputStream fis = new FileInputStream(fromFile);
            FileOutputStream fos = new FileOutputStream(toFile);
            byte[] data = new byte[(int) fromFile.length()];
            int read = fis.read(data);
            fos.write(data);
            fis.close();
            fos.close();

            if (read == -1) {
                callback.error("Failed to copy file");
                return;
            }

            callback.success();
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void list(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);

            if (!file.exists()) {
                callback.error(NOT_DIR_ERR);
                return;
            }

            if (!file.isDirectory()) {
                callback.error(NOT_DIR_ERR);
                return;
            }

            JSONArray result = new JSONArray();
            for (File f : Objects.requireNonNull(file.listFiles())) {
                result.put(f.getName());
            }

            callback.success(result);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void exists(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);

            callback.success(file.exists());
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void isDirectory(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);
            callback.success(file.isDirectory());
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void isFile(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);
            callback.success(file.isFile());
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void createDirectory(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);

            if (file.exists()) {
                callback.error(ALREADY_EXISTS_ERR);
                return;
            }

            boolean created = file.mkdirs();

            if (created) {
                callback.success("Directory created");
            } else {
                callback.error("Failed to create directory");
            }
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void createFile(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);

            if (file.exists()) {
                callback.error(ALREADY_EXISTS_ERR);
                return;
            }

            File parentDir = file.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                boolean created = parentDir.mkdirs();
                if (!created) {
                    callback.error("Failed to create parent directory");
                    return;
                }
            }

            boolean created = file.createNewFile();

            if (created) {
                Log.d("FileHandler", "File created: " + file.getAbsolutePath());
                callback.success("File created");
            } else {
                callback.error("Failed to create file");
            }
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void getMetadata(JSONArray args, Callback callback) {
        try {
            String path = resolvePath(args.getString(0));
            File file = new File(path);

            if (!file.exists()) {
                callback.error(NOT_FOUND_ERR);
                return;
            }

            JSONObject result = new JSONObject();
            result.put("name", file.getName());
            result.put("path", file.getAbsolutePath());
            result.put("size", file.length());
            result.put("lastModified", file.lastModified());
            result.put("isDirectory", file.isDirectory());
            callback.success(result);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void reveal(JSONArray args, Callback callback) {
        // Reveal is not supported on Android
        callback.success();
    }

    public void resolve(JSONArray args, Callback callback) {
        try {
            String path = "file://" + resolvePath(args.getString(0));
            callback.success(path);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    public void toUrl(JSONArray args, Callback callback) {
        try {
            String path = args.getString(0);

            // if starts with app's root data path, make it relative
            String rootPath = context.getDataDir().toString();
            if(path.startsWith(rootPath)){
                path = path.substring(rootPath.length());
            }

            if (path.startsWith("/")) {
                path = path.substring(1);
            }

            if (path.startsWith("cache/")) {
                callback.success("shellular://localhost/__cache__"+path.replaceFirst("cache", ""));
                return;
            }

            if (path.startsWith("files/")) {
                callback.success("shellular://localhost/__file__"+path.replaceFirst("files", ""));
                return;
            }

            callback.error("Cannot convert to url, must be a file created by the app");
        } catch (Exception e) {
            Log.e("FileHandler", "Error converting file to URL: ", e);
            callback.error(e.toString());
        }
    }

    private void showDownloadCompleteNotification(String fileName, File file, String notificationTitle, String notificationText) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        // Create notification channel for Android O+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel("downloads", "Downloads", NotificationManager.IMPORTANCE_DEFAULT);
            notificationManager.createNotificationChannel(channel);
        }

        // Create the intent to open the file
        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri fileUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".provider",
                file);
        intent.setDataAndType(fileUri, "*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        // Create notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "downloads")
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(notificationTitle)
                .setContentText(notificationText)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        notificationManager.notify(file.hashCode(), builder.build());
    }

    private boolean deleteDirectoryRecursively(File dir) {
        if (dir.isDirectory()) {
            File[] children = dir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteDirectoryRecursively(child);
                }
            }
        }
        return dir.delete();
    }

    private String resolvePath(String path) {
        String rootPath = context.getDataDir().toString();
        if(path.startsWith(rootPath)){
            return path;
        }
        return path.startsWith("/") ? rootPath + path : rootPath + "/" + path;
    }

    private Uri getContentProviderUri(String fileUri) {
        Uri uri = Uri.parse(fileUri);
        String Id = context.getPackageName();
        File file = new File(Objects.requireNonNull(uri.getPath()));
        uri = FileProvider.getUriForFile(context, Id + ".provider", file);
        return uri;
    }

    private boolean isRootPath(String path){
        return path.equals(context.getDataDir().toString()) || path.equals(context.getCacheDir().getAbsolutePath()) || path.equals(context.getFilesDir().getAbsolutePath());
    }
}
