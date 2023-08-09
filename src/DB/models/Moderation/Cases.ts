import type {
	ReturnModelType,
	SubDocumentType,
	types
} from "@typegoose/typegoose";
import {
	getModelForClass,
	isDocument,
	post,
	pre,
	prop,
	queryMethod
} from "@typegoose/typegoose";
import { Types } from "mongoose";

import { RedisCache } from "../../cache/index.js";
import { Server } from "../Server.js";

import { Blacklist, ListInstanceUnion, Whitelist } from "./List.js";

type SubList = SubDocumentType<ListInstanceUnion>;

interface QueryHelpers {
	findByCaseNumber: types.AsQueryMethod<typeof findByCaseNumber>;
}

function findByCaseNumber(
	this: types.QueryHelperThis<typeof Cases, QueryHelpers>,
	caseNumber: number
) {
	const doc = this.find({
		$or: [
			{ "whitelist.caseNumber": caseNumber },
			{ "blacklist.caseNumber": caseNumber },
			{ actions: { $elemMatch: { caseNumber } } }
		]
	});

	return doc;
}

@queryMethod(findByCaseNumber)
@pre<Cases>("save", function (next) {
	// This pre-save hook will run before a document is saved
	console.log("A cases document is going to be saved.");
	next();
})
@post<Cases>("save", async function (doc) {
	await RedisCache.cases.set(doc);
	console.log("A cases document has been saved.", doc.toJSON());
})
export class Cases {
	@prop({ type: () => Whitelist, default: {} })
	public whitelist!: SubList;

	@prop({ type: () => Blacklist, default: {} })
	public blacklist!: SubList;

	@prop({ ref: () => Server, unique: true })
	public readonly server!: Types.ObjectId;

	public static async findByServerId(
		this: ReturnModelType<typeof Cases>,
		serverId: string
	) {
		const cases = await this.findOne().populate({
			path: "server",
			match: { serverId }
		});

		if (cases && isDocument(cases.server)) {
			return cases;
		}

		return null;
	}
}

export const CasesModel = getModelForClass<typeof Cases, QueryHelpers>(Cases);
