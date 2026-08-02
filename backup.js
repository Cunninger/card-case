import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

export const BACKUP_EXTENSION = '.cardcase';
export const BACKUP_FORMAT = 'card-case-encrypted-backup';
export const BACKUP_SCHEMA_VERSION = 1;
const KDF_ITERATIONS = 120000;

const toBase64 = (wordArray) => CryptoJS.enc.Base64.stringify(wordArray);
const fromBase64 = (value) => CryptoJS.enc.Base64.parse(value);
const toUtf8 = (wordArray) => CryptoJS.enc.Utf8.stringify(wordArray);

const randomWordArray = async (byteCount) => {
  const bytes = await Crypto.getRandomBytesAsync(byteCount);
  const words = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] = (words[index >>> 2] || 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
};

const deriveKeys = (password, salt, iterations) => {
  const material = CryptoJS.PBKDF2(password, salt, {
    keySize: 16,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32),
  };
};

const safelyMatches = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

const macInput = (backup) => [backup.format, backup.version, backup.kdf.iterations, backup.salt, backup.iv, backup.ciphertext].join('.');

export const encryptBackup = async (payload, password) => {
  const salt = await randomWordArray(16);
  const iv = await randomWordArray(16);
  const { encryptionKey, macKey } = deriveKeys(password, salt, KDF_ITERATIONS);
  const plaintext = JSON.stringify(payload);
  const encrypted = CryptoJS.AES.encrypt(plaintext, encryptionKey, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2-HMAC-SHA256', iterations: KDF_ITERATIONS },
    cipher: { name: 'AES-256-CBC', integrity: 'HMAC-SHA256' },
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted.ciphertext),
  };
  backup.mac = toBase64(CryptoJS.HmacSHA256(macInput(backup), macKey));
  return JSON.stringify(backup);
};

export const decryptBackup = (serializedBackup, password) => {
  let backup;
  try {
    backup = JSON.parse(serializedBackup);
  } catch {
    throw new Error('文件不是有效的卡匣备份。');
  }
  const validFormat = backup?.format === BACKUP_FORMAT
    && backup?.version === BACKUP_SCHEMA_VERSION
    && backup?.kdf?.name === 'PBKDF2-HMAC-SHA256'
    && Number.isInteger(backup?.kdf?.iterations)
    && backup.kdf.iterations >= 100000
    && typeof backup?.salt === 'string'
    && typeof backup?.iv === 'string'
    && typeof backup?.ciphertext === 'string'
    && typeof backup?.mac === 'string';
  if (!validFormat) throw new Error('该备份版本暂不受支持。');
  const { encryptionKey, macKey } = deriveKeys(password, fromBase64(backup.salt), backup.kdf.iterations);
  const expectedMac = toBase64(CryptoJS.HmacSHA256(macInput(backup), macKey));
  if (!safelyMatches(backup.mac, expectedMac)) throw new Error('密码不正确，或备份文件已损坏。');
  try {
    const plaintext = CryptoJS.AES.decrypt({ ciphertext: fromBase64(backup.ciphertext) }, encryptionKey, {
      iv: fromBase64(backup.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const result = JSON.parse(toUtf8(plaintext));
    if (!result || typeof result !== 'object') throw new Error('invalid payload');
    return result;
  } catch {
    throw new Error('备份无法解密，请确认密码后重试。');
  }
};

export const validateBackupPayload = (payload) => {
  if (payload?.schemaVersion !== BACKUP_SCHEMA_VERSION || !Array.isArray(payload.cards) || !Array.isArray(payload.photos)) {
    throw new Error('备份内容不完整或版本不受支持。');
  }
  if (payload.cards.length > 2000 || payload.photos.length > 4000) throw new Error('备份规模异常，已停止导入。');
  const knownPhotoIds = new Set();
  payload.photos.forEach((photo) => {
    if (!photo || typeof photo.id !== 'string' || typeof photo.data !== 'string' || photo.data.length > 35 * 1024 * 1024) {
      throw new Error('备份中的实体卡照片无效。');
    }
    knownPhotoIds.add(photo.id);
  });
  payload.cards.forEach((card) => {
    if (!card || typeof card.id !== 'string' || typeof card.name !== 'string') throw new Error('备份中的卡片资料无效。');
    if ((card.frontPhotoId && !knownPhotoIds.has(card.frontPhotoId)) || (card.backPhotoId && !knownPhotoIds.has(card.backPhotoId))) {
      throw new Error('备份中的卡片照片索引不完整。');
    }
  });
  return payload;
};
