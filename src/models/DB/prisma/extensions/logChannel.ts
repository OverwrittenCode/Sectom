import { Guild, Message, NewsChannel, TextChannel } from "discord.js";
import { container, inject, singleton } from "tsyringe";

import { ACTION_TYPES } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import type { FetchExtendedClient } from "~/models/DB/prisma/extensions/types/index.js";
import { Beans } from "~/models/framework/DI/Beans.js";
import { Typings } from "~/ts/Typings.js";

export interface LogChannelRetrieveMatchingOptions
	extends Pick<Typings.Database.Prisma.RetrieveModelDocument<"LogChannel">, "actionType" | "eventType"> {
	input: Typings.CachedGuildInteraction | Message<true> | Guild;
}

@singleton()
export class LogChannelInstanceMethods {
	private readonly client: FetchExtendedClient;

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public async retrieveMatching<T>(this: T, options: LogChannelRetrieveMatchingOptions) {
		const { actionType, eventType, input } = options;

		const clazz = container.resolve(LogChannelInstanceMethods);

		const guild = input instanceof Guild ? input : input.guild;

		const whereNullAction = { actionType: null } satisfies Typings.Database.SimpleWhereOR<"LogChannel">;

		const where: Typings.Database.SimpleWhere<"LogChannel"> = { guildId: guild.id, eventType };

		if (actionType) {
			where.OR = [
				{
					actionType: {
						in: ACTION_TYPES.filter((type) => type.startsWith(actionType))
					}
				},
				whereNullAction
			];
		} else {
			where.actionType = null;
		}

		const record = await clazz.client.logChannel.fetchFirst({
			where,
			select: {
				id: true,
				webhookUrl: true
			}
		});

		if (!record) {
			return null;
		}

		const channel = options.input.client.channels.cache.get(record.doc.id);

		if (!(channel instanceof TextChannel || channel instanceof NewsChannel)) {
			await clazz.client.logChannel.deleteMany({
				where: {
					id: record.doc.id
				}
			});

			const message = `${ValidationError.messageTemplates.CannotRecall("log channel")}, so this log channel has been deleted from the database.`;

			throw new ValidationError(message);
		}

		return { ...record, channel };
	}
}
