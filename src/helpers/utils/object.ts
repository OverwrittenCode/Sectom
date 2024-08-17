import type { EmptyObject, Entries, NonEmptyObject, Simplify } from "type-fest";

type EntriesOutput<T extends object, Options extends EntriesOptions | undefined = undefined> = Entries<
	Options extends { excludeUndefined?: true } ? { [K in keyof T]-?: Exclude<T[K], undefined> } : T
>;

type KeysOutput<T extends object> = Array<keyof T extends never ? string : keyof T>;

interface EntriesOptions {
	excludeUndefined?: boolean;
	sortByTypeof?: boolean;
}

interface UpdatesByDiscriminator<T> {
	before: Partial<T>;
	after: Partial<T>;
}

interface ChangesByDiscriminator<T> {
	added: T[];
	removed: T[];
	updated: UpdatesByDiscriminator<T>[];
}

export abstract class ObjectUtils {
	public static cloneObject<T>(obj: T): T {
		return JSON.parse(JSON.stringify(obj)) as T;
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

	public static functionStack<T extends (...args: any[]) => any>(...funcs: T[]): T {
		const fn = (...args: any[]) => funcs.forEach((func) => func(...args));

		return fn as unknown as T;
	}

	public static getChangesByDiscriminator<T extends Record<string, any>>(
		before: T[],
		after: T[],
		discriminator: keyof T
	): ChangesByDiscriminator<T> {
		const findIndexInArray = (arr: T[], value: T, discriminator: keyof T) =>
			arr.findIndex((item) => item[discriminator] === value[discriminator]);

		const [added, removed] = [after, before].map((value, i, arr) =>
			value.filter((item) => findIndexInArray(arr[(i + 1) % 2], item, discriminator) === -1)
		);

		const updated = after.reduce((acc, afterObj) => {
			const beforeIndex = findIndexInArray(before, afterObj, discriminator);

			if (beforeIndex === -1 || !before[beforeIndex]) {
				return acc;
			}

			const changes: UpdatesByDiscriminator<T> = { before: {}, after: {} };

			let hasChanges = false;

			this.keys(afterObj).forEach((key) => {
				const afterValue = afterObj[key];
				const beforeValue = before[beforeIndex][key];

				if (JSON.stringify(afterValue) !== JSON.stringify(beforeValue)) {
					changes.before[key] = beforeValue;
					changes.after[key] = afterValue;

					hasChanges = true;
				}
			});

			return hasChanges ? [...acc, changes] : acc;
		}, [] as UpdatesByDiscriminator<T>[]);

		return { added, removed, updated };
	}

	public static isDateString(str: unknown): boolean {
		if (typeof str !== "string") {
			return false;
		}

		const d = new Date(str);

		return d instanceof Date && !isNaN(d.getTime());
	}

	public static isEmptyObject(obj: object): obj is EmptyObject {
		return obj !== null && this.keys(obj).length === 0;
	}

	public static isValidArray(array: any): array is any[] {
		return Array.isArray(array) && array.length > 0;
	}

	public static isValidObject(obj: unknown): obj is NonEmptyObject<Record<string, any>> {
		return typeof obj === "object" && obj !== null && obj !== undefined && this.keys(obj).length > 0;
	}

	public static keys<T extends object>(obj: T | object): Simplify<KeysOutput<T>> {
		return Object.keys(obj) as KeysOutput<T>;
	}

	public static pickKeys<T, U extends Array<keyof T>>(obj: T, properties: U): Simplify<Pick<T, U[number]>>;
	public static pickKeys<T, U extends keyof T>(obj: T, ...properties: U[]): Simplify<Pick<T, U>>;
	public static pickKeys<T, U extends keyof T>(
		obj: T,
		propertiesOrFirstProperty: U | U[],
		...restProperties: U[]
	): Simplify<Pick<T, U>> {
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

	public static randomElement<T>(array: T[]): T {
		return array[Math.floor(Math.random() * array.length)];
	}

	public static async sleep(duration: number) {
		return await new Promise((resolve) => setTimeout(resolve, duration));
	}
}
