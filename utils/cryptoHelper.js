const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
// Generate a 32-byte key from PASSWORD_ENCRYPT_KEY or use a static fallback key for local dev
const ENCRYPTION_KEY = process.env.PASSWORD_ENCRYPT_KEY
  ? crypto.scryptSync(process.env.PASSWORD_ENCRYPT_KEY, "hod-salt", 32)
  : Buffer.from("4a6f6e617468616e446576656c6f7065725f496e666f7665785f48616c6c7332", "hex"); // 32 bytes

const IV_LENGTH = 16;

const encrypt = (text) => {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (err) {
    console.error("Encryption failed:", err.message);
    return null;
  }
};

const decrypt = (text) => {
  if (!text) return null;
  try {
    const parts = text.split(":");
    if (parts.length < 2) return null;
    const iv = Buffer.from(parts.shift(), "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return null;
  }
};

module.exports = { encrypt, decrypt };
