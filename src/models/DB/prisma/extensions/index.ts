import assert from "assert";

import { Prisma } from "@prisma/client";
import { container } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import { GuildInstanceMethods } from "~/models/DB/prisma/extensions/guild.js";
import { RedisCacheManager } from "~/models/framework/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";

import { CaseInstanceMethods } from "./case.js";
import { EntityInstanceMethods } from "./entity.js";
import { LevelingInstanceMethods } from "./leveling.js";

import type {
	ClientCTX,
	FetchFunctions,
	FetchOperationUnion,
	FetchOptions,
	FetchOutput,
	FetchShadowDoc,
	FetchSimpleSelect,
	FetchableOperations,
	FlushDBResult,
	IWithSave,
	ModelCTX,
	RetrieveModelName,
	ShadowCTXName as ShadowCTXModelName
} from "./types/index.js";

type Doc<M extends Prisma.ModelName = Prisma.ModelName> = Typings.Database.Prisma.RetrieveModelDocument<M>;

export abstract class PrismaExtensions {
	public static modelMethods = Prisma.defineExtension((client) => {
		const fetchOperations = [
			"fetchFirst",
			"fetchFirstOrThrow",
			"fetchById",
			"fetchByIdOrThrow",
			"fetchMany"
		] as const satisfies Array<FetchOperationUnion>;

		const fetchExtendedClient = client.$extends({
			name: "fetch-methods-extension",
			model: {
				$allModels: fetchOperations.reduce((acc, curr) => {
					const operation = curr.replace("fetch", "find").replace("ById", "Unique") as FetchableOperations;

					const isThrowOperation = operation === "findFirstOrThrow" || operation === "findUniqueOrThrow";

					return {
						...acc,
						[curr]: async function <TModel, _, O extends FetchOptions<TModel>>(
							this: TModel,
							options: O
						): Promise<Typings.Prettify<FetchOutput<TModel>>> {
							const { select } = options;

							/**
							 * - not possible to call union, so we shadow the variables
							 * - here the typings provides an idea of what the structures look like
							 * - but only for a specific model, so we have to consider for every model
							 */
							const shadowCtx = Prisma.getExtensionContext(this) as unknown as ModelCTX<TModel, true>;

							const shadowCtxNameLowercase =
								shadowCtx.$name.toLowerCase() as Lowercase<ShadowCTXModelName>;

							const shadowClientModel = client[shadowCtxNameLowercase];
							const shadowRedisModel = RedisCache[shadowCtxNameLowercase];

							const idSelect = ObjectUtils.entries(shadowRedisModel.pickIDFields()).reduce(
								(acc, [key]) => Object.assign(acc, { [key]: true }),
								{} as Record<string, true>
							);

							if (select) {
								// make sure that we retrieve id fields for the save method
								Object.assign(select, idSelect);
							}

							const shadowSelect = select as Typings.Database.SimpleSelect<ShadowCTXModelName>;

							let take = undefined;

							if ("take" in options) {
								take = options.take;
							}

							const orderBy =
								"orderBy" in options
									? Array.isArray(options.orderBy)
										? options.orderBy
										: [options.orderBy]
									: [];
							const shadowOrderBy = orderBy as unknown as
								| Record<
										keyof Typings.Database.OnlyFilterableTypes<
											Typings.Database.SimpleSelect<"Case">
										>,
										Prisma.SortOrder
								  >
								| undefined;

							let shadowCreateData:
								| Prisma.TypeMap["model"][ShadowCTXModelName]["operations"][
										| "create"
										| "createMany"]["args"]["data"]
								| undefined;

							if ("createData" in options) {
								assert(!isThrowOperation);

								shadowCreateData = options.createData as typeof shadowCreateData;
							}

							let shadowDoc: FetchShadowDoc = null;
							let shadowCacheDocs: FetchShadowDoc = null;
							let shadowWhere: Typings.Database.OnlyFilterableTypes<
								Typings.Database.SimpleWhere<ShadowCTXModelName> | { id: string }
							>;

							if ("id" in options) {
								const shadowId = options.id as Typings.Database.SimpleUniqueWhereId;
								shadowWhere = typeof shadowId === "string" ? { id: shadowId } : shadowId;

								const shadowCacheRecordId = Object.values(
									Object.fromEntries(
										// ensures the id field order is correct;
										shadowRedisModel.idFields.map((idField) => [idField, shadowWhere[idField]])
									)
								).join("_");

								const shadowCacheRecord = await shadowRedisModel.get(shadowCacheRecordId);

								shadowCacheDocs = shadowCacheRecord?.data;
							} else {
								shadowWhere = (options.where ??
									{}) as unknown as Typings.Database.SimpleWhere<ShadowCTXModelName>;
								shadowCacheDocs = [];

								const keys = ObjectUtils.keys(shadowWhere);

								const shadowIndexKey = RedisCacheManager.toIndexKey(keys) as "byGuildId";

								if (!keys.includes("OR") && shadowIndexKey in shadowRedisModel.indexes) {
									const shadowIndexRecords = await shadowRedisModel.indexes[shadowIndexKey].match(
										shadowWhere as { guildId: string }
									);

									shadowCacheDocs = shadowIndexRecords.map(({ data }) => data);
								} else {
									shadowCacheDocs = await shadowRedisModel.retrieveDocuments(shadowWhere);
								}

								if (operation === "findMany") {
									if (shadowOrderBy) {
										shadowCacheDocs.sort((a, b) => {
											for (const [orderKey, sortOrder] of ObjectUtils.entries(shadowOrderBy)) {
												const output = sortOrder === "asc" ? -1 : 1;

												const aValue: any = a[orderKey];
												const bValue: any = b[orderKey];

												if (aValue < bValue) {
													return output;
												}

												if (aValue > bValue) {
													return -output;
												}
											}
											return 0;
										});
									}

									if (take) {
										shadowCacheDocs = shadowCacheDocs.slice(0, take);
									}
								} else {
									shadowCacheDocs = shadowCacheDocs[0];
								}
							}

							if (!ObjectUtils.isValidArray(shadowCacheDocs) && operation === "findMany") {
								const fn = shadowClientModel[operation];

								shadowDoc = await fn({
									where: shadowWhere,
									select: shadowSelect,
									orderBy: shadowOrderBy
								});

								if (!shadowDoc.length && shadowCreateData) {
									shadowDoc = await shadowClientModel.createManyAndReturn({
										data: shadowCreateData as Extract<typeof shadowCreateData, any[]>,
										select: shadowSelect
									});
								}
							} else if (!shadowCacheDocs) {
								const shadowOperation = operation as "findFirst";

								const shadowFn = shadowClientModel[shadowOperation];

								shadowDoc = await shadowFn({ where: shadowWhere, select: shadowSelect });

								if (!shadowDoc && shadowCreateData) {
									shadowDoc = await shadowClientModel.create({
										data: shadowCreateData as Prisma.CaseCreateInput,
										select: shadowSelect
									});
								}
							} else {
								shadowDoc = shadowCacheDocs;
							}

							if (Array.isArray(shadowDoc) && operation !== "findMany") {
								shadowDoc = shadowDoc[0];
							}

							if (!shadowDoc && "validationError" in options && options.validationError) {
								throw new ValidationError(InteractionUtils.Messages.NoData);
							}

							if (shadowDoc && !Array.isArray(shadowDoc)) {
								return new WithSave<TModel>(
									shadowDoc as Doc<RetrieveModelName<TModel>>,
									shadowCtx
								) as unknown as FetchOutput<TModel>;
							}

							return shadowDoc as FetchOutput<TModel>;
						}
					};
				}, {} as FetchFunctions)
			}
		});

		container.register(Beans.IPrismaFetchClientToken, { useValue: fetchExtendedClient });

		return fetchExtendedClient.$extends({
			name: "model-methods-extension",
			model: {
				leveling: this.createBoundModel(container.resolve(LevelingInstanceMethods)),
				entity: this.createBoundModel(container.resolve(EntityInstanceMethods)),
				case: this.createBoundModel(container.resolve(CaseInstanceMethods)),
				guild: this.createBoundModel(container.resolve(GuildInstanceMethods))
			}
		});
	});

