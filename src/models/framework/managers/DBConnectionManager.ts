import assert from "assert";

import { PrismaClient } from "@prisma/client";
import { withPulse } from "@prisma/extension-pulse";
import { Redis as RedisClient } from "@upstash/redis";

import { PrismaExtensions } from "~/models/DB/prisma/extensions/index.js";

export abstract class DBConnectionManager {
	public static Prisma: ReturnType<typeof DBConnectionManager.createPrismaClient>;
	public static Redis: RedisClient;

	public static async initPrisma(): Promise<"OK"> {
		if (!this.Prisma) {
			const prisma = this.createPrismaClient();
			await prisma.$connect();

			this.Prisma = prisma;
		}

		return "OK";
	}

	public static async initRedis(): Promise<"OK"> {
		if (!this.Redis) {
			const redisClient = RedisClient.fromEnv({
				automaticDeserialization: false,
				latencyLogging: true
			});

			this.Redis = redisClient;
		}

		return "OK";
	}

	private static createPrismaClient() {
		assert(process.env.PULSE_API_KEY);

		const client = new PrismaClient({ errorFormat: "pretty" });

		const withExtensions = client
			.$extends(PrismaExtensions.modelMethods)
			.$extends(PrismaExtensions.clientMethods)
			.$extends(withPulse({ apiKey: process.env.PULSE_API_KEY }));
		// .$extends(withAccelerate())

		return withExtensions;
	}
}
