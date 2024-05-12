import assert from "assert";

import { ActionType } from "@prisma/client";
import { TextChannel } from "discord.js";
import { inject, singleton } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import type { Typings } from "~/ts/Typings.js";

import type { EntityType, Prisma, PrismaClient } from "@prisma/client";

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
	private retrieveAllGuildLogChannelSelect = {
		id: true,
		logChannelType: true
	} as const satisfies Prisma.EntitySelectScalar;
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

	public async retrieveGivenGuildLogChannel(
		interaction: Typings.CachedGuildInteraction,
		givenGuildLogChannelType: ActionType | null = null
	): Promise<TextChannel | null> {
		const { guildId, channel } = interaction;
		assert(channel);

		const omittedAccessModifier = givenGuildLogChannelType?.substring(0, givenGuildLogChannelType.lastIndexOf("_"));

		const moderativeLogWhereFilter = {
			logChannelGuildId: guildId
		} satisfies Prisma.EntityWhereInput;

		let moderativeLogChannelId: string | undefined | null = null;
		const cacheRecords = await RedisCache.entity.retrieveDocuments(moderativeLogWhereFilter);

		if (cacheRecords.length) {
			moderativeLogChannelId = cacheRecords.find(
				({ logChannelType }) =>
					(givenGuildLogChannelType
						? logChannelType?.startsWith(omittedAccessModifier!)
						: givenGuildLogChannelType === logChannelType) || logChannelType === null
			)?.id;
		} else {
			let logChannelTypeArraySearch: Prisma.EntityWhereInput["logChannelType"] = null;

			if (givenGuildLogChannelType) {
				logChannelTypeArraySearch = {
					in: Object.values(ActionType).filter((caseActionType) =>
						caseActionType.startsWith(omittedAccessModifier!)
					)
				};
			}

			const prismaDoc = await this.client.entity.findFirst({
				where: {
					...moderativeLogWhereFilter,
					OR: [{ logChannelType: logChannelTypeArraySearch }, { logChannelType: null }]
				},
				select: { id: true }
			});

			moderativeLogChannelId = prismaDoc?.id;
		}

		const moderativeLogChannel = moderativeLogChannelId
			? await interaction.guild.channels.fetch(moderativeLogChannelId)
			: null;

		if (moderativeLogChannel && !(moderativeLogChannel instanceof TextChannel)) {
			throw new ValidationError(ValidationError.MessageTemplates.CannotRecall("log channel"));
		}

		return moderativeLogChannel;
	}
}
