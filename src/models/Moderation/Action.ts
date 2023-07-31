import type { SubDocumentType } from "@typegoose/typegoose";
import { pre, prop } from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";

import { ActionType } from "../../utils/type.js";
import { User } from "../ServerModel.js";

import { CounterModel } from "./Counter.js";

@pre<Action>("save", async function (next) {
	try {
		const counter = await CounterModel.findOneAndUpdate(
			{ caseNumber: "" },
			{ $inc: { seq: 1 } },
			{ new: true, upsert: true }
		);
		this.caseNumber = counter.seq;
		next();
	} catch (error: any) {
		return next(error);
	}
})
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
