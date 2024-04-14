import assert from "assert";

import { Beans } from "@framework/DI/Beans.js";
import { GuildManager } from "@managers/GuildManager.js";
import { RedisCache } from "@models/DB/cache/index.js";
import type { EntityType, Prisma, PrismaClient } from "@prisma/client";
import type { LogChannelGuildType } from "@prisma/client";
import type { ButtonInteraction, CommandInteraction, TextChannel } from "discord.js";
import pkg from "lodash";
import { inject, singleton } from "tsyringe";

const { first } = pkg;
interface CreateOptions extends Pick<Prisma.CaseCreateInput, "guild"> {
	id: string;
	type: EntityType;
}

interface WhereOption {
	id: string;
}

interface ConnectOrCreateOptions {
	create: CreateOptions;
	where: WhereOption;
}

interface ConnectOrCreate {
	connectOrCreate: ConnectOrCreateOptions;
}

@singleton()
export class EntityInstanceMethods {
	private client: PrismaClient;
	constructor(
		@inject(Beans.IExtensionInstanceMethods)
		_client: PrismaClient
	) {
		this.client = _client;
	}

	public connectOrCreateHelper(
		id: string,
		connectGuild: Pick<Prisma.CaseCreateInput, "guild">,
		type: EntityType
	): ConnectOrCreate {
		return {
			connectOrCreate: {
				create: {
					id,
					...connectGuild,
					type
				},
				where: { id }
			}
		};
	}

	public async retrieveGuildLogChannel(
		interaction: CommandInteraction<"cached"> | ButtonInteraction<"cached">,
		logChannelGuildType: LogChannelGuildType
	): Promise<TextChannel> {
		const { guildId, channel } = interaction;
		assert(channel);

		const moderativeLogWhereFilter = {
			guildId,
			logChannelGuildType
		} satisfies Prisma.EntityWhereInput;

		const moderativeLogChannelQuery =
			(await RedisCache.entity.indexes.byGuildIdAndLogChannelGuildType
				.match(moderativeLogWhereFilter)
				.then(first)) ??
			(await this.client.entity.findFirst({
				where: moderativeLogWhereFilter,
				select: { id: true }
			}));

		const moderativeLogChannel = moderativeLogChannelQuery
			? await GuildManager.getGuildEntity(interaction.guild, moderativeLogChannelQuery.id, "channel", true)
			: channel;

		assert(GuildManager.isChannelAuditable(moderativeLogChannel));

		return moderativeLogChannel;
	}
}
