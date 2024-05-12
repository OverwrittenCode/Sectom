import _ from "lodash";

import type { Typings } from "~/ts/Typings.js";
import { ObjectUtils } from "~/utils/object.js";

import type { Prisma } from "@prisma/client";
import type { Entries } from "type-fest";
export class RedisDataService<const M extends Prisma.ModelName> {
	public modelName: M;

	constructor(modelName: M) {
		this.modelName = modelName;
	}

	public encode<T = unknown>(record: T): string {
		const redisRecord = ObjectUtils.cloneObject(record) as Typings.Database.Redis.RetrieveRecord<M>;

		if (ObjectUtils.isValidObject(redisRecord) && "data" in redisRecord && redisRecord.data) {
			const { data } = redisRecord;
			redisRecord.data = this.withIDField(data);
		}

		return JSON.stringify(redisRecord, null, 2);
	}

	public decode<T = unknown>(str: string): T {
		const redisRecord = JSON.parse(str) as Typings.Database.Redis.RetrieveRecord<M>;
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
		const isLevelingDoc = !("id" in data) || _.isEmpty(data.id);
		if (!isLevelingDoc) {
			return data as TDoc & { id: string };
		}

		const dataCopy = ObjectUtils.cloneObject(data);

		if (!("id" in dataCopy)) {
			const compoundIDValue = `${dataCopy.guildId}_${dataCopy.entityId}`;
			Object.assign(dataCopy, { id: compoundIDValue });
		}

		return dataCopy as TDoc & { id: string };
	}
}
