import type { Typings } from "~/ts/Typings.js";

import type { EmptyObject, Entries, NonEmptyObject, WritableDeep } from "type-fest";

interface EntriesOptions {
	excludeUndefined?: boolean;
	sortByTypeof?: boolean;
}

type EntriesOutput<T extends object, Options extends EntriesOptions | undefined = undefined> = Entries<
	Options extends { excludeUndefined?: true } ? { [K in keyof T]-?: Exclude<T[K], undefined> } : T
>;

type KeysOutput<T extends object> = Array<keyof T extends never ? string : keyof T>;

export abstract class ObjectUtils {
	public static isValidObject(obj: unknown): obj is NonEmptyObject<Record<string, any>> {
		return typeof obj === "object" && obj !== null && obj !== undefined && this.keys(obj).length > 0;
	}

	public static isEmptyObject(obj: object): obj is EmptyObject {
		return obj !== null && this.keys(obj).length === 0;
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

	public static pickKeys<T, U extends Array<keyof T>>(obj: T, properties: U): Typings.Prettify<Pick<T, U[number]>>;
	public static pickKeys<T, U extends keyof T>(obj: T, ...properties: U[]): Typings.Prettify<Pick<T, U>>;
	public static pickKeys<T, U extends keyof T>(
		obj: T,
		propertiesOrFirstProperty: U | U[],
		...restProperties: U[]
	): Typings.Prettify<Pick<T, U>> {
		const properties = Array.isArray(propertiesOrFirstProperty)
			? propertiesOrFirstProperty
			: [propertiesOrFirstProperty, ...restProperties];
		return properties.reduce(
			(result, prop) => {
				result[prop] = obj[prop];
				return result;
			},
			{} as Pick<T, U>
		);
	}

	public static entries<T extends object, const Options extends EntriesOptions = EntriesOptions>(
		obj: T | object,
		options?: Options
	): EntriesOutput<T, Options> {
		let result = Object.entries(obj);

		if (options?.excludeUndefined) {
			result = result.filter(([, v]) => typeof v !== "undefined");
		}

		if (options?.sortByTypeof) {
			result = result.sort(([, a], [, b]) => {
				const typeA = typeof a;
				const typeB = typeof b;

				if (typeA === typeB) {
					return a > b ? 1 : -1;
				}

				return typeA > typeB ? 1 : -1;
			});
		}

		return result as EntriesOutput<T, Options>;
	}

	public static keys<T extends object>(obj: T | object): Typings.Prettify<KeysOutput<T>> {
		return Object.keys(obj) as KeysOutput<T>;
	}
}
