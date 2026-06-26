/**
 * Convenience barrel for all decorators.
 */
export * from "./module.js";
export * from "./controller.js";
export * from "./http-methods.js";
export * from "./params.js";
export * from "./validate.js";
export * from "./repository.js";
export * from "./metadata.js";
export * from "./global.js";

// Standard-mode Injectable + Inject (dual-mode, supports TC39 + legacy)
export {
	Injectable,
	Inject,
	isInjectableStandard as isInjectable,
	getScope,
	type InjectableOptions,
	type InjectableScope,
} from "../di/standard-inject.js";
