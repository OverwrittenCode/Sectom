import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

const indexList = [
	["guildId", "parentId", "authorId"],
	["channelId"]
] as const satisfies Typings.Database.Redis.TTerms<"Ticket">[];

@singleton()
export class TicketRedisCache extends RedisCacheManager<"Ticket", typeof indexList> {
	constructor() {
		super("Ticket", indexList);
	}
}
