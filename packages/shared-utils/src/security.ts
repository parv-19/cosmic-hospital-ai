import crypto from "node:crypto";

const TOKEN_ALGORITHM = "sha256";

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(":");

  if (!salt || !originalHash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(candidateHash, "hex"));
}

export function signToken(payload: Record<string, unknown>, secret: string, expiresInSeconds = 60 * 60 * 12): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = toBase64Url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = crypto.createHmac(TOKEN_ALGORITHM, secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${toBase64Url(signature)}`;
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac(TOKEN_ALGORITHM, secret).update(`${header}.${payload}`).digest();

  if (!crypto.timingSafeEqual(fromBase64Url(signature), expectedSignature)) {
    return null;
  }

  const decoded = JSON.parse(fromBase64Url(payload).toString("utf8")) as T & { exp?: number };

  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return decoded;
}
