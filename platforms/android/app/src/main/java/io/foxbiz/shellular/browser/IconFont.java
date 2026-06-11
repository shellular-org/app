package io.foxbiz.shellular.browser;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;

public class IconFont {

    // Codepoints are loaded dynamically from bundle/style.css at runtime.

    private static final java.util.Map<String, String> icons = new java.util.HashMap<>();
    private static boolean cssLoaded = false;

    private static void loadCSS(Context context) {
        if (cssLoaded) return;
        cssLoaded = true;
        try {
            java.io.InputStream in = context.getAssets().open("bundle/style.css");
            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            byte[] tmp = new byte[4096];
            int n;
            while ((n = in.read(tmp)) != -1) buf.write(tmp, 0, n);
            in.close();
            String css = buf.toString("UTF-8");
            // Matches: .icon-NAME:before { ... content: "\XXXX" ... }
            java.util.regex.Pattern p = java.util.regex.Pattern.compile(
                "\\.icon-([^:]+):before\\s*\\{[^}]*content:\\s*[\"']\\\\([0-9a-fA-F]+)[\"']",
                java.util.regex.Pattern.DOTALL);
            java.util.regex.Matcher m = p.matcher(css);
            while (m.find()) {
                String name = m.group(1);
                String cp   = m.group(2);
                if (!icons.containsKey(name)) {
                    icons.put(name, String.valueOf((char) Integer.parseInt(cp, 16)));
                }
            }
        } catch (Exception e) {
            android.util.Log.w("IconFont", "Failed to load style.css: " + e.getMessage());
        }
    }

    /** Returns the Unicode codepoint string for a CSS icon name such as "globe" or "anchor". */
    public static String code(Context context, String name) {
        loadCSS(context);
        return icons.getOrDefault(name, "");
    }


    private static final String FONT_PATH = "bundle/shellular-app.ttf";
    private static Paint paint;
    private static int defaultSize = 24;

    public static Bitmap get(Context context, String name, int size, int color) {
        loadCSS(context);
        String code = icons.getOrDefault(name, name);
        if (paint == null) {
            paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setTypeface(Typeface.createFromAsset(context.getAssets(), FONT_PATH));
            paint.setTextAlign(Paint.Align.CENTER);
        }

        paint.setTextSize(size);
        paint.setColor(color);

        float baseline = -paint.ascent();
        int width = (int) (paint.measureText(code) + 0.5f);
        int height = (int) (baseline + paint.descent() + 0.5f);
        if (width <= 0 || height <= 0) return null;

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawText(code, width / 2f, baseline, paint);
        return bitmap;
    }

    public static Bitmap get(Context context, String name, int color) {
        return get(context, name, defaultSize, color);
    }

    public static Bitmap get(Context context, String name) {
        return get(context, name, defaultSize, Color.WHITE);
    }

    public static void setDefaultSize(int size) {
        defaultSize = size;
    }
}
