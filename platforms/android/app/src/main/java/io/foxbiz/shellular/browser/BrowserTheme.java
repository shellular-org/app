package io.foxbiz.shellular.browser;

import android.graphics.Color;

import org.json.JSONObject;

public class BrowserTheme {
    private final JSONObject theme;

    public BrowserTheme(JSONObject theme) {
        this.theme = theme != null ? theme : new JSONObject();
    }

    public int get(String key) {
        return get(key, getDefault(key));
    }

    private String getDefault(String key) {
        boolean light = getType().equals("light");
        switch (key) {
            case "primary":
                return light ? "#FFFFFF" : "#1E1E23";
            case "primaryActiveText":
            case "activeColor":
                return "#4FC3F7";
            default:
                return light ? "#000000" : "#FFFFFF";
        }
    }

    public int get(String key, String fallback) {
        String hex = theme.optString(key, fallback);
        if (hex == null || hex.isEmpty()) {
            hex = fallback;
        }
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException | NullPointerException e) {
            return Color.parseColor(fallback);
        }
    }

    public int get(String key, int fallback) {
        String hex = theme.optString(key, null);
        if (hex == null || hex.isEmpty()) {
            return fallback;
        }
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    public String getType() {
        return theme.optString("type", "dark");
    }
}
