import Redis from "ioredis";

import { CasesCacheManager } from "./Cases/index.js";
import { ServerCacheManager } from "./Server.js";

const { REDIS_PORT, REDIS_HOST, REDIS_PASSWORD } = process.env;

if (
	!REDIS_PORT ||
	!REDIS_HOST ||
	!REDIS_PASSWORD ||
	isNaN(parseInt(REDIS_PORT))
) {
	throw new Error(
		"REDIS is not setup correctly in the enviornment variables."
	);
}

export const redis = new Redis({
	password: REDIS_PASSWORD,
	host: REDIS_HOST,
	port: parseInt(REDIS_PORT)
});

export const RedisCache = {
	server: new ServerCacheManager(),
	cases: new CasesCacheManager()
};
