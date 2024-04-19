import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [
	["guildId"],
	["guildId", "type"],
	["guildId", "logChannelGuildType"]
] as const satisfies Typings.Database.Redis.TTerms<"Entity">[];

@singleton()
export class EntityRedisCache extends RedisCacheManager<"Entity", typeof indexList> {
	constructor() {
		super("Entity", indexList);
	}
}
