package life.mf.wallet;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
    private FrameLayout rootView;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 13, 10));
        getWindow().setNavigationBarColor(Color.rgb(11, 13, 10));

        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(11, 13, 10));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 13, 10));
        rootView.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            rootView.setOnApplyWindowInsetsListener((view, insets) -> {
                applySystemBarInsets();
                return insets;
            });
        } else {
            rootView.setFitsSystemWindows(true);
        }
        setContentView(rootView);
        rootView.requestApplyInsets();
        rootView.post(this::applySystemBarInsets);

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void applySystemBarInsets() {
        if (rootView == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        WindowInsets insets = rootView.getRootWindowInsets();
        if (insets == null) return;
        Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        rootView.setPadding(bars.left, bars.top, bars.right, bars.bottom);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
