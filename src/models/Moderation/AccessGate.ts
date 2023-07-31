import type { ArraySubDocumentType } from "@typegoose/typegoose";
import { PropType, prop } from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";

import { Channel, Role, User } from "../ServerModel.js";

export class AccessSelection extends TimeStamps {
	@prop({ type: () => [User], default: [] }, PropType.ARRAY)
	public users!: ArraySubDocumentType<User>[];

	@prop({ type: () => [Role], default: [] }, PropType.ARRAY)
	public roles!: ArraySubDocumentType<Role>[];

	@prop({ type: () => [Channel], default: [] }, PropType.ARRAY)
	public channels!: ArraySubDocumentType<Channel>[];
}
