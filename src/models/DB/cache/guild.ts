import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [["id"], ["levelingGlobalXPCooldown"]] as const satisfies Typings.Database.Redis.TTerms<"Guild">[];

@singleton()
export class GuildRedisCache extends RedisCacheManager<"Guild", typeof indexList> {
	constructor() {
		super("Guild", indexList);
	}
}
