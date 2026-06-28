/**
 * InputValue — a chained validation/sanitization helper for the standard
 * decorator era. Replaces @Param(), @Query(), @Body() parameter decorators.
 *
 * Usage:
 * ```ts
 * const id   = ctx.param("id").number().required().value();
 * const name = ctx.query("name").trim().max(100).value();
 * ```
 *
 * Method chaining returns a new InputValue each time so the original raw
 * value is never mutated.
 */

export type InputSanitizer<T = any> = (val: T) => T;

export interface InputValueChain<T = any> {
	/** Trim whitespace (string only). */
	trim(): InputValueChain<string>;

	/**
	 * Basic HTML-entity escape (< → &lt; etc.).
	 * This is a SANITIZATION step — use for search terms / display inputs
	 * that will be embedded directly. For raw DB storage, prefer output-side
	 * escaping in your template engine.
	 */
	escape(): InputValueChain<string>;

	/** Cast to number (parseFloat). */
	number(): InputValueChain<number>;

	/** Cast to integer (parseInt 10). */
	int(): InputValueChain<number>;

	/** Throw / return undefined if the value is null/undefined/empty-string. */
	required(): InputValueChain<T>;

	/** If value is null/undefined/NaN, use the given default. */
	default(fallback: T): InputValueChain<T>;

	/** String max length (no-op for non-strings). */
	max(len: number): InputValueChain<string>;

	/** String min length (no-op for non-strings). */
	min(len: number): InputValueChain<string>;

	/**
	 * Custom sanitizer function. Receives the current value, returns
	 * the transformed value.
	 */
	pipe<S>(sanitizer: InputSanitizer<S>): InputValueChain<S>;

	/** Final unwrap — returns the current value. */
	value(): T;
}

class InputValueImpl<T = any> implements InputValueChain<T> {
	constructor(private current: T) {}

	trim(): InputValueChain<string> {
		if (typeof this.current === "string") {
			return new InputValueImpl(this.current.trim());
		}
		return this as any;
	}

	escape(): InputValueChain<string> {
		if (typeof this.current === "string") {
			const escaped = this.current
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#x27;");
			return new InputValueImpl(escaped);
		}
		return this as any;
	}

	number(): InputValueChain<number> {
		if (this.current == null || this.current === "") {
			return new InputValueImpl(NaN);
		}
		const n = Number(this.current);
		return new InputValueImpl(Number.isNaN(n) ? NaN : n);
	}

	int(): InputValueChain<number> {
		if (this.current == null || this.current === "") {
			return new InputValueImpl(NaN);
		}
		const n = parseInt(String(this.current), 10);
		return new InputValueImpl(Number.isNaN(n) ? NaN : n);
	}

	required(): InputValueChain<T> {
		if (
			this.current === null ||
			this.current === undefined ||
			this.current === ""
		) {
			throw new Error("InputValue: required value is missing");
		}
		if (typeof this.current === "number" && Number.isNaN(this.current)) {
			throw new Error("InputValue: required value is NaN");
		}
		return this;
	}

	default(fallback: T): InputValueChain<T> {
		if (
			this.current === null ||
			this.current === undefined ||
			(typeof this.current === "number" && Number.isNaN(this.current)) ||
			this.current === ""
		) {
			return new InputValueImpl(fallback);
		}
		return this;
	}

	max(len: number): InputValueChain<string> {
		if (typeof this.current === "string" && this.current.length > len) {
			return new InputValueImpl(this.current.slice(0, len));
		}
		return this as any;
	}

	min(len: number): InputValueChain<string> {
		if (
			typeof this.current === "string" &&
			this.current.length < len
		) {
			throw new Error(
				`InputValue: value must be at least ${len} characters`,
			);
		}
		return this as any;
	}

	pipe<S>(sanitizer: InputSanitizer<S>): InputValueChain<S> {
		return new InputValueImpl<S>(sanitizer(this.current as any));
	}

	value(): T {
		return this.current;
	}
}

/**
 * Create an InputValue chain from a raw value.
 */
export function inputValue<T = any>(raw: T): InputValueChain<T> {
	return new InputValueImpl(raw);
}
