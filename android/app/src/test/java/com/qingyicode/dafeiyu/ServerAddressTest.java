package com.qingyicode.dafeiyu;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServerAddressTest {
    @Test public void normalizesHttpsOriginsAndPorts() {
        assertEquals("https://example.com", ServerAddress.normalize(" https://EXAMPLE.com:443/ "));
        assertEquals("https://example.com:38413", ServerAddress.normalize("https://example.com:38413"));
    }
    @Test public void rejectsCredentialAndScriptDestinations() {
        for (String value : new String[]{"http://example.com", "javascript:alert(1)", "file:///tmp/key", "https://a:b@example.com", "https://example.com/path", "https://example.com?key=x", "https://example.com#chat", "https://example.com:0", "https://example.com:99999"}) {
            try { ServerAddress.normalize(value); fail(value); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void microphoneAndDownloadsStayOnExactOrigin() {
        String base = "https://example.com:38413";
        assertTrue(ServerAddress.sameOrigin(base, base + "/#chat"));
        assertFalse(ServerAddress.sameOrigin(base, "https://example.com/api/media"));
        assertFalse(ServerAddress.sameOrigin(base, "https://example.com.evil.test:38413/api"));
        assertFalse(ServerAddress.sameOrigin(base, "https://user@example.com:38413/"));
        assertFalse(ServerAddress.sameOrigin(base, "file:///sdcard/key"));
    }
    @Test public void onlyOrdinaryWebLinksLeaveTheApp() {
        assertTrue(ServerAddress.externalWebLink("https://www.bilibili.com/video/test"));
        assertFalse(ServerAddress.externalWebLink("intent://private"));
        assertFalse(ServerAddress.externalWebLink("javascript:alert(1)"));
        assertFalse(ServerAddress.externalWebLink("https://user:secret@example.com/"));
    }
}
