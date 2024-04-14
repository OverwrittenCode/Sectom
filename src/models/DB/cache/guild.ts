import { RedisCacheManager } from "@managers/RedisCacheManager.js";
import { singleton } from "tsyringe";

@singleton()
export class GuildRedisCache extends RedisCacheManager<"Guild"> {
	constructor() {
		super("Guild");
	}
}
