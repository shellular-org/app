package io.foxbiz.shellular.browser;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.LinkedHashMap;

public class DeviceEmulator extends LinearLayout {

    public interface Callback {
        void onChange(int width, int height, float scale);
    }

    private final BrowserTheme theme;
    private Callback listener;
    private Device selectedDevice;
    private Device customDevice;
    private boolean initialized = false;
    private final LinearLayout seekBarsLayout;
    private final DeviceListView deviceListView;
    private final LinkedHashMap<String, SeekBar> seekBars = new LinkedHashMap<>();

    public DeviceEmulator(Context context, BrowserTheme theme) {
        super(context);
        this.theme = theme;

        customDevice = new Device("Custom", 0, 0, "lock", false);
        deviceListView = new DeviceListView(context, theme);
        deviceListView.setLayoutParams(new LayoutParams(dpToPx(100), LayoutParams.MATCH_PARENT));

        deviceListView.setOnSelect(device -> selectDevice(device));

        deviceListView.add(
                customDevice,
                new Device("iPhone SE", 320, 568, "smartphone"),
                new Device("iPhone 8", 375, 667, "smartphone"),
                new Device("iPhone 8+", 414, 736, "smartphone"),
                new Device("iPhone X", 375, 812, "smartphone"),
                new Device("iPad", 768, 1024, "sidebar"),
                new Device("iPad Pro", 1024, 1366, "sidebar"),
                new Device("Galaxy S5", 360, 640, "smartphone"),
                new Device("Pixel 2", 411, 731, "smartphone"),
                new Device("Pixel 2 XL", 411, 823, "smartphone"),
                new Device("Nexus 5X", 411, 731, "smartphone"),
                new Device("Nexus 7", 600, 960, "sidebar"),
                new Device("Nexus 10", 800, 1280, "sidebar"),
                new Device("Laptop", 1280, 800, "monitor"),
                new Device("Laptop L", 1440, 900, "monitor"),
                new Device("4K", 3840, 2160, "user")
        );

        deviceListView.select(customDevice);

        seekBarsLayout = new LinearLayout(context);
        seekBarsLayout.setPadding(0, 10, 0, 0);
        seekBarsLayout.setOrientation(VERTICAL);
        seekBarsLayout.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, 1));

        View border = new View(context);
        border.setBackgroundColor(theme.get("borderColor", "#333333"));
        border.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, 1));

        LinearLayout main = new LinearLayout(context);
        main.setOrientation(HORIZONTAL);
        main.setBackgroundColor(theme.get("primary"));
        main.addView(seekBarsLayout);
        main.addView(deviceListView);
        main.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

        addControl("width", "Width");
        addControl("height", "Height");
        addControl("scale", "Scale");
        addView(border);
        addView(main);
        setOrientation(VERTICAL);
    }

    public void setChangeListener(Callback listener) {
        this.listener = listener;
    }

    public void setReference(View view) {
        SeekBar widthBar = seekBars.get("width");
        SeekBar heightBar = seekBars.get("height");
        SeekBar scaleBar = seekBars.get("scale");
        if (widthBar == null || heightBar == null || scaleBar == null) return;

        getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                getViewTreeObserver().removeOnGlobalLayoutListener(this);
                int maxWidth = view.getMeasuredWidth();
                int maxHeight = view.getMeasuredHeight() - getHeight();

                widthBar.setMax(maxWidth);
                heightBar.setMax(maxHeight > 0 ? maxHeight : 1);
                widthBar.setProgress(maxWidth);
                heightBar.setProgress(maxHeight);
                setMaxScale(maxWidth, maxHeight);
                scaleBar.setMin(100);
                scaleBar.setProgress(100);
                initialized = true;
                if (listener != null) listener.onChange(maxWidth, maxHeight, 1f);
            }
        });
    }

    public int getWidthProgress() {
        SeekBar sb = seekBars.get("width");
        return sb != null ? sb.getProgress() : 0;
    }

    public int getHeightProgress() {
        SeekBar sb = seekBars.get("height");
        return sb != null ? sb.getProgress() : 0;
    }

    public float getScaleProgress() {
        SeekBar sb = seekBars.get("scale");
        return sb != null ? sb.getProgress() / 100f : 1f;
    }

    private void selectDevice(Device device) {
        if (selectedDevice != null && selectedDevice.view != null) selectedDevice.view.deselect();
        device.view.select();
        selectedDevice = device;
        if (device == customDevice) return;

        SeekBar widthBar = seekBars.get("width");
        SeekBar heightBar = seekBars.get("height");
        SeekBar scaleBar = seekBars.get("scale");
        if (widthBar == null || heightBar == null || scaleBar == null) return;

        int maxW = widthBar.getMax();
        int maxH = heightBar.getMax();
        int w = device.width;
        int h = device.height;

        if (w > maxW) {
            float r = (w - maxW) / (float) w;
            w = maxW;
            h = (int) (h - h * r);
        }
        if (h > maxH) {
            float r = (h - maxH) / (float) h;
            h = maxH;
            w = (int) (w - w * r);
        }

        widthBar.setProgress(w);
        heightBar.setProgress(h);
        setMaxScale(w, h);
        int maxScale = scaleBar.getMax();
        scaleBar.setProgress(maxScale);
        if (listener != null) listener.onChange(w, h, maxScale / 100f);
    }

    private void setMaxScale(int width, int height) {
        SeekBar scaleBar = seekBars.get("scale");
        SeekBar widthBar = seekBars.get("width");
        SeekBar heightBar = seekBars.get("height");
        if (scaleBar == null || widthBar == null || heightBar == null) return;

        int maxW = widthBar.getMax();
        int maxH = heightBar.getMax();
        if (width <= 0 || height <= 0) return;

        float scaleX = maxW / (float) width;
        float scaleY = maxH / (float) height;
        int scale = (int) (Math.min(scaleX, scaleY) * 100);
        scaleBar.setMax(Math.max(scale, 100));
        scaleBar.setProgress(100);
    }

    private void addControl(String id, String label) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(VERTICAL);
        row.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

        TextView tv = new TextView(getContext());
        tv.setText(label);
        tv.setPadding(dpToPx(10), 0, 0, 0);
        tv.setTextColor(theme.get("primaryText"));
        tv.setTextSize(12);

        SeekBar sb = new SeekBar(getContext());
        sb.setMin(300);
        sb.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, dpToPx(40), 1));

        row.addView(tv);
        row.addView(sb);
        seekBarsLayout.addView(row);
        seekBars.put(id, sb);

        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (!fromUser || listener == null) return;
                int w = getWidthProgress();
                int h = getHeightProgress();
                float s = getScaleProgress();

                String name = seekBar == seekBars.get("width") ? "width"
                        : seekBar == seekBars.get("height") ? "height" : "scale";
                if (!name.equals("scale")) {
                    setMaxScale(w, h);
                    s = 1f;
                }
                listener.onChange(w, h, s);
                if (!name.equals("scale") && selectedDevice != null && selectedDevice != customDevice) {
                    selectDevice(customDevice);
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {}

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {}
        });
    }

    private int dpToPx(int dp) {
        return (int) (dp * getContext().getResources().getDisplayMetrics().density);
    }

    // ─── Inner classes ────────────────────────────────────────────

    static class Device {
        final int id;
        final String name;
        final int width;
        final int height;
        final String icon;
        final boolean isDesktop;
        DeviceView view;

        Device(String name, int width, int height, String icon, boolean isDesktop) {
            this.id = View.generateViewId();
            this.name = name;
            this.width = width;
            this.height = height;
            this.icon = icon;
            this.isDesktop = isDesktop;
        }

        Device(String name, int width, int height, String icon) {
            this(name, width, height, icon, true);
        }
    }

    static class DeviceView extends LinearLayout {
        final Device device;
        private final BrowserTheme theme;
        private final ImageView iconView;
        private final TextView labelView;

        DeviceView(Context context, Device device, BrowserTheme theme) {
            super(context);
            this.device = device;
            this.theme = theme;
            int textColor = theme.get("primaryText");

            setId(device.id);
            setClickable(true);
            setPadding(dpToPx(4), dpToPx(5), dpToPx(4), dpToPx(5));
            setOrientation(HORIZONTAL);
            setGravity(Gravity.CENTER_VERTICAL);

            iconView = new ImageView(context);
            Bitmap bmp = IconFont.get(context, device.icon, dpToPx(16), textColor);
            if (bmp != null) iconView.setImageBitmap(bmp);
            LayoutParams iconP = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
            iconP.setMarginEnd(dpToPx(4));
            iconView.setLayoutParams(iconP);

            labelView = new TextView(context);
            labelView.setSingleLine(true);
            labelView.setText(device.name);
            labelView.setTextColor(textColor);
            labelView.setTextSize(11);

            addView(iconView);
            addView(labelView);
        }

        void select() {
            int c = theme.get("link", theme.get("primaryText"));
            Bitmap bmp = IconFont.get(getContext(), device.icon, dpToPx(16), c);
            if (bmp != null) iconView.setImageBitmap(bmp);
            labelView.setTextColor(c);
            labelView.setTypeface(null, Typeface.BOLD);
        }

        void deselect() {
            int c = theme.get("primaryText");
            Bitmap bmp = IconFont.get(getContext(), device.icon, dpToPx(16), c);
            if (bmp != null) iconView.setImageBitmap(bmp);
            labelView.setTextColor(c);
            labelView.setTypeface(null, Typeface.NORMAL);
        }

        private int dpToPx(int dp) {
            return (int) (dp * getContext().getResources().getDisplayMetrics().density);
        }
    }

    static class DeviceListView extends ScrollView {
        interface OnSelectCallback {
            void onSelect(Device device);
        }

        private final LinearLayout listLayout;
        private final BrowserTheme theme;
        private DeviceView selectedView;
        private OnSelectCallback callback;

        DeviceListView(Context context, BrowserTheme theme) {
            super(context);
            this.theme = theme;
            listLayout = new LinearLayout(context);
            listLayout.setOrientation(LinearLayout.VERTICAL);
            listLayout.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
            addView(listLayout);
        }

        void setOnSelect(OnSelectCallback cb) {
            this.callback = cb;
        }

        void add(Device... devices) {
            for (Device d : devices) add(d);
        }

        void add(Device device) {
            DeviceView dv = new DeviceView(getContext(), device, theme);
            device.view = dv;
            listLayout.addView(dv);
            dv.setOnClickListener(v -> {
                if (selectedView != null) selectedView.deselect();
                dv.select();
                selectedView = dv;
                if (callback != null) callback.onSelect(device);
            });
        }

        void select(Device device) {
            DeviceView dv = device.view;
            if (dv != null) {
                if (selectedView != null) selectedView.deselect();
                dv.select();
                selectedView = dv;
            }
        }
    }
}
