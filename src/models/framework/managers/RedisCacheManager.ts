import { Query } from "@upstash/query";
import { Redis } from "@upstash/redis";

import { RedisDataService } from "~/framework/services/RedisDataService.js";
import type { Typings } from "~/ts/Typings.js";
import { StringUtils } from "~/utils/string.js";

import { DBConnectionManager } from "./DBConnectionManager.js";

import type { Prisma } from "@prisma/client";
import type { Entries } from "type-fest";

type RedisDoc<M extends Prisma.ModelName> = Typings.Database.Redis.RetrieveModelDocument<M>;
type PrismaDoc<M extends Prisma.ModelName> = Typings.Database.Prisma.RetrieveModelDocument<M>;
type TDoc<M extends Prisma.ModelName> = Typings.Database.DocumentInput<M>;
type ModelDataFilterArray<M extends Prisma.ModelName, T extends Partial<RedisDoc<M>>> = Typings.DisplaceObjects<
	PrismaDoc<M>,
	T
>[];

export abstract class RedisCacheManager<
	const M extends Prisma.ModelName,
	const IndexList extends Typings.Database.Redis.TTerms<M>[] = []
> extends RedisDataService<M> {
	private readonly queryClient: Query;
	public readonly modelName: M;
	public readonly collection: Typings.Database.Redis.ModelCollection<M>;
	public readonly prismaModel: (typeof DBConnectionManager.Prisma)[Lowercase<M>];
	public indexes = {} as Typings.Database.Redis.IndexObject<M, IndexList[number]>;

	constructor(prismaModelName: M, indexList?: IndexList) {
		super(prismaModelName);

		this.modelName = prismaModelName;
		this.queryClient = new Query({
			redis: Redis.fromEnv({ automaticDeserialization: false }),
			encoderDecoder: new RedisDataService<M>(this.modelName)
		});
		this.collection = this.queryClient.createCollection<PrismaDoc<M>>(this.modelName);

		this.prismaModel = DBConnectionManager.Prisma[this.modelName.toLowerCase() as Lowercase<M>];

		if (indexList?.length) {
			indexList
				.map((data) => `by${data.map((v) => StringUtils.capitaliseFirstLetter(v)).join("And")}`)
				.forEach((indexKey, i) => {
					const indexValue = this.collection.createIndex({
						name: indexKey,
						terms: indexList[i]
					});

					Object.assign(this.indexes, { [indexKey]: indexValue });
				});
		}
	}

	public async set(input: TDoc<M>): Promise<"OK"> {
		const doc = this.withIDField(input);

		await this.collection.set(doc.id, doc as PrismaDoc<M>);
		return "OK";
	}

	public async delete(id: string): Promise<"OK"> {
		await this.collection.delete(id);

		return "OK";
	}

	public async get(input: TDoc<M> | string): ReturnType<Typings.Database.Redis.ModelCollection<M>["get"]> {
		const doc = typeof input === "string" ? { id: input } : this.withIDField(input);

		return await this.collection.get(doc.id);
	}

	public async update(after: TDoc<M>) {
		const doc = this.withIDField(after);
		return await this.collection.update(doc.id, doc as PrismaDoc<M>);
	}

	public async retrieveDocuments<const T extends Partial<RedisDoc<M>> = {}>(
		filter?: T
	): Promise<ModelDataFilterArray<M, T>> {
		const allDocuments = await this.collection.list();

		let expectedCases = allDocuments.map((doc) => doc.data) as unknown as ModelDataFilterArray<M, T>;

		if (!filter) {
			return expectedCases;
		}

		const filterEntries = Object.entries(filter).filter(([, v]) => typeof v !== "undefined") as Entries<
			RedisDoc<M>
		>;

		for (const [key, value] of filterEntries) {
			expectedCases = expectedCases.filter((data: Record<string, unknown>) => data[key] === value);

			if (!expectedCases.length) {
				break;
			}
		}

		return expectedCases;
	}

	public async deleteAll(): Promise<string[]> {
		let cursor = 0;
		const deletedKeys: string[] = [];
		do {
			const [nextCursor, keys] = await this.collection.redis.scan(cursor, { match: `${this.modelName}*` });

			if (keys.length > 0) {
				await this.collection.redis.del(...keys);
				deletedKeys.push(...keys);
			}

			cursor = nextCursor;
		} while (cursor !== 0);

		return deletedKeys;
	}
}
