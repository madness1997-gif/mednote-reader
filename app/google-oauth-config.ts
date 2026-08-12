export const MAX_DESKTOP_OAUTH_CONFIG_BYTES = 64 * 1024;

export type DesktopOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseDesktopOAuthConfig(source: string): DesktopOAuthConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Tệp OAuth JSON không hợp lệ");
  }

  const installed = record(record(parsed)?.installed);
  if (!installed) throw new Error("Hãy chọn tệp JSON của OAuth Client loại Desktop app");

  const clientId = typeof installed.client_id === "string" ? installed.client_id.trim() : "";
  const clientSecret = typeof installed.client_secret === "string" ? installed.client_secret.trim() : "";
  if (!CLIENT_ID_PATTERN.test(clientId)) throw new Error("Tệp OAuth Desktop không có Client ID hợp lệ");
  if (clientSecret.length > 512) throw new Error("Client Secret trong tệp OAuth không hợp lệ");

  return { clientId, clientSecret };
}
