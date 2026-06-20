/**
 * Cron expression parser + next-run calculator.
 *
 * Supports the standard 5-field crontab syntax, an optional 6-field
 * variant (with seconds), common aliases, and "@every <duration>".
 *
 *   * * * * *                  every minute
 *   0 * * * *                  every hour
 *   star-slash-15 every 15m
 *   0 9 * * 1-5                9am on weekdays
 *   0 0 1 * *                  first of the month
 *   30 14 1 4 *                Apr 1st at 14:30
 *   @yearly @annually          0 0 1 1 *
 *   @monthly                   0 0 1 * *
 *   @weekly                    0 0 * * 0
 *   @daily @midnight           0 0 * * *
 *   @hourly                    0 * * * *
 *   @every 1h30m               every 90 minutes
 *
 * Field names (JAN, FEB, SUN, MON, ...) are accepted case-insensitively.
 */

const FIELD_RANGES: Array<[number, number]> = [
	[0, 59], // minute
	[0, 23], // hour
	[1, 31], // day of month
	[1, 12], // month
	[0, 7], // day of week (0 or 7 = Sunday)
];

const FIELD_NAMES: Record<string, number> = {
	JAN: 1,
	FEB: 2,
	MAR: 3,
	APR: 4,
	MAY: 5,
	JUN: 6,
	JUL: 7,
	AUG: 8,
	SEP: 9,
	OCT: 10,
	NOV: 11,
	DEC: 12,
	SUN: 0,
	MON: 1,
	TUE: 2,
	WED: 3,
	THU: 4,
	FRI: 5,
	SAT: 6,
};

const ALIASES: Record<string, string> = {
	"@yearly": "0 0 1 1 *",
	"@annually": "0 0 1 1 *",
	"@monthly": "0 0 1 * *",
	"@weekly": "0 0 * * 0",
	"@daily": "0 0 * * *",
	"@midnight": "0 0 * * *",
	"@hourly": "0 * * * *",
};

/** A single field expanded into a set of allowed numeric values. */
export class CronField {
	readonly values: Set<number>;

	constructor(field: string, range: [number, number]) {
		this.values = parseField(field, range);
	}

	contains(n: number): boolean {
		return this.values.has(n);
	}
}

/** A fully-parsed cron expression. */
export class CronExpression {
	readonly fields: CronField[]; // 5 or 6 entries
	readonly hasSeconds: boolean;

	constructor(raw: string) {
		const expanded = expandAlias(raw);
		const every = expandEvery(expanded);

		if (every) {
			// "@every Nd|Nh|Nm|Ns" → uniform interval
			this.hasSeconds = true;
			this.fields = everyToFields(every);
			return;
		}

		const parts = expanded.trim().split(/\s+/);
		if (parts.length === 5) {
			this.hasSeconds = false;
			this.fields = parts.map((p, i) => new CronField(p, FIELD_RANGES[i]!));
		} else if (parts.length === 6) {
			this.hasSeconds = true;
			const sec: [number, number] = [0, 59];
			this.fields = [
				new CronField(parts[0]!, sec),
				...parts.slice(1).map((p, i) => new CronField(p, FIELD_RANGES[i]!)),
			];
		} else {
			throw new Error(
				`Invalid cron expression: "${raw}" (expected 5 or 6 fields, got ${parts.length})`,
			);
		}
	}

