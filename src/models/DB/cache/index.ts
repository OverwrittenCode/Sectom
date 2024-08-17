import { container } from "tsyringe";

import { CaseRedisCache } from "~/models/DB/cache/case.js";
import { EntityRedisCache } from "~/models/DB/cache/entity.js";
import { GuildRedisCache } from "~/models/DB/cache/guild.js";
import { LevelingRedisCache } from "~/models/DB/cache/leveling.js";
import { LogChannelRedisCache } from "~/models/DB/cache/logChannel.js";
import { SuggestionRedisCache } from "~/models/DB/cache/suggestion.js";
import { TicketRedisCache } from "~/models/DB/cache/ticket.js";

export abstract class RedisCache {
	public static get case(): CaseRedisCache {
		return container.resolve(CaseRedisCache);
	}

	public static get entity(): EntityRedisCache {
		return container.resolve(EntityRedisCache);
	}

	public static get logChannel(): LogChannelRedisCache {
		return container.resolve(LogChannelRedisCache);
	}

	public static get guild(): GuildRedisCache {
		return container.resolve(GuildRedisCache);
	}

	public static get leveling(): LevelingRedisCache {
		return container.resolve(LevelingRedisCache);
	}

	public static get suggestion(): SuggestionRedisCache {
		return container.resolve(SuggestionRedisCache);
	}

	public static get ticket(): TicketRedisCache {
		return container.resolve(TicketRedisCache);
	}
}
