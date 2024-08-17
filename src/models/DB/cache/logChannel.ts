import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [["guildId", "eventType"]] as const satisfies Typings.Database.Redis.TTerms<"LogChannel">[];

@singleton()
export class LogChannelRedisCache extends RedisCacheManager<"LogChannel", typeof indexList> {
	constructor() {
		super("LogChannel", indexList);
	}
}
