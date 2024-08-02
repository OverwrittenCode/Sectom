import { type Prisma } from "@prisma/client";
import { Query } from "@upstash/query";
import { Redis } from "@upstash/redis";

import { RedisDataService } from "~/framework/services/RedisDataService.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import type { Typings } from "~/ts/Typings.js";

import { DBConnectionManager } from "./DBConnectionManager.js";

import type { Entries } from "type-fest";

type PrismaDoc<M extends Prisma.ModelName> = Typings.Database.Prisma.RetrieveModelDocument<M>;

type TDoc<M extends Prisma.ModelName> = Typings.Database.DocumentInput<M>;

export abstract class RedisCacheManager<
	const M extends Prisma.ModelName,
	const IndexList extends Typings.Database.Redis.TTerms<M>[] = []
> extends RedisDataService<M> {
	private readonly queryClient: Query;

	protected override readonly modelName: M;

	public readonly collection: Typings.Database.Redis.ModelCollection<M>;
	public readonly prismaModel: (typeof DBConnectionManager.Prisma)[Lowercase<M>];
	public readonly indexes = {} as Typings.Database.Redis.IndexObject<M, IndexList[number]>;

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
			indexList.forEach((data, i) => {
				const name = RedisCacheManager.toIndexKey(data);
				const terms = indexList[i];

				const indexValue = this.collection.createIndex({
					name,
					terms
				});

				Object.assign(this.indexes, { [name]: indexValue });
			});
		}
	}

	public static toIndexKey(tterms: string[]): string {
		return `by${tterms.map((v) => StringUtils.capitaliseFirstLetter(v)).join("And")}`;
	}

	public async delete(id: string): Promise<"OK"> {
		await this.collection.delete(id);

		return "OK";
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

	public async get(input: TDoc<M> | string): ReturnType<Typings.Database.Redis.ModelCollection<M>["get"]> {
		const doc = typeof input === "string" ? { id: input } : this.withIDField(input);

		return await this.collection.get(doc.id);
	}

	public async retrieveDocuments(filter?: Typings.Database.SimpleWhere<M>): Promise<PrismaDoc<M>[]> {
		const allDocuments = await this.collection.list();

		let expectedCases = allDocuments.map((doc) => doc.data);

		if (!filter) {
			return expectedCases;
		}

		const { OR, ...mainFilter } = filter;

		const mainFilterEntries = ObjectUtils.entries<Omit<Typings.Database.SimpleWhere, "OR">>(mainFilter, {
			excludeUndefined: true
		});

		if (!mainFilterEntries.length) {
			return expectedCases;
		}

		const applyFilter = (
			data: Record<string, unknown>,
			entries: Entries<Omit<Typings.UnionToIntersection<Typings.Database.SimpleWhere>, "OR">>
		) =>
			entries.every(([key, value]) => {
				if (ObjectUtils.isValidObject(value) && ("in" in value || "notIn" in value)) {
					const boolMatch = "in" in value;
					const toSearch = Object.values(value);

					return toSearch.includes(data[key]) === boolMatch;
				}

				return data[key] === value;
			});

		expectedCases = expectedCases.filter((data: Record<string, unknown>) => applyFilter(data, mainFilterEntries));

		if (!expectedCases.length || !OR) {
			return expectedCases;
		}

		const orFilterEntriesMap = OR.map((filter) =>
			ObjectUtils.entries<Omit<Typings.Database.SimpleWhere, "OR">>(filter, { excludeUndefined: true })
		);

		return expectedCases.filter((data: Record<string, any>) =>
			orFilterEntriesMap.some((entries) => applyFilter(data, entries))
		);
	}

	public async set(input: TDoc<M>): Promise<"OK"> {
		const doc = this.withIDField(input);

		await this.collection.set(doc.id, doc as PrismaDoc<M>);
		return "OK";
	}

	public async update(after: TDoc<M>) {
		const doc = this.withIDField(after);

		return await this.collection.update(doc.id, doc as PrismaDoc<M>);
	}
}
