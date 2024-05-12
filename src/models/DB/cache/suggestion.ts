import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";

@singleton()
export class SuggestionRedisCache extends RedisCacheManager<"Suggestion"> {
	constructor() {
		super("Suggestion");
	}
}
