import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [
	["guildId"],
	["guildId", "id"],
	["guildId", "action"]
] as const satisfies Typings.Database.Redis.TTerms<"Case">[];

@singleton()
export class CaseRedisCache extends RedisCacheManager<"Case", typeof indexList> {
	constructor() {
		super("Case", indexList);
	}
}
