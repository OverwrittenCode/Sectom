import type {
	ArraySubDocumentType,
	ReturnModelType,
	SubDocumentType
} from "@typegoose/typegoose";
import { PropType, prop } from "@typegoose/typegoose";

import { Action } from "./Action.js";
import { Blacklist } from "./Blacklist.js";
import { Whitelist } from "./Whitelist.js";

export class ModerationCases {
	@prop({ type: () => Whitelist, default: {} })
	public whitelist!: SubDocumentType<Whitelist>;

	@prop({ type: () => Blacklist, default: {} })
	public blacklist!: SubDocumentType<Blacklist>;

	@prop({ type: () => [Action], default: [] }, PropType.ARRAY)
	public actions!: ArraySubDocumentType<Action>[];

	public async addAction(
		this: SubDocumentType<ModerationCases>,
		actionProps: Action
	) {
		this.actions.push(actionProps as ArraySubDocumentType<Action>);
		return await this.ownerDocument().save();
	}

	public async removeAction(
		this: SubDocumentType<ModerationCases>,
		caseNumber: number
	) {
		this.actions = this.actions.filter(
			(action) => action.caseNumber != caseNumber
		);
		return await this.ownerDocument().save();
	}

	public static async findByCaseNumber(
		this: ReturnModelType<typeof ModerationCases>,
		caseNumber: number
	) {
		return this.findOne({
			$or: [
				{ "whitelist.caseNumber": caseNumber },
				{ "blacklist.caseNumber": caseNumber },
				{ actions: { $elemMatch: { caseNumber: caseNumber } } }
			]
		});
	}
}
