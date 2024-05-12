import type { Typings } from "~/ts/Typings.js";

import type { NonEmptyObject, WritableDeep } from "type-fest";

export abstract class ObjectUtils {
	public static isValidObject(obj: unknown): obj is NonEmptyObject<Record<string, any>> {
		return typeof obj === "object" && obj !== null && obj !== undefined && Object.keys(obj).length > 0;
	}

	public static isEmptyObject(obj: object): boolean {
		return obj !== null && Object.keys(obj).length === 0;
	}

	public static isValidArray(array: any): array is any[] {
		return Array.isArray(array) && array.length > 0;
	}

	public static isDateString(str: unknown): boolean {
		if (typeof str !== "string") {
			return false;
		}

		const d = new Date(str);
		return d instanceof Date && !isNaN(d.getTime());
	}

	public static cloneObject<T>(obj: T): WritableDeep<T> {
		return JSON.parse(JSON.stringify(obj)) as WritableDeep<T>;
	}

	public static pickKeys<T, U extends keyof T>(obj: T, ...properties: U[]): Typings.Prettify<Pick<T, U>> {
		return properties.reduce(
			(result, prop) => {
				result[prop] = obj[prop];
				return result;
			},
			{} as Pick<T, U>
		);
	}
}
