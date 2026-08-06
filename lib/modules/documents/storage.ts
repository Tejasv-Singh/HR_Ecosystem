/**
 * File storage abstraction for employee documents.
 *
 * Two drivers behind one interface:
 *   - `local` (default) writes under STORAGE_LOCAL_DIR. Development only — the
 *     directory is gitignored and there is no redundancy.
 *   - `s3` talks to any S3-compatible bucket (AWS S3, Cloudflare R2) using
 *     SigV4 signed requests, which avoids pulling in the AWS SDK.
 *
 * Keys are tenant-prefixed, so one tenant's key can never address another's
 * object even if a key leaked.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredObject {
  key: string;
  size: number;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export function buildDocumentKey(tenantId: string, employeeId: string, fileName: string): string {
  const extension = path.extname(fileName).slice(0, 16);
  return `tenants/${tenantId}/employees/${employeeId}/${randomUUID()}${extension}`;
}

// --- local driver ----------------------------------------------------------

function localRoot(): string {
  // turbopackIgnore keeps the bundler from trying to trace this dynamic path and
  // pulling the whole project into the build output.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_LOCAL_DIR ?? ".storage");
}

/** Guards against `..` segments in a key escaping the storage root. */
function localPathFor(key: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Refusing to access a path outside the storage root.");
  }
  return resolved;
}

const localDriver: StorageDriver = {
  async put(key, body) {
    const target = localPathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, size: body.byteLength };
  },
  async get(key) {
    return readFile(localPathFor(key));
  },
  async delete(key) {
    await unlink(localPathFor(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
};

// --- s3 driver -------------------------------------------------------------

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

function s3Config(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.S3_ENDPOINT ?? `https://${bucket}.s3.${region}.amazonaws.com`,
  };
}

function sha256Hex(payload: Buffer | string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Minimal AWS Signature Version 4 for single-shot S3 object requests. */
function signedHeaders(config: S3Config, method: string, key: string, body: Buffer, contentType?: string) {
  const url = new URL(`${config.endpoint.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaderList = sortedKeys.join(";");

  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaderList, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`;

  return { url, headers };
}

const s3Driver: StorageDriver = {
  async put(key, body, contentType) {
    const config = s3Config();
    const { url, headers } = signedHeaders(config, "PUT", key, body, contentType);
    const response = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
    if (!response.ok) throw new Error(`S3 upload failed (${response.status}): ${await response.text()}`);
    return { key, size: body.byteLength };
  },
  async get(key) {
    const config = s3Config();
    const { url, headers } = signedHeaders(config, "GET", key, Buffer.alloc(0));
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) throw new Error(`S3 download failed (${response.status}): ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  },
  async delete(key) {
    const config = s3Config();
    const { url, headers } = signedHeaders(config, "DELETE", key, Buffer.alloc(0));
    const response = await fetch(url, { method: "DELETE", headers });
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed (${response.status}): ${await response.text()}`);
    }
  },
};

export function storage(): StorageDriver {
  return process.env.STORAGE_DRIVER === "s3" ? s3Driver : localDriver;
}

export function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
}

/**
 * Upload allow-list. Employee files are documents and scans, never executables
 * or anything the browser would happily run.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}
