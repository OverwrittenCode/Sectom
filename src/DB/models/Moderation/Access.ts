import type { ArraySubDocumentType } from "@typegoose/typegoose";
import { PropType, prop } from "@typegoose/typegoose";

import { Base } from "../Base.js";
import { Channel, Role, User } from "../Server.js";

export class AccessSelection extends Base {
	@prop({ type: () => [User], default: [] }, PropType.ARRAY)
	public users!: ArraySubDocumentType<User>[];

	@prop({ type: () => [Role], default: [] }, PropType.ARRAY)
	public roles!: ArraySubDocumentType<Role>[];

	@prop({ type: () => [Channel], default: [] }, PropType.ARRAY)
	public channels!: ArraySubDocumentType<Channel>[];
}
