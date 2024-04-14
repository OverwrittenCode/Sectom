import { Beans } from "@framework/DI/Beans.js";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { Typings } from "@ts/Typings.js";
import { container } from "tsyringe";

import { CaseInstanceMethods } from "./case.js";
import { EntityInstanceMethods } from "./entity.js";
import { LevelingInstanceMethods } from "./leveling.js";

interface $NameCTX<M extends Prisma.ModelName = Prisma.ModelName> {
	$name: M;
}

type ClientCTX<M extends Prisma.ModelName = Prisma.ModelName, Inner extends boolean = false> = {
	[K in Lowercase<M>]: Typings.DisplaceObjects<
		PrismaClient[K] & $NameCTX<Typings.TitleCase<K>>,
		{ fields: {}; $parent: ClientCTX<Typings.TitleCase<K>, true> }
	>;
} extends infer R
	? Inner extends false
		? R
		: R & $NameCTX<M>
	: never;

type ModelCTX<M extends Prisma.ModelName = Prisma.ModelName> = ClientCTX<M, true> & { $parent: ClientCTX<M, true> };

type FlushDBResult = {
	_totalCount: number;
} & {
	[K in Lowercase<Prisma.ModelName>]: number;
};

export abstract class PrismaExtensions {
	public static computedFields = Prisma.defineExtension((client) => {
		return client.$extends({
			name: "computed-fields-extension",
			result: {
				leveling: {
					id: {
						needs: { guildId: true, entityId: true },
						compute({ guildId, entityId }) {
							return `${guildId}_${entityId}`;
						}
					}
				}
			}
		});
	});

	public static modelMethods = Prisma.defineExtension((client) => {
		container.register(Beans.IExtensionInstanceMethods, { useValue: client });

		return client.$extends({
			name: "method-methods-extension",
			model: {
				leveling: {
					get instanceMethods() {
						return container.resolve(LevelingInstanceMethods);
					}
				},
				entity: {
					get instanceMethods() {
						return container.resolve(EntityInstanceMethods);
					}
				},
				case: {
					get instanceMethods() {
						return container.resolve(CaseInstanceMethods);
					}
				}
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
						const v = ctx[modelName as "guild"];

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
}
