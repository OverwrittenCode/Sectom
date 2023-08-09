import type { TitleCase } from "./ts/General.js";

export function capitalizeFirstLetter<T extends string>(str: T): TitleCase<T> {
	const value = str.charAt(0).toUpperCase() + str.slice(1);
	return value as TitleCase<T>;
}

export type Concatenate<T extends any[]> = T extends []
	? ""
	: T extends [infer F, ...infer R]
	? F extends string
		? F extends ""
			? `${F}${Concatenate<R>}`
			: `${F}${R extends [] ? "" : " "}${Concatenate<R>}`
		: never
	: never;

export function concatenate<T extends string[]>(...strs: T): Concatenate<T> {
	let result = "";
	for (let i = 0; i < strs.length; i++) {
		result += strs[i];
		if (i < strs.length - 1 && strs[i] !== "") {
			result += " ";
		}
	}
	return result as Concatenate<T>;
}
