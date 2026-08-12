import assert from "node:assert/strict";
import test from "node:test";
import { parseDesktopOAuthConfig } from "../app/google-oauth-config";

test("desktop OAuth config imports the installed client ID and secret", () => {
  assert.deepEqual(parseDesktopOAuthConfig(JSON.stringify({
    installed: {
      client_id: " desktop-client.apps.googleusercontent.com ",
      client_secret: " GOCSPX-desktop-secret ",
    },
  })), {
    clientId: "desktop-client.apps.googleusercontent.com",
    clientSecret: "GOCSPX-desktop-secret",
  });
});

test("desktop OAuth config accepts clients that do not receive a secret", () => {
  assert.deepEqual(parseDesktopOAuthConfig(JSON.stringify({
    installed: { client_id: "desktop-client.apps.googleusercontent.com" },
  })), {
    clientId: "desktop-client.apps.googleusercontent.com",
    clientSecret: "",
  });
});

test("desktop OAuth config rejects web credentials and malformed JSON", () => {
  assert.throws(() => parseDesktopOAuthConfig("{"), /không hợp lệ/);
  assert.throws(() => parseDesktopOAuthConfig(JSON.stringify({
    web: { client_id: "web-client.apps.googleusercontent.com", client_secret: "secret" },
  })), /Desktop app/);
});