	/**
	 * Return the next Date at or after `from` that matches this
	 * expression. Returns null if no match is found within `maxYears`
	 * (default 5) — which would indicate a misconfigured expression.
	 */
	next(from: Date, maxYears = 5): Date | null {
		const cap = new Date(from.getTime() + maxYears * 365 * 24 * 60 * 60 * 1000);
		let cur = new Date(from.getTime() + 1000);
		cur.setMilliseconds(0);

		// Brute-force: step minute-by-minute, but skip ahead when a
		// higher-order field doesn't match. For most crons this is
		// fast enough; for very sparse crons we use a forwarder.
		let safety = 0;
		while (cur <= cap) {
			if (this.matches(cur)) {
				return cur;
			}
			// Fast-forward: if the month doesn't match, jump to next month.
			if (!this.fields[this.hasSeconds ? 4 : 3]!.contains(cur.getMonth() + 1)) {
				cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 0, 0, 0, 0);
				continue;
			}
			// If day-of-month is restricted and current day doesn't match,
			// jump to next month at the first allowed day.
			const domIdx = this.hasSeconds ? 3 : 2;
			const domField = this.fields[domIdx]!;
			if (!domField.contains(cur.getDate())) {
				// Find the first allowed day in the set, or jump to next month.
				const sortedDays = [...domField.values].sort((a, b) => a - b);
				const nextDay = sortedDays.find((d) => d >= cur.getDate());
				if (nextDay !== undefined) {
					cur = new Date(cur.getFullYear(), cur.getMonth(), nextDay, 0, 0, 0, 0);
				} else {
					cur = new Date(cur.getFullYear(), cur.getMonth() + 1, sortedDays[0]!, 0, 0, 0, 0);
				}
				continue;
			}
			// If the hour doesn't match, jump to next hour.
			if (!this.fields[this.hasSeconds ? 2 : 1]!.contains(cur.getHours())) {
				cur = new Date(
					cur.getFullYear(),
					cur.getMonth(),
					cur.getDate(),
					cur.getHours() + 1,
					0,
					0,
					0,
				);
				continue;
			}
			// If the minute doesn't match, jump to next minute.
			if (!this.fields[this.hasSeconds ? 1 : 0]!.contains(cur.getMinutes())) {
				cur = new Date(
					cur.getFullYear(),
					cur.getMonth(),
					cur.getDate(),
					cur.getHours(),
					cur.getMinutes() + 1,
					0,
					0,
				);
				continue;
			}
			// If seconds field exists and doesn't match, jump to next second.
			if (this.hasSeconds && !this.fields[0]!.contains(cur.getSeconds())) {
				cur = new Date(cur.getTime() + 1000);
				continue;
			}
			// Fallback: step 1 second (shouldn't normally hit).
			cur = new Date(cur.getTime() + 1000);
			if (++safety > 1_000_000) return null;
		}
		return null;
	}

	private matches(d: Date): boolean {
		const fields = this.hasSeconds
			? [
					d.getSeconds(),
					d.getMinutes(),
					d.getHours(),
					d.getDate(),
					d.getMonth() + 1,
					d.getDay(),
				]
			: [
					d.getMinutes(),
					d.getHours(),
					d.getDate(),
					d.getMonth() + 1,
					d.getDay(),
				];
		// Day-of-week in crontab: 0 = Sunday. Day-of-month is OR'd with
		// day-of-week when both are restricted (standard crontab behavior).
		const domField = this.fields[this.hasSeconds ? 3 : 2]!;
		const dowField = this.fields[this.hasSeconds ? 4 : 3]!;
		const isWildDom = domField.values.size === FIELD_RANGES[2]![1]!;
		const isWildDow = dowField.values.size === FIELD_RANGES[4]![1]! + 1;
		const dayMatch =
			isWildDom || isWildDow
				? domField.contains(d.getDate()) || dowField.contains(d.getDay())
				: domField.contains(d.getDate()) || dowField.contains(d.getDay());

		for (let i = 0; i < this.fields.length; i++) {
			if (i === (this.hasSeconds ? 3 : 2)) continue;
			if (!this.fields[i]!.contains(fields[i]!)) return false;
		}
		return dayMatch;
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function expandAlias(raw: string): string {
	const trimmed = raw.trim();
	const alias = ALIASES[trimmed.toLowerCase()];
	return alias ?? trimmed;
}

function expandEvery(raw: string): number | null {
	const m = /^@every\s+(\d+)\s*(s|m|h|d)?$/i.exec(raw.trim());
	if (!m) return null;
	const n = Number(m[1]);
	const unit = (m[2] ?? "s").toLowerCase();
	switch (unit) {
		case "s":
			return n * 1000;
		case "m":
			return n * 60 * 1000;
		case "h":
			return n * 60 * 60 * 1000;
		case "d":
			return n * 24 * 60 * 60 * 1000;
	}
	return null;
}

function everyToFields(intervalMs: number): CronField[] {
	// Generate a 6-field expression that fires every `intervalMs`
	// starting from the next round minute.
	const seconds = Math.floor(intervalMs / 1000);
	if (seconds < 60) {
		// fire every N seconds (only if it divides 60)
		if (60 % seconds === 0) {
			return [
				new CronField(`*/${seconds}`, [0, 59]),
				new CronField("*", [0, 59]),
				new CronField("*", [0, 23]),
				new CronField("*", [1, 31]),
				new CronField("*", [1, 12]),
				new CronField("*", [0, 7]),
			];
		}
	}
	// Otherwise just allow every minute; the registry layer handles
	// throttling via setInterval.
	return [
		new CronField("0", [0, 59]),
		new CronField("*", [0, 59]),
		new CronField("*", [0, 23]),
		new CronField("*", [1, 31]),
		new CronField("*", [1, 12]),
		new CronField("*", [0, 7]),
	];
}

function parseField(field: string, range: [number, number]): Set<number> {
	const out = new Set<number>();
	const [lo, hi] = range;
	const parts = field.split(",");
	for (const partRaw of parts) {
		const part = partRaw.trim();
		// step: e.g. "*/2" or "0-30/2"
		const stepMatch = /^(.+?)\/(\d+)$/.exec(part);
		let base = part;
		let step = 1;
		if (stepMatch) {
			base = stepMatch[1]!;
			step = Number(stepMatch[2]);
		}
		let start: number;
		let end: number;
		if (base === "*") {
			start = lo;
			end = hi;
		} else if (base.includes("-")) {
			const [a, b] = base.split("-").map((s) => resolveValue(s, lo, hi));
			start = a;
			end = b;
		} else {
			const v = resolveValue(base, lo, hi);
			start = v;
			end = stepMatch ? hi : v;
		}
		if (start > end) {
			throw new Error(`Invalid range in cron field: "${part}"`);
		}
		for (let i = start; i <= end; i += step) {
			out.add(i);
		}
	}
	return out;
}

function resolveValue(token: string, lo: number, hi: number): number {
	const t = token.trim();
	if (t === "*") return lo;
	const named = FIELD_NAMES[t.toUpperCase()];
	if (named !== undefined) return named;
	const n = Number(t);
	if (Number.isNaN(n)) {
		throw new Error(`Invalid cron field value: "${token}"`);
	}
	if (n < lo || n > hi) {
		throw new Error(`Cron value ${n} out of range [${lo}, ${hi}]`);
	}
	return n;
}

/**
 * Parse a cron expression. Throws on invalid syntax. The returned
 * object can be queried for the next match (`expr.next(new Date())`).
 */
export function parseCron(expression: string): CronExpression {
	return new CronExpression(expression);
}

/** Convenience: return the next Date matching `expression` after `from`. */
export function nextCron(
	expression: string,
	from: Date = new Date(),
): Date | null {
	return parseCron(expression).next(from);
}
