/**
 * Tests for nexus/logger.
 */

import { describe, it, expect } from "vitest";
import {
	Logger,
	NullTransport,
	PrettyTransport,
} from "../../src/logger/index.js";
import type { LogRecord, LogTransport } from "../../src/logger/types.js";

class CapturingTransport implements LogTransport {
	readonly name = "capturing";
	readonly isDefault = true;
	records: LogRecord[] = [];
	write(record: LogRecord): void {
		this.records.push(record);
	}
}

describe("Logger", () => {
	it("emits records to all transports", () => {
		const a = new CapturingTransport();
		const b = new CapturingTransport();
		const logger = new Logger({
			transports: [a, b],
			level: "debug",
			silent: false,
		});
		logger.info("hello");
		logger.debug({ x: 1 }, "debug-msg");
		expect(a.records).toHaveLength(2);
		expect(b.records).toHaveLength(2);
		expect(a.records[0]?.msg).toBe("hello");
		expect(a.records[0]?.level).toBe("info");
	});

	it("respects the level filter", () => {
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [cap], level: "warn" });
		logger.info("should-be-dropped");
		logger.warn("should-keep");
		expect(cap.records).toHaveLength(1);
		expect(cap.records[0]?.msg).toBe("should-keep");
	});

	it("silent mode drops every record", () => {
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [cap], silent: true });
		logger.info("x");
		expect(cap.records).toHaveLength(0);
	});

	it("with() injects context into emitted records", async () => {
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [cap], level: "debug" });
		await logger.with({ requestId: "r-1", userId: "u-1" }, () => {
			logger.info("inner");
		});
		expect(cap.records[0]?.requestId).toBe("r-1");
		expect(cap.records[0]?.userId).toBe("u-1");
	});

	it("with() is scoped — does not leak outside the callback", () => {
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [cap], level: "debug" });
		logger.with({ requestId: "r-1" }, () => {
			logger.info("inner");
		});
		logger.info("outer");
		expect(cap.records[0]?.requestId).toBe("r-1");
		expect(cap.records[1]?.requestId).toBeUndefined();
	});

	it("child() merges bindings into every record", () => {
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [cap], level: "debug" });
		const sub = logger.child({ service: "svc-a" });
		sub.info("hello");
		expect(cap.records[0]?.service).toBe("svc-a");
	});

	it("catches a transport exception and continues", () => {
		const broken: LogTransport = {
			name: "broken",
			isDefault: true,
			write() {
				throw new Error("transport-error");
			},
		};
		const cap = new CapturingTransport();
		const logger = new Logger({ transports: [broken, cap], level: "debug" });
		expect(() => logger.info("x")).not.toThrow();
		expect(cap.records).toHaveLength(1);
	});

	it("NullTransport drops everything", () => {
		const n = new NullTransport();
		expect(() => n.write({ level: "info", time: 0, msg: "x" })).not.toThrow();
	});

	it("PrettyTransport writes to stdout via pino-pretty (or plain JSON fallback)", () => {
		// Just exercise the constructor and write path; do not assert stdout content.
		const t = new PrettyTransport("info");
		expect(() =>
			t.write({ level: "info", time: Date.now(), msg: "hello" }),
		).not.toThrow();
	});
});
