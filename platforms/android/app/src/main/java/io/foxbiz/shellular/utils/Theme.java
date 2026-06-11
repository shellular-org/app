package io.foxbiz.shellular.utils;

import android.graphics.Color;
import org.json.JSONObject;

public class Theme {

  private final JSONObject theme;

  public Theme(JSONObject theme) {
    this.theme = theme;
  }

  public int get(String key) {
    return get(key, "#000000");
  }

  public int get(String key, String fallback) {
    String hex = theme.optString(key, fallback);
    return Color.parseColor(hex);
  }

  public String getType() {
    return theme.optString("type", "light");
  }
}
