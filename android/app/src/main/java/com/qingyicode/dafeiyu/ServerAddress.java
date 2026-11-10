package com.qingyicode.dafeiyu;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Shared policy for navigation, microphone permission, downloads and connection settings. */
public final class ServerAddress {
    private ServerAddress() {}
    public static String normalize(String value) {
        try {
            URI uri = new URI(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || !(uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath()))
                    || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT) + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (URISyntaxException | NullPointerException error) { throw new IllegalArgumentException("请填写完整的 HTTPS 服务地址，例如 https://example.com:38413"); }
        catch (IllegalArgumentException error) { throw new IllegalArgumentException("请填写 HTTPS 服务地址，不要包含账号密码、页面路径或查询参数。"); }
    }
    public static boolean sameOrigin(String configured, String candidate) {
        try {
            URI target = new URI(candidate);
            if (target.getUserInfo() != null || target.getHost() == null || !"https".equalsIgnoreCase(target.getScheme())) return false;
            return normalize(configured).equals(normalize("https://" + target.getHost() + (target.getPort() < 0 ? "" : ":" + target.getPort())));
        } catch (Exception ignored) { return false; }
    }
    public static boolean externalWebLink(String value) {
        try { URI uri = new URI(value); return uri.getHost() != null && uri.getUserInfo() == null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())); }
        catch (Exception ignored) { return false; }
    }
}
