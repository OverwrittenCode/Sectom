import type { NonEmptyObject } from "type-fest";

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

	public static isValidObjectArray(array: any): array is Array<NonEmptyObject<Record<string, any>>> {
		return this.isValidArray(array) && array.every(this.isValidObject);
	}

	public static isDateString(str: unknown): boolean {
		if (typeof str !== "string") {
			return false;
		}

		const d = new Date(str);
		return d instanceof Date && !isNaN(d.getTime());
	}

	public static uniqueArray<T>(array: T[]): T[] {
		return [...new Set(array)];
	}

	public static splitArrayChunks<T>(array: T[], chunk: number): T[][] {
		const result: T[][] = [];

		for (let index = 0; index < array.length; index += chunk) {
			result.push(array.slice(index, index + chunk));
		}

		return result;
	}
}
