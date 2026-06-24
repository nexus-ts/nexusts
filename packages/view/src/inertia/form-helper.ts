/**
 * Inertia `<Form>` server-side helper.
 *
 * Mirrors the Inertia v3 client-side `<Form>` component behaviour:
 *
 * 1. Controllers wrap form actions with `inertia.form(...)`.
 * 2. They validate input (typically with Zod). On failure they call
 *    `.withErrors(...).render()` and the page re-renders with the
 *    `errors` and (optionally) `errorBag` props injected.
 * 3. On success they call `.redirect(url)` which emits a 303 — the
 *    PRG (Post-Redirect-Get) pattern that prevents double-submits.
 * 4. `.withValues(input)` re-populates the form after a validation
 *    failure so the user does not have to retype everything.
 *
 * The `errors` prop is special-cased by the Inertia client: it surfaces
 * validation errors to form fields automatically when you wire up the
 * matching `useForm` hook. `errorBag` lets multiple forms on the same
 * page coexist (each form has its own error namespace).
 *
 * @example
 * ```ts
 * @Post('/users')
 * async store(@Body() input: any) {
 *   const form = this.inertia.form('Users/Create');
 *   const result = UserSchema.safeParse(input);
 *   if (!result.success) {
 *     return form
 *       .withErrorBag('createUser')
 *       .withErrors(result.error.flatten().fieldErrors)
 *       .withValues(input)
 *       .render();
 *   }
 *   await this.userService.create(result.data);
 *   return form.redirect('/users');
 * }
 * ```
 */
import type { Inertia } from "./inertia-adapter.js";
import type { InertiaResponse } from "./inertia-response.js";

/**
 * Value shape for `withErrors`. Each field maps to a string (single
 * error) or an array of strings (multiple errors).
 */
export type ErrorMap = Record<string, string | string[]>;

/**
 * Builder for an Inertia form response. Fluent API — every method
 * returns `this` so calls can be chained.
 */
export class InertiaFormBuilder {
	private props: Record<string, any>;
	private errorMap: Record<string, string[]> = {};
	private errorBagName?: string;

	constructor(
		private readonly adapter: Inertia,
		private readonly component: string,
		initialProps: Record<string, any> = {},
	) {
		this.props = { ...initialProps };
	}

	// ============================================================================
	// Builder methods — all return `this` for chaining.
	// ============================================================================

	/** Merge a batch of props at once. */
	withProps(extra: Record<string, any>): this {
		Object.assign(this.props, extra);
		return this;
	}

	/** Set a single prop. */
	with(key: string, value: any): this {
		this.props[key] = value;
		return this;
	}

	/**
	 * Attach validation errors. Each field maps to a string (single
	 * error) or string[] (multiple). Strings are wrapped in arrays
	 * internally to keep the shape uniform.
	 */
	withErrors(errors: ErrorMap): this {
		for (const [field, message] of Object.entries(errors)) {
			const list = Array.isArray(message) ? message : [message];
			// Merge with existing errors on the same field.
			this.errorMap[field] = [...(this.errorMap[field] ?? []), ...list];
		}
		return this;
	}

	/** Add a single error to a field. */
	withError(field: string, message: string): this {
		this.errorMap[field] ??= [];
		this.errorMap[field].push(message);
		return this;
	}

	/**
	 * Name the form's error namespace. Useful when multiple forms share
	 * a page; each `useForm` hook on the client can read its own bag.
	 */
	withErrorBag(name: string): this {
		this.errorBagName = name;
		return this;
	}

	/**
	 * Re-populate the form with the originally submitted values so
	 * users don't have to retype them after a validation failure.
	 */
	withValues(values: Record<string, any>): this {
		this.props.values = values;
		return this;
	}

	// ============================================================================
	// Terminal methods — emit the actual response.
	// ============================================================================

	/**
	 * Render the page with the (possibly error-laden) props. If any
	 * errors were attached, they are automatically injected as the
	 * `errors` prop (and `errorBag` if a bag name was set).
	 */
	render(): InertiaResponse {
		if (Object.keys(this.errorMap).length > 0) {
			this.props.errors = { ...this.errorMap };
		}
		if (this.errorBagName) {
			this.props.errorBag = this.errorBagName;
		}
		return this.adapter.render(this.component, this.props);
	}

	/**
	 * Issue a 303 redirect. 303 is the right status for non-GET methods
	 * (POST/PUT/PATCH/DELETE) because it forces the client to follow up
	 * with a GET — i.e. the PRG pattern. This prevents the browser from
	 * resubmitting the form on refresh.
	 */
	redirect(url: string): Response {
		return new Response(null, {
			status: 303,
			headers: { Location: url },
		});
	}

	/**
	 * Navigate back to the previous page (the Inertia client interprets
	 * `Location: back` and steps one entry in its history). If `to` is
	 * provided, redirect there instead.
	 */
	back(to?: string): Response {
		return new Response(null, {
			status: 303,
			headers: { Location: to ?? "back" },
		});
	}

	// ============================================================================
	// Inspection — useful in tests.
	// ============================================================================

	/** Read the currently-accumulated errors (without rendering). */
	getErrors(): Record<string, string[]> {
		return { ...this.errorMap };
	}

	/** Read the current prop draft. */
	getProps(): Record<string, any> {
		return { ...this.props };
	}
}
