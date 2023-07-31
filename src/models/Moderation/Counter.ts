import { getModelForClass, prop } from "@typegoose/typegoose";

export class Counter {
	@prop({ default: 0 })
	public seq?: number;

	@prop({ default: "" })
	public caseNumber?: string;
}

export const CounterModel = getModelForClass(Counter);
