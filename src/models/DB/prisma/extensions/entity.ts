import assert from "assert";

import { ActionType } from "@prisma/client";
import { TextChannel } from "discord.js";
import { container, inject, singleton } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import type { FetchExtendedClient } from "~/models/DB/prisma/extensions/types/index.js";
import type { Typings } from "~/ts/Typings.js";

import type { EntityType, Prisma } from "@prisma/client";
import type { Message } from "discord.js";

interface ConnectOrCreate {
	connectOrCreate: ConnectOrCreateOptions;
}

interface ConnectOrCreateOptions {
	create: CreateOptions;
	where: WhereOption;
}

interface CreateOptions extends Pick<Prisma.CaseCreateInput, "guild"> {
	id: string;
	type: EntityType;
}

interface WhereOption {
	id: string;
}

@singleton()
export class EntityInstanceMethods {
	private readonly client: FetchExtendedClient;

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public connectOrCreateHelper<T>(
		this: T,
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

	public async retrieveGivenGuildLogChannel<T>(
		this: T,
		interaction: Typings.CachedGuildInteraction | Message<true>,
		givenGuildLogChannelType: ActionType | null = null
	): Promise<TextChannel | null> {
		const { guildId, guild, channel } = interaction;

		assert(channel);

		const clazz = container.resolve(EntityInstanceMethods);

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
			const logChannelTypeArraySearch = givenGuildLogChannelType
				? {
						in: Object.values(ActionType).filter((caseActionType) =>
							caseActionType.startsWith(omittedAccessModifier!)
						)
					}
				: null;

			const data = await clazz.client.entity.fetchFirst({
				where: {
					...moderativeLogWhereFilter,
					logChannelType: logChannelTypeArraySearch
				},
				select: { id: true }
			});

			moderativeLogChannelId = data?.doc.id;
		}

		const moderativeLogChannel = moderativeLogChannelId ? await guild.channels.fetch(moderativeLogChannelId) : null;

		if (moderativeLogChannel && !(moderativeLogChannel instanceof TextChannel)) {
			throw new ValidationError(ValidationError.messageTemplates.CannotRecall("log channel"));
		}

		return moderativeLogChannel;
	}
}
