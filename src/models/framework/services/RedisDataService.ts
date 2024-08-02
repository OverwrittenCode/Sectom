import assert from "node:assert";

import { Prisma } from "@prisma/client";
import _ from "lodash";

import { ObjectUtils } from "~/helpers/utils/object.js";
import type { Typings } from "~/ts/Typings.js";

type IDFields<M extends Prisma.ModelName> =
	Typings.Database.SimpleUniqueWhereId<M> extends infer T ? (T extends string ? ["id"] : Array<keyof T>) : never;

export class RedisDataService<const M extends Prisma.ModelName> {
	protected readonly modelName: M;

	public readonly idFields: IDFields<M>;

	constructor(modelName: M) {
		this.modelName = modelName;
		this.idFields = ObjectUtils.cloneObject(
			Prisma.dmmf.datamodel.models.find(({ name }) => name === modelName)!.primaryKey?.fields ?? ["id"]
		) as IDFields<M>;

		const scalarFieldEnum = Prisma[`${this.modelName}ScalarFieldEnum`];

		assert(this.idFields.every((idField) => idField in scalarFieldEnum));
	}

	public decode<T = unknown>(str: string): T {
		const redisRecord = JSON.parse(str) as Typings.Database.Redis.RetrieveRecord<M>;
		const { data } = redisRecord;

		const dateFields = ObjectUtils.entries<Record<string, string>>(data).filter(([, value]) =>
			ObjectUtils.isDateString(value)
		);

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

	public encode<T = unknown>(record: T): string {
		const redisRecord = ObjectUtils.cloneObject(record) as Typings.Database.Redis.RetrieveRecord<M>;

		if (ObjectUtils.isValidObject(redisRecord) && "data" in redisRecord && redisRecord.data) {
			const { data } = redisRecord;

			redisRecord.data = this.withIDField(data);
		}

		return JSON.stringify(redisRecord, null, 2);
	}

	public pickIDFields(
		data: Typings.Database.DocumentInput<M> | (typeof Prisma)[`${M}ScalarFieldEnum`] = Prisma[
			`${this.modelName}ScalarFieldEnum`
		]
	) {
		return ObjectUtils.pickKeys(data, this.idFields);
	}

	public withIDField<const TDoc extends Typings.Database.DocumentInput<M>>(data: TDoc): TDoc & { id: string } {
		const isCompoundIdDoc = !("id" in data) || _.isEmpty(data.id);

		if (!isCompoundIdDoc) {
			return data as TDoc & { id: string };
		}

		const dataCopy = ObjectUtils.cloneObject(data);

		const idFields = this.pickIDFields(data);

		const compoundIDValue = Object.values(idFields).join("_");

		Object.assign(dataCopy, { id: compoundIDValue });

		return dataCopy as TDoc & { id: string };
	}
}
