import assert from "node:assert/strict";
import test from "node:test";
import { prepareDriveAuthorization, requestDriveToken } from "../app/google-drive";

type TokenOptions = {
  callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
  error_callback?: (error: { type?: string }) => void;
};

async function withGoogleTokenClient(
  request: (options: TokenOptions) => void,
  run: () => Promise<void>,
) {
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const previous = runtime.window;
  runtime.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (options: TokenOptions) => ({
            callback: options.callback,
            requestAccessToken: () => request(options),
          }),
          revoke: () => undefined,
        },
      },
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  } as unknown as Window;
  try {
    await run();
  } finally {
    if (previous) runtime.window = previous;
    else delete runtime.window;
  }
}

test("web Drive authorization can be prepared before the connect gesture", async () => {
  await withGoogleTokenClient(() => undefined, async () => {
    await prepareDriveAuthorization();
  });
});

test("web Drive authorization resolves the token callback", async () => {
  await withGoogleTokenClient((options) => options.callback({ access_token: "token-web" }), async () => {
    assert.equal(await requestDriveToken("web.apps.googleusercontent.com"), "token-web");
  });
});

test("closing or blocking the Google popup rejects instead of spinning forever", async () => {
  for (const [type, message] of [
    ["popup_closed", /đã bị đóng/],
    ["popup_failed_to_open", /đã chặn cửa sổ/],
  ] as const) {
    await withGoogleTokenClient((options) => options.error_callback?.({ type }), async () => {
      await assert.rejects(requestDriveToken("web.apps.googleusercontent.com"), message);
    });
  }
});

test("a synchronous Google popup failure rejects the authorization promise", async () => {
  await withGoogleTokenClient(() => { throw new Error("popup unavailable"); }, async () => {
    await assert.rejects(requestDriveToken("web.apps.googleusercontent.com"), /popup unavailable/);
  });
});
