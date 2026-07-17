import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// ============================================================================
//  Cấu hình GỬI EMAIL (SMTP/Gmail hoặc Resend) — NHẬP QUA UI Settings, khỏi sửa
//  env trên Coolify. Lưu file JSON trong CONFIG_DIR (bền qua restart/rebuild).
//
//  QUAN TRỌNG: email có thể gửi từ tiến trình BACKEND (sendEmailSync — bản tin)
//  HOẶC ORCHESTRATOR (Temporal — thông báo). Hai tiến trình KHÁC nhau, chỉ chung
//  volume /config. Vì vậy getEmailConfig() ĐỌC FILE FRESH mỗi lần gọi — backend
//  ghi file, orchestrator đọc lại được ngay, không cần restart. Provider cũng
//  build từ config này PER-SEND (không cache lúc module-load).
// ============================================================================

export interface EmailConfig {
  provider: string; // '' | 'nodemailer' | 'resend'
  host: string;
  port: string;
  secure: string; // 'true' | 'false'
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  resendKey: string;
}

const FILE = configPath('email-config.json');
const KEYS: (keyof EmailConfig)[] = [
  'provider', 'host', 'port', 'secure', 'user', 'pass',
  'fromAddress', 'fromName', 'resendKey',
];

function fromEnv(): EmailConfig {
  return {
    provider: (process.env.EMAIL_PROVIDER || '').trim(),
    host: process.env.EMAIL_HOST || '',
    port: process.env.EMAIL_PORT || '',
    secure: process.env.EMAIL_SECURE || 'true',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || '',
    fromName: process.env.EMAIL_FROM_NAME || '',
    resendKey: process.env.RESEND_API_KEY || '',
  };
}

function readFile(): Partial<EmailConfig> | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return null; // chưa có file — dùng env
  }
}

// Đọc FRESH mỗi lần: file (ưu tiên, kể cả giá trị rỗng để cho phép XOÁ) → env.
export function getEmailConfig(): EmailConfig {
  const cfg = fromEnv();
  const f = readFile();
  if (f) {
    for (const k of KEYS) {
      if (typeof f[k] === 'string') (cfg[k] as string) = f[k] as string;
    }
  }
  return cfg;
}

function applyEnv(c: EmailConfig) {
  // Chỉ set biến có giá trị — để đường nào đọc thẳng process.env vẫn ăn (backend).
  if (c.provider) process.env.EMAIL_PROVIDER = c.provider;
  if (c.host) process.env.EMAIL_HOST = c.host;
  if (c.port) process.env.EMAIL_PORT = c.port;
  if (c.secure) process.env.EMAIL_SECURE = c.secure;
  if (c.user) process.env.EMAIL_USER = c.user;
  if (c.pass) process.env.EMAIL_PASS = c.pass;
  if (c.fromAddress) process.env.EMAIL_FROM_ADDRESS = c.fromAddress;
  if (c.fromName) process.env.EMAIL_FROM_NAME = c.fromName;
  if (c.resendKey) process.env.RESEND_API_KEY = c.resendKey;
}
// Lúc load: đưa cấu hình đã lưu (file) vào env cho tiến trình hiện tại.
applyEnv(getEmailConfig());

export function setEmailConfig(patch: Partial<EmailConfig>): void {
  const next = getEmailConfig();
  for (const k of KEYS) {
    if (typeof patch[k] === 'string') (next[k] as string) = String(patch[k]).trim();
  }
  applyEnv(next);
  try {
    fs.writeFileSync(FILE, JSON.stringify(next));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên hiện tại */
  }
}

export function hasEmailConfig(): boolean {
  const c = getEmailConfig();
  if (c.provider === 'resend') {
    return !!c.resendKey && !!c.fromAddress && !!c.fromName;
  }
  if (c.provider === 'nodemailer') {
    return !!c.host && !!c.user && !!c.pass && !!c.fromAddress && !!c.fromName;
  }
  return false;
}

// Trạng thái cho UI — KHÔNG trả mật khẩu/resendKey thật, chỉ masked.
export function getEmailStatus() {
  const c = getEmailConfig();
  return {
    provider: c.provider || '',
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    fromAddress: c.fromAddress,
    fromName: c.fromName,
    hasPass: !!c.pass,
    hasResendKey: !!c.resendKey,
    configured: hasEmailConfig(),
  };
}
