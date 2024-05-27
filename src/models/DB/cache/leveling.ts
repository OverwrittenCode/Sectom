import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [["guildId"]] as const satisfies Typings.Database.Redis.TTerms<"Leveling">[];

@singleton()
export class LevelingRedisCache extends RedisCacheManager<"Leveling", typeof indexList> {
	constructor() {
		super("Leveling", indexList);
	}
}
