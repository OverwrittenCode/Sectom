import { prop } from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";
import { Types } from "mongoose";

export class BaseDeclaredID {
	@prop({ required: true })
	/**
	 * Declared override id string
	 */
	public readonly id!: string;

	public readonly _id!: Types.ObjectId;
}

export class Base extends TimeStamps {
	public readonly id!: string;
	public readonly _id!: Types.ObjectId;
}
