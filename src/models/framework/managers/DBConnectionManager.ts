import assert from "assert";

import { PrismaClient } from "@prisma/client";
import { Redis as RedisClient } from "@upstash/redis";

import { PrismaExtensions } from "~/models/DB/prisma/extensions/index.js";

export abstract class DBConnectionManager {
	public static Redis: RedisClient;
	public static Prisma: ReturnType<typeof DBConnectionManager.createPrismaClient>;
	public static connectionDates: {
		redis?: Date;
		prisma?: Date;
	} = {};

	public static async initRedis(): Promise<"OK"> {
		if (!this.Redis) {
			console.group("[REDIS]");
			console.log("> > Connecting...");

			const redisClient = RedisClient.fromEnv({
				automaticDeserialization: false,
				latencyLogging: true
			});

			this.Redis = redisClient;
			this.connectionDates.redis = new Date();

			console.log("> >> Connected", this.connectionDates.redis);
			console.groupEnd();
		}

		return "OK";
	}

	public static async initPrisma(): Promise<"OK"> {
		if (!this.Prisma) {
			console.group("[PRISMA]");
			const prisma = this.createPrismaClient();

			console.log("> > Connecting...");
			await prisma.$connect();

			this.Prisma = prisma;

			this.connectionDates.prisma = new Date();

			console.log("> >> Connected", this.connectionDates.prisma);

			// import("~/events/prisma/subscribe.js");

			// console.log("> Started Model Subscriptions")
			console.groupEnd();
		}

		return "OK";
	}

	private static createPrismaClient() {
		assert(process.env.PULSE_API_KEY);

		const client = new PrismaClient({ errorFormat: "pretty" });

		const withExtensions = client.$extends(PrismaExtensions.modelMethods).$extends(PrismaExtensions.clientMethods);
		// .$extends(withAccelerate())
		// .$extends(withPulse({ apiKey: process.env.PULSE_API_KEY }));

		return withExtensions;
	}
}