	public static clientMethods = Prisma.defineExtension((client) => {
		return client.$extends({
			name: "client-methods-extension",
			client: {
				async $flushdb<T>(this: T) {
					const ctx = Prisma.getExtensionContext(this) as unknown as ClientCTX;
					const modelNames = Object.values(Prisma.ModelName).map(
						(str) => str.toLowerCase() as Lowercase<Prisma.ModelName>
					);

					const pendingBatchPayloads = modelNames.map((modelName) => {
						const v = ctx[modelName as "case"];

						return v.deleteMany();
					});

					const batchPayloads = await client.$transaction(pendingBatchPayloads);

					const result = batchPayloads.reduce(
						(acc, { count }, index) => {
							acc._totalCount += count;
							acc[modelNames[index]] = count;
							return acc;
						},
						{ _totalCount: 0 } as FlushDBResult
					);

					return result;
				}
			}
		});
	});

	private static createBoundModel<T>(instance: T): { [K: symbol]: any } & T {
		const model = {} as T;
		const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(instance)) as (keyof T)[];

		methodNames.forEach((methodName) => {
			if (methodName !== "constructor" && typeof instance[methodName] === "function") {
				model[methodName] = (instance[methodName] as any).bind(instance);
			}
		});

		// Prisma applies a symbol index signature to extensions
		// And will reject the model without it
		return model as { [K: symbol]: any } & T;
	}
}

class WithSave<TModel> implements IWithSave<TModel> {
	private shadowCtx: ModelCTX<any, true>;
	private idFields: PrismaJson.IDLink;
	/**
	 * - If the model has relations, Prisma will throw an error if id fields are provided in update#data
	 * - and we don't want to modify the createdAt/updatedAt information, let the database handle that
	 */
	private nonUpdatedFields: PrismaJson.IDLink & Pick<Doc, "createdAt" | "updatedAt">;

	public doc: Doc<RetrieveModelName<TModel>>;

	constructor(doc: Doc<RetrieveModelName<TModel>>, ctx: ModelCTX<any, true>) {
		this.idFields = RedisCache[ctx.$name.toLowerCase() as Lowercase<ShadowCTXModelName>].pickIDFields(doc);

		this.nonUpdatedFields = Object.assign(this.idFields, ObjectUtils.pickKeys(doc, "createdAt", "updatedAt"));

		this.doc = doc;
		this.shadowCtx = ctx;
		this.save = this.save.bind(this);
	}

	public async save<const T extends FetchSimpleSelect<TModel>>(
		select?: T
	): Promise<Typings.Database.SimpleSelectOutput<RetrieveModelName<TModel>, T>> {
		ObjectUtils.keys(this.nonUpdatedFields).forEach((field) => {
			if (field in this.doc) {
				delete this.doc[field];
			}
		});

		const result = await this.shadowCtx.update({
			where: this.nonUpdatedFields,
			data: this.doc,
			select
		});

		return result as Typings.Database.SimpleSelectOutput<RetrieveModelName<TModel>, T>;
	}
}
