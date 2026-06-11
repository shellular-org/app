package io.foxbiz.shellular.webView;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.WebView;
import android.text.InputType;

public class AppView extends WebView {
    public static final int SUGGESTIONS_DEFAULT = 0;
    public static final int NO_SUGGESTIONS = 1;
    public static final int NO_SUGGESTIONS_AGGRESSIVE = 2;

    private int inputType = SUGGESTIONS_DEFAULT;

    public AppView(Context context) {
        super(context);
    }

    public AppView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setInputType(int type) {
        this.inputType = type;
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (inputType == NO_SUGGESTIONS) {
            outAttrs.inputType |= InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
        } else if (inputType == NO_SUGGESTIONS_AGGRESSIVE) {
            outAttrs.inputType = InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                    | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD;
        }
        return ic;
    }
}
