import { Prisma } from "@prisma/client";

import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import type { Typings } from "~/ts/Typings.js";

import type { PulseCreateEvent, PulseDeleteEvent, PulseUpdateEvent } from "@prisma/extension-pulse";

type PrismaDoc<M extends Prisma.ModelName = Prisma.ModelName> = Typings.Database.Prisma.RetrieveModelDocument<M>;

type BasePulseEvent<M extends Prisma.ModelName = Prisma.ModelName> =
	| PulseCreateEvent<PrismaDoc<M>>
	| PulseUpdateEvent<PrismaDoc<M>>
	| PulseDeleteEvent<{ id: string }>;

type PulseEventData<M extends Prisma.ModelName = Prisma.ModelName> = BasePulseEvent<M> & { modelName: M };

abstract class Subscriptions {
	public static async init() {
		const modelNames = Object.values(Prisma.ModelName).map(
			(str) => str.toLowerCase() as Lowercase<Prisma.ModelName>
		);

		const prismaModels = modelNames.map((str) => DBConnectionManager.Prisma[str]);

		const subscriptions = await Promise.all(prismaModels.map((model) => model.subscribe()));

		const subscriptionTask = async (subscription: (typeof subscriptions)[number]) => {
			if (subscription instanceof Error) {
				throw subscription;
			}

			for await (const event of subscription) {
				const eventData = event as PulseEventData<Prisma.ModelName>;

				const cacheModel = RedisCache[eventData.modelName.toLowerCase() as Lowercase<Prisma.ModelName>];

				try {
					switch (eventData.action) {
						case "create":
							{
								const { created } = eventData;

								await cacheModel.set(created as never);
							}

							break;
						case "update":
							{
								const { after } = eventData;

								await cacheModel.update(after as never);
							}

							break;
						case "delete":
							{
								const { deleted } = eventData;

								await cacheModel.delete(deleted.id);
							}

							break;
					}
				} catch {}
			}
		};

		subscriptions.map(subscriptionTask);
	}
}

Subscriptions.init();
