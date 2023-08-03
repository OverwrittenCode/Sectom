import type {
	ArraySubDocumentType,
	DocumentType,
	Ref,
	ReturnModelType,
	SubDocumentType,
	types
} from "@typegoose/typegoose";
import {
	PropType,
	getModelForClass,
	isDocument,
	prop,
	queryMethod
} from "@typegoose/typegoose";

import { Server } from "../Server.js";
import { Action } from "./Action.js";
import type { ListClassUnion } from "./List.js"
import { Blacklist,  Whitelist } from "./List.js";

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
export class Cases {
	@prop({ type: () => Whitelist, default: {} })
	public whitelist!: SubDocumentType<ListClassUnion>;

	@prop({ type: () => Blacklist, default: {} })
	public blacklist!: SubDocumentType<ListClassUnion>;

	@prop({ type: () => [Action], default: [] }, PropType.ARRAY)
	public actions!: ArraySubDocumentType<Action>[];

	@prop({ ref: () => Server })
	public server!: Ref<Server>;

	public async addAction(this: DocumentType<Cases>, actionProps: Action) {
		this.actions.push(actionProps as ArraySubDocumentType<Action>);
		return await this.save();
	}

	public async removeAction(this: DocumentType<Cases>, caseNumber: number) {
		this.actions = this.actions.filter(
			(action) => action.caseNumber != caseNumber
		);
		return await this.save();
	}

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
