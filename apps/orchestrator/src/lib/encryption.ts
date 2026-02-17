import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

// Get encryption key from environment or generate a persistent one (for dev only)
const getKey = (): Buffer => {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY environment variable is required in production");
    }

    // In dev, persist key to a file so it survives server restarts
    const dataDir = path.join(process.cwd(), "data");
    const keyFile = path.join(dataDir, ".encryption-key");

    try {
      if (fs.existsSync(keyFile)) {
        const saved = fs.readFileSync(keyFile, "utf8").trim();
        if (saved.length === KEY_LENGTH * 2) {
          return Buffer.from(saved, "hex");
        }
      }
    } catch { /* ignore read errors, generate new */ }

    // Generate and persist
    const newKey = crypto.randomBytes(KEY_LENGTH);
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(keyFile, newKey.toString("hex"), "utf8");
      console.warn("⚠️  ENCRYPTION_KEY not set — generated dev key at data/.encryption-key");
    } catch {
      console.warn("⚠️  ENCRYPTION_KEY not set, using random key (will not persist)");
    }
    return newKey;
  }

  const key = Buffer.from(keyHex, "hex");

  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
  }

  return key;
};

const KEY = getKey();

/**
 * Encrypt text using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:authTag:encrypted
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return in format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt text using AES-256-GCM
 * @param encrypted - Encrypted string in format: iv:authTag:encrypted
 * @returns Decrypted plain text
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const [ivHex, authTagHex, encryptedText] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a random encryption key (for setup)
 * @returns 32-byte hex string
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("hex");
}
