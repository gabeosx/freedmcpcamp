import crypto from "node:crypto";

export interface FreedcampAuth {
  api_key: string;
  api_secret?: string;
}

/**
 * Generate the HMAC-SHA1 hash for Freedcamp secured API keys.
 * @param api_key The public API key
 * @param api_secret The API secret
 * @param timestamp Unix timestamp (seconds)
 * @returns The hash string (hex)
 */
export function generateFreedcampHash(api_key: string, api_secret: string, timestamp: number): string {
  const hmac = crypto.createHmac("sha1", api_secret);
  hmac.update(api_key + timestamp);
  return hmac.digest("hex");
}

/**
 * Build authentication parameters for Freedcamp API requests.
 * If api_secret is provided, use secured auth (api_key, timestamp, hash).
 * Otherwise, use only api_key.
 */
export function buildFreedcampAuthParams(auth: FreedcampAuth): Record<string, string> {
  if (auth.api_secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = generateFreedcampHash(auth.api_key, auth.api_secret, timestamp);
    return {
      api_key: auth.api_key,
      timestamp: String(timestamp),
      hash,
    };
  } else {
    return {
      api_key: auth.api_key,
    };
  }
} 