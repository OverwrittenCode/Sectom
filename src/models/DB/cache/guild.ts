import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";

@singleton()
export class GuildRedisCache extends RedisCacheManager<"Guild"> {
	constructor() {
		super("Guild");
	}
}
