import pkg from "lodash";

import type { Typings } from "~/ts/Typings.js";
import { ObjectUtils } from "~/utils/object.js";

import type { Prisma } from "@prisma/client";
import type { Entries } from "type-fest";

const { isEmpty } = pkg;

// type PrismaDoc<M extends Prisma.ModelName> = Typings.Database.Prisma.RetrieveModelDocument<M>;
interface RedisRecord<M extends Prisma.ModelName = Prisma.ModelName> {
	id: string;
	data: Typings.Database.Redis.RetrieveModelDocument<M>;
	ts: number;
}

export class RedisDataService<const M extends Prisma.ModelName> {
	public modelName: M;

	constructor(modelName: M) {
		this.modelName = modelName;
	}

	public encode<T = unknown>(record: T): string {
		const redisRecord = { ...record } as RedisRecord<M>;

		if (ObjectUtils.isValidObject(redisRecord) && "data" in redisRecord && redisRecord.data) {
			const { data } = redisRecord;
			redisRecord.data = this.withIDField(data);
		}

		return JSON.stringify(redisRecord, null, 2);
	}

	public decode<T = unknown>(str: string): T {
		const redisRecord = JSON.parse(str) as RedisRecord<M>;
		const { data } = redisRecord;

		const dateFields = Object.entries(data).filter(([, value]) => ObjectUtils.isDateString(value)) as Entries<
			Record<string, string>
		>;

		for (const [key, value] of dateFields) {
			Object.assign(data, { [key]: new Date(value) });
		}

		let transformedData = data;

		if (this.modelName === "Leveling" && "id" in data) {
			const { id: _, ...withoutId } = data;

			transformedData = withoutId as typeof data;
		}

		redisRecord.data = transformedData;

		return redisRecord as T;
	}

	public withIDField<const TDoc extends Typings.Database.DocumentInput<M>>(data: TDoc): TDoc & { id: string } {
		const isLevelingDoc = !("id" in data) || isEmpty(data.id);
		if (!isLevelingDoc) {
			return data as TDoc & { id: string };
		}

		const dataCopy = { ...data };

		if (this.forceIsModelType(dataCopy, "Leveling", isLevelingDoc)) {
			const compoundIDValue = `${dataCopy.guildId}_${dataCopy.entityId}`;
			Object.assign(dataCopy, { id: compoundIDValue });
		}

		return dataCopy as TDoc & { id: string };
	}

	private forceIsModelType<N extends Prisma.ModelName>(
		v: Typings.Database.DocumentInput<M | N>,
		modelType: N,
		expression: boolean
	): v is Typings.Database.DocumentInput<N> {
		return ObjectUtils.isValidObject(v) && modelType && expression;
	}
}
