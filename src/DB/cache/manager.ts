import lodash from "lodash";
import { FlattenMaps, Require_id } from "mongoose";
import { TypegooseDocumentType } from "../../utils/ts/General.js";
import { redis } from "./index.js";
const { compact } = lodash;

export type CacheDocument<T> = FlattenMaps<Require_id<T>> & { _id: string };

export class CacheManager<T> {
	protected readonly prefix: string;
	protected readonly uniqueProperty: keyof T | "_id";
	constructor(prefix: string, uniqueProperty: keyof T | "_id") {
		this.prefix = prefix;
		this.uniqueProperty = uniqueProperty;
	}

	public async set(document: TypegooseDocumentType<T>) {
		const uniqueValue =
			document[this.uniqueProperty as keyof typeof document];

		const cacheData = JSON.stringify(document.toJSON(), null, 2);

		const key = this.prefix + uniqueValue;
		try {
			await redis.set(key, cacheData);
			return JSON.parse(cacheData) as CacheDocument<T>;
		} catch (e) {
			if (e instanceof Error) {
				console.error(e.stack);
			}
			console.log(e);
		}
	}

	public async get<V extends string>(
		uniqueValue: V
	): Promise<CacheDocument<T> | null>;
	public async get<V extends undefined>(
		uniqueValue?: V
	): Promise<CacheDocument<T>[] | null>;
	public async get<V extends string | undefined>(uniqueValue?: V) {
		if (uniqueValue) {
			const key = this.prefix + uniqueValue;

			const cacheData = await redis.get(key);
			if (!cacheData) {
				return null;
			}

			const cacheDocument = JSON.parse(cacheData) as CacheDocument<T>;

			return cacheDocument;
		}

		const matchingKeys = await redis.keys(`${this.prefix}*`);

		const serializedCache = await redis.mget(...matchingKeys);

		const cacheDataArray = compact(serializedCache);
		if (cacheDataArray.length == 0) {
			return null;
		}

		const cacheDocumentArray = cacheDataArray.map(
			(data) => JSON.parse(data) as CacheDocument<T>
		);

		return cacheDocumentArray;
	}

	/**
	 * - Returns number of successfully deleted keys
	 * - Returns falsy value (0) if the key is not present
	 */
	public async remove(uniqueValue: string) {
		const key = this.prefix + uniqueValue;
		return await redis.del(key);
	}
}
