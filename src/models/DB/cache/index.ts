import { container } from "tsyringe";

import { SuggestionRedisCache } from "~/models/DB/cache/suggestion.js";
import { TicketRedisCache } from "~/models/DB/cache/ticket.js";

import { CaseRedisCache } from "./case.js";
import { EntityRedisCache } from "./entity.js";
import { GuildRedisCache } from "./guild.js";
import { LevelingRedisCache } from "./leveling.js";

export abstract class RedisCache {
	public static get case(): CaseRedisCache {
		return container.resolve(CaseRedisCache);
	}
	public static get entity(): EntityRedisCache {
		return container.resolve(EntityRedisCache);
	}
	public static get guild(): GuildRedisCache {
		return container.resolve(GuildRedisCache);
	}
	public static get suggestion(): SuggestionRedisCache {
		return container.resolve(SuggestionRedisCache);
	}
	public static get ticket(): TicketRedisCache {
		return container.resolve(TicketRedisCache);
	}
	public static get leveling(): LevelingRedisCache {
		return container.resolve(LevelingRedisCache);
	}
}
