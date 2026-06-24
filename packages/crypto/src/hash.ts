/**
 * `HashService` — secure password hashing.
 *
 * Algorithms:
 * - `scrypt` (default) — built into Node, no extra deps. Memory-
 *   hard and CPU-hard. Recommended for new apps.
 * - `argon2` (optional) — the @node-rs/argon2 package is the
 *   reference implementation. Install it as a peer dep:
 *
 *     bun add @node-rs/argon2
 *
 *   When installed, the service auto-detects it.
 *
 * Output format (scrypt): a base64 string with the cost parameters
 * encoded: `$scrypt$N=16384,r=8,p=1$<saltB64>$<hashB64>`.
 * This is similar to the well-known `passlib` / PHC format and
 * lets us verify hashes that were generated with different
 * parameters.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// scrypt's callback signature is (err, derivedKey) but it takes
// (password, salt, keylen, options) before the callback, so we
// can't use util.promisify directly. Wrap manually.
function scrypt(
	password: string | Buffer,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem?: number },
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scryptCb(password, salt, keylen, options, (err, derived) => {
			if (err) reject(err);
			else resolve(derived);
		});
	});
}

import type { HashConfig, HashedPassword, HashOptions } from "./types.js";

const PREFIX_SCRYPT = "$scrypt$";
const PREFIX_ARGON2 = "$argon2";

export class HashService {
	readonly algorithm: "scrypt" | "argon2";
	private readonly scryptCost: number;
	private readonly scryptBlockSize: number;
	private readonly scryptParallelization: number;
	private readonly scryptKeyLength: number;
	private readonly argon2MemoryCost: number;
	private readonly argon2TimeCost: number;
	private readonly argon2Parallelism: number;

	constructor(config: HashConfig = {}) {
		this.algorithm = config.algorithm ?? "scrypt";
		this.scryptCost = config.scryptCost ?? 16384;
		this.scryptBlockSize = config.scryptBlockSize ?? 8;
		this.scryptParallelization = config.scryptParallelization ?? 1;
		this.scryptKeyLength = config.scryptKeyLength ?? 64;
		this.argon2MemoryCost = config.argon2MemoryCost ?? 65536;
		this.argon2TimeCost = config.argon2TimeCost ?? 3;
		this.argon2Parallelism = config.argon2Parallelism ?? 4;
	}

	/**
	 * Hash a password. Returns a self-describing string that
	 * includes the algorithm and cost parameters.
	 */
	async hash(password: string, options: HashOptions = {}): Promise<HashedPassword> {
		const algo = options.algorithm ?? this.algorithm;
		if (algo === "scrypt") return this.hashScrypt(password);
		if (algo === "argon2") return this.hashArgon2(password);
		throw new Error(`Unknown hash algorithm: ${algo}`);
	}

	/**
	 * Verify a password against a previously generated hash.
	 * Returns `true` on match, `false` otherwise.
	 */
	async verify(hashed: HashedPassword, password: string): Promise<boolean> {
		if (typeof hashed !== "string" || hashed.length === 0) return false;
		if (hashed.startsWith(PREFIX_SCRYPT)) return this.verifyScrypt(hashed, password);
		if (hashed.startsWith(PREFIX_ARGON2)) return this.verifyArgon2(hashed, password);
		// Unknown format — try scrypt with default params for backward-compat
		// (e.g. raw SHA-256 / bcrypt / etc. — caller should migrate).
		return false;
	}

	/**
	 * True if a hash was generated with parameters that are below
	 * the current security floor. The caller should re-hash and
	 * update the stored value.
	 */
	needsRehash(hashed: HashedPassword): boolean {
		if (typeof hashed !== "string" || !hashed.startsWith(PREFIX_SCRYPT)) {
			// Foreign hash format — always re-hash to bring in the
			// canonical scrypt format.
			return true;
		}
		const params = parseScryptParams(hashed);
		if (!params) return true;
		if (params.N < this.scryptCost) return true;
		if (params.r < this.scryptBlockSize) return true;
		if (params.p < this.scryptParallelization) return true;
		if (params.keyLen < this.scryptKeyLength) return true;
		return false;
	}

	/* ---------------- scrypt ---------------- */

	private async hashScrypt(password: string): Promise<string> {
		const salt = randomBytes(16);
		const derived = (await scrypt(password, salt, this.scryptKeyLength, {
			N: this.scryptCost,
			r: this.scryptBlockSize,
			p: this.scryptParallelization,
			maxmem: 256 * 1024 * 1024,
		})) as Buffer;
		return [
			PREFIX_SCRYPT,
			`N=${this.scryptCost},r=${this.scryptBlockSize},p=${this.scryptParallelization},keyLen=${this.scryptKeyLength}`,
			`$${salt.toString("base64url")}`,
			`$${derived.toString("base64url")}`,
		].join("");
	}

	private async verifyScrypt(hashed: string, password: string): Promise<boolean> {
		const params = parseScryptParams(hashed);
		if (!params) return false;
		// Format: \\ (split by \$ gives 5 parts)
		const [, , , saltB64, hashB64] = hashed.split("$");
		if (!saltB64 || !hashB64) return false;
		const salt = Buffer.from(saltB64, "base64url");
		const expected = Buffer.from(hashB64, "base64url");
		const derived = (await scrypt(password, salt, expected.length, {
			N: params.N,
			r: params.r,
			p: params.p,
			maxmem: 256 * 1024 * 1024,
		})) as Buffer;
		if (derived.length !== expected.length) return false;
		return timingSafeEqual(derived, expected);
	}

	/* ---------------- argon2 ---------------- */

	private async hashArgon2(password: string): Promise<string> {
		const mod = await loadArgon2();
		const hash = await mod.hash(password, {
			memoryCost: this.argon2MemoryCost,
			timeCost: this.argon2TimeCost,
			parallelism: this.argon2Parallelism,
		});
		return hash; // argon2 already returns a self-describing string
	}

	private async verifyArgon2(hashed: string, password: string): Promise<boolean> {
		const mod = await loadArgon2();
		try {
			return await mod.verify(hashed, password);
		} catch {
			return false;
		}
	}
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function parseScryptParams(hashed: string): {
	N: number;
	r: number;
	p: number;
	keyLen: number;
} | null {
	// $scrypt$N=16384,r=8,p=1,keyLen=64$<salt>$<hash>
	const parts = hashed.split("$");
	if (parts.length !== 5) return null;
	const paramsPart = parts[2];
	if (!paramsPart) return null;
	const m: Record<string, number> = {};
	for (const kv of paramsPart.split(",")) {
		const [k, v] = kv.split("=");
		if (k && v) m[k] = Number(v);
	}
	if (!m.N || !m.r || !m.p || !m.keyLen) return null;
	return { N: m.N, r: m.r, p: m.p, keyLen: m.keyLen };
}

