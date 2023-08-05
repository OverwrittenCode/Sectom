import type { SubDocumentType } from "@typegoose/typegoose";
import { pre, prop } from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";

import { ActionType } from "../../utils/ts/Action.js";
import { User } from "../Server.js";

@pre<Action>("save", async function () {})
export class Action extends TimeStamps {
	@prop({ type: () => User, required: true })
	public target!: SubDocumentType<User>;

	@prop({ type: () => User, required: true })
	public executor!: SubDocumentType<User>;

	@prop({ enum: () => ActionType, required: true })
	public type!: ActionType;

	@prop()
	public reason?: string;

	@prop()
	public caseNumber?: number;
}
