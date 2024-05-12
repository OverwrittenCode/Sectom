import { inject, singleton } from "tsyringe";

import { RedisCache } from "~/models/DB/cache/index.js";
import { Beans } from "~/models/framework/DI/Beans.js";
import type { Typings } from "~/ts/Typings.js";

import type { PrismaClient } from "@prisma/client";

@singleton()
export class GuildInstanceMethods {
	private client: PrismaClient;
	constructor(
		@inject(Beans.IExtensionInstanceMethods)
		_client: PrismaClient
	) {
		this.client = _client;
	}
	public async retrieveGuild<const T extends Typings.Database.SimpleSelect<"Guild">>(
		guildId: string,
		select?: T
	): Promise<Typings.Prettify<Typings.Database.SimpleSelectOutput<"Guild", T>>> {
		const where = { id: guildId };

		let guildDoc: Typings.Database.SimpleSelectOutput<"Guild", T>;

		const guildCacheRecord = await RedisCache.guild.get(guildId);
		if (!guildCacheRecord) {
			const prismaDoc = await this.client.guild.findUniqueOrThrow({
				where,
				select
			});

			guildDoc = prismaDoc as Typings.Database.SimpleSelectOutput<"Guild", T>;
		} else {
			guildDoc = guildCacheRecord.data as Typings.Database.SimpleSelectOutput<"Guild", T>;
		}

		return guildDoc;
	}
}
