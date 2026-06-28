/**
 * `EncryptionService` — AES-256-GCM symmetric encryption + HMAC
 * sign/unsign helpers.
 *
 * Use cases:
 * - **Encrypt** sensitive data before storing it (e.g. session
 *   blobs in cookies or DB).
 * - **Sign** stateless values that need to be tamper-proof (e.g.
 *   session IDs, CSRF tokens, password-reset links, signed URLs).
 *
 * The service derives two 32-byte keys from the user's master
 * `key` config: one for AES-GCM, one for HMAC. The keys are
 * distinct (HKDF-SHA256 with a per-purpose salt) so a leak of one
 * doesn't compromise the other.
 *
 * Encrypted format (v1):
 *   `v1.<base64url(iv)>.<base64url(tag)>.<base64url(ciphertext)>`
 *   where `iv` is 12 bytes and `tag` is 16 bytes (GCM auth tag).
 *
 * Signed format:
 *   `<base64url(value)>.<base64url(hmac)>`
 */

import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import type { EncryptedValue, EncryptOptions, SignedValue } from "./types.js";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class EncryptionService {
	private readonly aesKey: Buffer;
	private readonly hmacKey: Buffer;

	constructor(masterKey: string) {
		const derived = deriveKeys(masterKey);
		this.aesKey = derived.aes;
		this.hmacKey = derived.hmac;
	}

	/* ---------------- encrypt / decrypt ---------------- */

	/**
	 * Encrypt a string. The output is self-describing and includes
	 * the IV, auth tag, expiry, and purpose (if any) in the MAC.
	 *
	 * Format: `v1.<iv>.<tag>.<ciphertext>.<mac>`
	 */
	encrypt(value: string, options: EncryptOptions = {}): EncryptedValue {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv("aes-256-gcm", this.aesKey, iv);
		const plaintext = Buffer.from(value, "utf8");
		const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const tag = cipher.getAuthTag();

		const expiry = encodeExpiry(options.expiresAt);
		const purposeBuf = Buffer.from(options.purpose ?? "", "utf8");
		const mac = this.macOver([VERSION, iv, tag, ciphertext, expiry, purposeBuf]);

		return [
			VERSION,
			b64(iv),
			b64(tag),
			b64(ciphertext),
			b64(expiry),
			b64(purposeBuf),
			b64(mac),
		].join(".");
	}

	/**
	 * Decrypt a value previously produced by `encrypt()`. Throws
	 * if the value is malformed, the MAC doesn't match, the
	 * purpose doesn't match, or the expiry has passed.
	 */
	decrypt<T = string>(payload: string): T {
		const parsed = parseV1(payload);
		if (!parsed) throw new Error("Encrypted payload is malformed");

		// Verify MAC over the canonical (VERSION, IV, tag, ct, expiry, purpose) tuple.
		const expectedMac = this.macOver([
			VERSION,
			parsed.iv,
			parsed.tag,
			parsed.ciphertext,
			parsed.expiry,
			parsed.purpose,
		]);
		if (!constantTimeEqual(expectedMac, parsed.mac)) {
			throw new Error("Encrypted payload failed integrity check");
		}

		// Check expiry.
		if (parsed.expiry.length > 0) {
			const expiryMs = parseExpiry(parsed.expiry.toString("utf8"));
			if (expiryMs > 0 && Date.now() > expiryMs) {
				throw new Error("Encrypted payload has expired");
			}
		}

		const decipher = createDecipheriv("aes-256-gcm", this.aesKey, parsed.iv);
		decipher.setAuthTag(parsed.tag);
		const plaintext = Buffer.concat([
			decipher.update(parsed.ciphertext),
			decipher.final(),
		]);
		return plaintext.toString("utf8") as unknown as T;
	}

	/** True if the string was produced by `encrypt()`. */
	isEncrypted(value: string): boolean {
		if (typeof value !== "string") return false;
		return value.startsWith(`${VERSION}.`);
	}

	/* ---------------- HMAC sign / unsign ---------------- */

	/**
	 * Sign a string with the framework's HMAC key. The output is
	 * `<base64url(value)>.<base64url(hmac)>`.
	 *
	 * Useful for stateless session cookies, CSRF tokens, etc.
	 */
	sign(value: string, purpose = ""): SignedValue {
		const mac = createHmac("sha256", this.hmacKey)
			.update(purpose)
			.update("|")
			.update(value)
			.digest();
		return `${b64(Buffer.from(value, "utf8"))}.${b64(mac)}`;
	}

	/**
	 * Sign a pre-encoded value (no extra b64-encoding). The output
	 * is just the base64url MAC. Useful for cookie / token formats
	 * where the value is already b64-encoded.
	 *
	 * The caller is responsible for joining the value and signature.
	 */
	signRaw(value: string, purpose = ""): string {
		const mac = createHmac("sha256", this.hmacKey)
			.update(purpose)
			.update("|")
			.update(value)
			.digest();
		return b64(mac);
	}

	/**
	 * Verify a raw signature (from `signRaw`) against a pre-encoded
	 * value. Returns `true` on match, `false` otherwise.
	 */
	verifyRaw(value: string, signature: string, purpose = ""): boolean {
		const expected = createHmac("sha256", this.hmacKey)
			.update(purpose)
			.update("|")
			.update(value)
			.digest();
		const given = fromB64(signature);
		if (!given) return false;
		return constantTimeEqual(given, expected);
	}

	/**
	 * Verify and extract a previously signed value. Returns the
	 * original value on success, `null` on failure (malformed,
	 * wrong purpose, MAC mismatch).
	 */
	unsign(signed: string, purpose = ""): string | null {
		const dot = signed.lastIndexOf(".");
		if (dot < 1 || dot === signed.length - 1) return null;
		const valueB64 = signed.slice(0, dot);
		const macB64 = signed.slice(dot + 1);
		const value = fromB64(valueB64);
		const mac = fromB64(macB64);
		if (!value || !mac) return null;
		const expected = createHmac("sha256", this.hmacKey)
			.update(purpose)
			.update("|")
			.update(value)
			.digest();
		if (!constantTimeEqual(mac, expected)) return null;
		return value.toString("utf8");
	}

	/* ---------------- internals ---------------- */

	private macOver(parts: Array<Buffer | string>): Buffer {
		const h = createHmac("sha256", this.hmacKey);
		for (const p of parts) {
			h.update("|");
			h.update(p as Buffer);
		}
		return h.digest();
	}
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function b64(buf: Buffer): string {
	return buf.toString("base64url");
}

function fromB64(s: string): Buffer | null {
	try {
		return Buffer.from(s, "base64url");
	} catch {
		return null;
	}
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function encodeExpiry(expiresAt: number | string | Date | undefined): Buffer {
	if (expiresAt === undefined) return Buffer.alloc(0);
	let ms: number;
	if (typeof expiresAt === "number") {
		ms = expiresAt > 1e12 ? expiresAt : Date.now() + expiresAt * 1000;
	} else if (typeof expiresAt === "string") {
		// Numeric string = seconds from now
		const asNum = Number(expiresAt);
		if (!Number.isNaN(asNum) && asNum > 0) {
			ms = asNum > 1e12 ? asNum : Date.now() + asNum * 1000;
		} else {
			ms = Date.parse(expiresAt);
		}
	} else {
		ms = expiresAt.getTime();
	}
	if (!Number.isFinite(ms)) return Buffer.alloc(0);
	return Buffer.from(String(ms), "utf8");
}

function parseExpiry(s: string): number {
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

interface ParsedV1 {
	iv: Buffer;
	tag: Buffer;
	ciphertext: Buffer;
	expiry: Buffer;
	purpose: Buffer;
	mac: Buffer;
}

function parseV1(s: string): ParsedV1 | null {
	if (typeof s !== "string" || !s.startsWith(`${VERSION}.`)) return null;
	const parts = s.split(".");
	// v1, iv, tag, ct, expiry, purpose, mac = 7 parts
	if (parts.length !== 7) return null;
	const [, ivB64, tagB64, ctB64, expB64, purposeB64, macB64] = parts;
	const iv = fromB64(ivB64);
	const tag = fromB64(tagB64);
	const ct = fromB64(ctB64);
	const exp = fromB64(expB64);
	const purpose = fromB64(purposeB64);
	const mac = fromB64(macB64);
	if (!iv || !tag || !ct || !exp || !purpose || !mac) return null;
	if (iv.length !== IV_BYTES) return null;
	if (tag.length !== TAG_BYTES) return null;
	return { iv, tag, ciphertext: ct, expiry: exp, purpose, mac };
}

/* ------------------------------------------------------------------ *
 * Key derivation — HKDF-SHA256, two sub-keys
 * ------------------------------------------------------------------ */

function deriveKeys(masterKey: string): { aes: Buffer; hmac: Buffer } {
	// Convert the master to bytes. We accept any string; if it
	// happens to be base64 and is at least 32 bytes, decode it.
	let input: Buffer;
	try {
		const decoded = Buffer.from(masterKey, "base64");
		if (
			decoded.length >= 32 &&
			// The "decoded" path is valid only if the string is
			// actually base64 (would be a real try/catch).
			masterKey.length % 4 === 0
		) {
			input = decoded;
		} else {
			input = Buffer.from(masterKey, "utf8");
		}
	} catch {
		input = Buffer.from(masterKey, "utf8");
	}

	const ikm = input.length < 32 ? padKey(input) : input;
	const out = hkdfSync("sha256", ikm, Buffer.alloc(0), "nexus:crypto:v1", 64);
	const outBuf = Buffer.from(out);
	return {
		aes: Buffer.from(outBuf.subarray(0, 32)),
		hmac: Buffer.from(outBuf.subarray(32, 64)),
	};
}

function padKey(input: Buffer): Buffer {
	// Pad to 32 bytes by appending SHA-256 of the key (so the
	// result is deterministic and at least 32 bytes long).
	const hash = createHmac("sha256", "nexus:crypto:pad").update(input).digest();
	const out = Buffer.alloc(32);
	input.copy(out, 0, 0, Math.min(input.length, 32));
	hash.copy(out, input.length < 32 ? input.length : 0, 0, 32 - Math.min(input.length, 32));
	return out;
}