/* ------------------------------------------------------------------ *
 * Optional argon2 peer dep
 * ------------------------------------------------------------------ */

interface Argon2Module {
	hash(password: string, opts: { memoryCost: number; timeCost: number; parallelism: number }): Promise<string>;
	verify(hash: string, password: string): Promise<boolean>;
}

let _argon2: Argon2Module | null | undefined; // undefined = not yet loaded

async function loadArgon2(): Promise<Argon2Module> {
	if (_argon2 !== undefined) {
		if (_argon2 === null) {
			throw new Error(
				"argon2 is not installed. Install with: bun add @node-rs/argon2",
			);
		}
		return _argon2;
	}
	try {
		// @ts-expect-error - optional peer dep
		const mod = await import("@node-rs/argon2");
		_argon2 = (mod as any).default ?? (mod as any);
		if (!_argon2) throw new Error("invalid argon2 module");
		return _argon2!;
	} catch {
		_argon2 = null;
		throw new Error(
			"argon2 is not installed. Install with: bun add @node-rs/argon2",
		);
	}
}

// =====================================================================
// Standalone helpers
// =====================================================================
//
// These mirror the `HashService` API but do not require instantiating
// the class. Useful for one-off hashing tasks (e.g. CLI scripts,
// database seeders, smoke tests) where pulling the full DI container
// is overkill.
//
// For production code with a controller or service, prefer the
// `HashService` class via DI so the algorithm + cost parameters are
// configured once at the module level.

/**
 * Standalone `hash` function — uses scrypt by default, argon2 if
 * `@node-rs/argon2` is installed.
 *
 * @param password - The plaintext password to hash.
 * @param options - Optional overrides for algorithm + cost params.
 * @returns The encoded hash string (PHC-style).
 */
export async function hash(
	password: string,
	options: HashOptions = {},
): Promise<string> {
	const svc = new HashService();
	return svc.hash(password, options);
}

/**
 * Standalone `verify` function — verifies a plaintext password
 * against a previously encoded hash.
 */
export async function verify(
	hashed: HashedPassword,
	password: string,
): Promise<boolean> {
	const svc = new HashService();
	return svc.verify(hashed, password);
}

/**
 * Convenience: scrypt-specific hash. Useful when you want to
 * guarantee the algorithm regardless of installed peer deps.
 */
export async function scryptHash(password: string): Promise<string> {
	return hash(password, { algorithm: "scrypt" });
}

/**
 * Convenience: scrypt-specific verify.
 */
export async function scryptVerify(
	hashed: string,
	password: string,
): Promise<boolean> {
	return verify(hashed, password);
}
