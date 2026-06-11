package io.foxbiz.shellular.browser;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;

public class BrowserMenu {

    public interface Callback {
        void onSelect(String action, boolean checked);
    }

    private final Context context;
    private final BrowserTheme theme;
    private final LinearLayout menuLayout;
    private PopupWindow popupWindow;
    private Callback callback;

    private final java.util.LinkedHashMap<String, MenuItem> items = new java.util.LinkedHashMap<>();

    public BrowserMenu(Context context, BrowserTheme theme) {
        this.context = context;
        this.theme = theme;

        menuLayout = new LinearLayout(context);
        menuLayout.setOrientation(LinearLayout.VERTICAL);
        menuLayout.setBackgroundColor(theme.get("popupBackground", theme.get("primary")));
        int pad = dpToPx(8);
        menuLayout.setPadding(pad, pad, pad, pad);
    }

    public void setCallback(Callback callback) {
        this.callback = callback;
    }

    public void addItem(String icon, String label, boolean toggleable) {
        MenuItem item = new MenuItem(icon, label, toggleable);
        items.put(label, item);
        rebuildMenu();
    }

    public void addItem(String icon, String label) {
        addItem(icon, label, false);
    }

    public void setChecked(String label, boolean checked) {
        MenuItem item = items.get(label);
        if (item != null) {
            item.checked = checked;
            updateItemView(item);
        }
    }

    public void setVisible(String label, boolean visible) {
        MenuItem item = items.get(label);
        if (item != null) {
            item.visible = visible;
            if (item.view != null) {
                item.view.setVisibility(visible ? View.VISIBLE : View.GONE);
            }
        }
    }

    public void show(View anchor) {
        rebuildMenu();
        popupWindow = new PopupWindow(
                menuLayout,
                dpToPx(200),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                true
        );
        popupWindow.setElevation(dpToPx(8));
        popupWindow.setOutsideTouchable(true);
        popupWindow.showAsDropDown(anchor, 0, 0, Gravity.END | Gravity.TOP);
    }

    public void dismiss() {
        if (popupWindow != null && popupWindow.isShowing()) {
            popupWindow.dismiss();
        }
    }

    private void rebuildMenu() {
        menuLayout.removeAllViews();
        for (MenuItem item : items.values()) {
            LinearLayout row = createItemRow(item);
            item.view = row;
            if (!item.visible) row.setVisibility(View.GONE);
            menuLayout.addView(row);
        }
    }

    private LinearLayout createItemRow(MenuItem item) {
        int iconSize = dpToPx(20);
        int textColor = theme.get("primaryText");
        int activeColor = theme.get("link", textColor);
        int rowPad = dpToPx(10);

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(rowPad, rowPad, rowPad, rowPad);
        row.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        ImageView iconView = new ImageView(context);
        int color = item.checked ? activeColor : textColor;
        Bitmap bmp = IconFont.get(context, item.icon, iconSize, color);
        if (bmp != null) iconView.setImageBitmap(bmp);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(iconSize, iconSize);
        iconParams.setMarginEnd(dpToPx(10));
        iconView.setLayoutParams(iconParams);
        row.addView(iconView);

        TextView label = new TextView(context);
        label.setText(item.label);
        label.setTextColor(color);
        label.setTextSize(14);
        label.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        row.addView(label);

        item.iconView = iconView;
        item.labelView = label;

        row.setOnClickListener(v -> {
            if (item.toggleable) {
                item.checked = !item.checked;
                updateItemView(item);
            }
            if (callback != null) {
                callback.onSelect(item.label, item.checked);
            }
            dismiss();
        });

        return row;
    }

    private void updateItemView(MenuItem item) {
        if (item.iconView == null || item.labelView == null) return;
        int textColor = theme.get("primaryText");
        int activeColor = theme.get("link", textColor);
        int color = item.checked ? activeColor : textColor;
        int iconSize = dpToPx(20);

        Bitmap bmp = IconFont.get(context, item.icon, iconSize, color);
        if (bmp != null) item.iconView.setImageBitmap(bmp);
        item.labelView.setTextColor(color);
    }

    private int dpToPx(int dp) {
        return (int) (dp * context.getResources().getDisplayMetrics().density);
    }

    private static class MenuItem {
        String icon;
        String label;
        boolean toggleable;
        boolean checked = false;
        boolean visible = true;
        LinearLayout view;
        ImageView iconView;
        TextView labelView;

        MenuItem(String icon, String label, boolean toggleable) {
            this.icon = icon;
            this.label = label;
            this.toggleable = toggleable;
        }
    }
}
