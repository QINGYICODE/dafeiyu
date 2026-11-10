package com.qingyicode.dafeiyu;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int MICROPHONE = 10, FILE_PICKER = 11, SAVE_BACKUP = 12;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout root;
    private LinearLayout cover;
    private TextView status;
    private ProgressBar progress;
    private Button retry;
    private SharedPreferences preferences;
    private String server = "", backupUrl;
    private PermissionRequest microphone;
    private ValueCallback<Uri[]> fileCallback;
    private int generation;
    private long lastBack;
    private boolean mainFrameFailed;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("connection", MODE_PRIVATE);
        server = preferences.getString("server", BuildConfig.DEFAULT_SERVER_URL);
        if (!server.isEmpty()) { try { server = ServerAddress.normalize(server); } catch (IllegalArgumentException ignored) { server = ""; } }
        root = new FrameLayout(this); root.setBackgroundColor(Color.rgb(247, 249, 250)); setContentView(root);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsets.CONSUMED;
        });
        createWebView(); createCover();
        root.requestApplyInsets();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        if (server.isEmpty()) { showStatus("先连接你的小岛\n填写已运行的伙伴服务地址，聊天和记忆会继续留在原来的服务中。", false); connectionDialog(); }
        else if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) connect();
        else cover.setVisibility(View.GONE);
    }

    private void createWebView() {
        web = new WebView(this); root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DafeiyuAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String target = request.getUrl().toString();
                if (!request.isForMainFrame()) return !ServerAddress.sameOrigin(server, target);
                if ("dafeiyu".equals(request.getUrl().getScheme()) && "connection".equals(request.getUrl().getHost()) && trusted()) { connectionDialog(); return true; }
                if (ServerAddress.sameOrigin(server, target)) return false;
                if (request.hasGesture()) openExternal(target);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                cancelMicrophone(); mainFrameFailed = false;
                if (!ServerAddress.sameOrigin(server, url)) { web.stopLoading(); showStatus("已拦截不属于当前伙伴服务的页面。", false); }
            }
            @Override public void onPageFinished(WebView view, String url) { if (!mainFrameFailed && ServerAddress.sameOrigin(server, url)) cover.setVisibility(View.GONE); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { mainFrameFailed = true; showStatus("暂时连不上伙伴服务\n请确认服务已启动，手机可以访问这个 HTTPS 地址。", false); }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) { mainFrameFailed = true; showStatus("伙伴服务暂时没有打开页面（" + response.getStatusCode() + "）。", false); }
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
                sslHandler.cancel(); mainFrameFailed = true;
                showStatus("服务器证书未通过验证\n请使用有效的 HTTPS 证书；自签证书需要在构建时为对应域名单独配置。", false);
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                cancelMicrophone(); root.removeView(web); web.destroy(); createWebView(); cover.bringToFront(); showStatus("页面刚刚休息了一下，点重新连接就能回来。", false); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> {
                cancelMicrophone();
                if (!trusted() || !ServerAddress.sameOrigin(server, request.getOrigin().toString()) || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny(); return; }
                microphone = request;
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) grantMicrophone();
                else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE);
            }); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { runOnUiThread(() -> { if (microphone == request) microphone = null; }); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams parameters) {
                if (!trusted()) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null); fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accepted = Arrays.stream(parameters.getAcceptTypes()).filter(value -> value != null && !value.isEmpty()).toArray(String[]::new);
                intent.setType(accepted.length == 1 && !accepted[0].contains(",") ? accepted[0] : "*/*");
                if (accepted.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, accepted);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, parameters.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, FILE_PICKER); }
                catch (ActivityNotFoundException error) { fileCallback.onReceiveValue(null); fileCallback = null; toast("手机没有可用的文件选择器。"); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message message) {
                if (!trusted() || !userGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    private boolean handled;
                    private void external(String url) { if (handled || "about:blank".equals(url)) return; handled = true; openExternal(url); handler.post(popup::destroy); }
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { external(request.getUrl().toString()); return true; }
                    @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) { external(url); }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup); message.sendToTarget(); return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (!trusted() || !ServerAddress.sameOrigin(server, url) || !"/api/backup".equals(Uri.parse(url).getPath())) { toast("这个文件请在浏览器中打开。"); return; }
            backupUrl = url;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/json"); intent.putExtra(Intent.EXTRA_TITLE, "大肥鱼备份-" + java.time.LocalDate.now() + ".json");
            try { startActivityForResult(intent, SAVE_BACKUP); } catch (ActivityNotFoundException ignored) { backupUrl = null; toast("手机没有可用的文件保存器。"); }
        });
    }

    private void createCover() {
        cover = new LinearLayout(this); cover.setOrientation(LinearLayout.VERTICAL); cover.setGravity(Gravity.CENTER); cover.setPadding(dp(32), dp(32), dp(32), dp(32)); cover.setBackgroundColor(Color.rgb(247, 249, 250));
        root.addView(cover, new FrameLayout.LayoutParams(-1, -1));
        ImageView avatar = new ImageView(this); avatar.setImageResource(R.drawable.dafeiyu_avatar); cover.addView(avatar, new LinearLayout.LayoutParams(dp(112), dp(112)));
        TextView title = new TextView(this); title.setText("大肥鱼"); title.setTextSize(26); title.setTextColor(Color.rgb(41, 59, 71)); title.setGravity(Gravity.CENTER); cover.addView(title);
        status = new TextView(this); status.setTextSize(15); status.setTextColor(Color.rgb(107, 132, 149)); status.setGravity(Gravity.CENTER); status.setLineSpacing(dp(5), 1); status.setPadding(0, dp(20), 0, dp(20)); cover.addView(status);
        progress = new ProgressBar(this); cover.addView(progress, new LinearLayout.LayoutParams(dp(36), dp(36)));
        retry = new Button(this); retry.setText("重新连接"); retry.setOnClickListener(view -> connect()); cover.addView(retry, new LinearLayout.LayoutParams(-1, dp(52)));
        Button settings = new Button(this); settings.setText("设置服务地址"); settings.setOnClickListener(view -> connectionDialog()); cover.addView(settings, new LinearLayout.LayoutParams(-1, dp(52)));
    }
    private void showStatus(String message, boolean loading) { status.setText(message); progress.setVisibility(loading ? View.VISIBLE : View.GONE); retry.setVisibility(!loading && !server.isEmpty() ? View.VISIBLE : View.GONE); cover.setVisibility(View.VISIBLE); cover.bringToFront(); }
    private void connect() {
        if (server.isEmpty()) { connectionDialog(); return; }
        int current = ++generation; mainFrameFailed = false; showStatus("正在回到小岛……", true);
        web.loadUrl(server + "/#chat");
        handler.postDelayed(() -> { if (current == generation && cover.getVisibility() == View.VISIBLE && progress.getVisibility() == View.VISIBLE) showStatus("连接花的时间有点久\n可以重新连接，或检查服务地址。", false); }, 20000);
    }
    private void connectionDialog() {
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(24), dp(8), dp(24), 0);
        TextView explanation = new TextView(this); explanation.setText("连接已运行的大肥鱼伙伴服务。手机与网页版共用聊天、记忆和冲浪记录，厂商密钥仍留在服务端。"); explanation.setTextSize(14); content.addView(explanation);
        EditText address = new EditText(this); address.setSingleLine(true); address.setTextSize(16); address.setHint("https://example.com:38413"); address.setText(server); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); content.addView(address, new LinearLayout.LayoutParams(-1, dp(60)));
        TextView note = new TextView(this); note.setText("请填服务首页地址，不要填 API Key。服务关闭或手机离线时暂时不能聊天。版本 " + BuildConfig.VERSION_NAME); note.setTextSize(12); note.setPadding(0, dp(8), 0, dp(12)); content.addView(note);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("连接你的小岛").setView(content).setNegativeButton("稍后", null).setPositiveButton("保存并连接", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try { String normalized = ServerAddress.normalize(address.getText().toString()); cancelMicrophone(); server = normalized; preferences.edit().putString("server", server).apply(); dialog.dismiss(); web.clearHistory(); connect(); }
            catch (IllegalArgumentException error) { address.setError(error.getMessage()); }
        })); dialog.show();
    }
    private boolean trusted() { return web != null && ServerAddress.sameOrigin(server, web.getUrl()); }
    private void grantMicrophone() {
        PermissionRequest request = microphone; microphone = null;
        if (request == null) return;
        if (trusted() && ServerAddress.sameOrigin(server, request.getOrigin().toString()) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else request.deny();
    }
    private void cancelMicrophone() { if (microphone != null) { microphone.deny(); microphone = null; } }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == MICROPHONE) { grantMicrophone(); if (results.length == 0 || results[0] != PackageManager.PERMISSION_GRANTED) toast("没有麦克风权限，可以继续打字；也可在系统应用权限里开启。"); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && trusted()) {
                if (data.getClipData() != null) { int count = Math.min(4, data.getClipData().getItemCount()); result = new Uri[count]; for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri(); }
                else if (data.getData() != null) result = new Uri[]{data.getData()};
                if (result != null && Arrays.stream(result).anyMatch(uri -> !"content".equals(uri.getScheme()))) result = null;
            }
            fileCallback.onReceiveValue(result); fileCallback = null;
        }
        if (requestCode == SAVE_BACKUP) {
            String url = backupUrl; backupUrl = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && url != null && trusted() && ServerAddress.sameOrigin(server, url)) saveBackup(url, data.getData());
        }
    }
    private void saveBackup(String url, Uri destination) {
        String cookie = CookieManager.getInstance().getCookie(url);
        downloads.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
                if (cookie != null) connection.setRequestProperty("Cookie", cookie);
                if (connection.getResponseCode() != 200) throw new java.io.IOException();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192];
                try (InputStream input = connection.getInputStream()) { int count; while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 8 * 1024 * 1024) throw new java.io.IOException(); bytes.write(buffer, 0, count); } }
                try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) { if (output == null) throw new java.io.IOException(); bytes.writeTo(output); }
                handler.post(() -> toast("备份已保存到手机。"));
            } catch (Exception ignored) { handler.post(() -> toast("备份没有保存完成，请检查连接后重试。")); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    private void openExternal(String url) { if (!ServerAddress.externalWebLink(url)) { toast("这个链接类型暂不支持。"); return; } try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (ActivityNotFoundException ignored) { toast("手机没有可用的浏览器。"); } }
    private void handleBack() {
        if (cover.getVisibility() == View.VISIBLE) { finish(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        long now = android.os.SystemClock.elapsedRealtime(); if (now - lastBack < 2000) finish(); else { lastBack = now; toast("再按一次返回键退出大肥鱼。"); }
    }
    // API 33+ uses the framework OnBackInvokedDispatcher registered in onCreate.
    // Keep the legacy callback for API 26-32 without adding a second dispatcher.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { if (web != null) { if (trusted()) web.evaluateJavascript("window.dispatchEvent(new Event('blur'));document.querySelectorAll('audio').forEach(a=>a.pause());", null); web.onPause(); } super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); cancelMicrophone(); if (fileCallback != null) fileCallback.onReceiveValue(null); fileCallback = null; if (web != null) { root.removeView(web); web.destroy(); web = null; } downloads.shutdownNow(); super.onDestroy(); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
}
