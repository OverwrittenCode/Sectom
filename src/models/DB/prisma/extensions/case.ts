import { EntityType } from "@prisma/client";
import { TimestampStyles, time } from "discord.js";
import { container, inject, singleton } from "tsyringe";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { StringUtils } from "~/helpers/utils/string.js";
import type { FetchExtendedClient } from "~/models/DB/prisma/extensions/types/index.js";
import { Beans } from "~/models/framework/DI/Beans.js";
import type { Typings } from "~/ts/Typings.js";

import { EntityInstanceMethods } from "./entity.js";

import type { Prisma } from "@prisma/client";
import type { Simplify } from "type-fest";

type Doc = Typings.Database.Prisma.RetrieveModelDocument<"Case">;

type RelationFields = Pick<Prisma.CaseCreateInput, "channel" | "perpetrator" | "target" | "guild">;

interface RelationFieldOptions {
	channelId: string;
	guildId: string;
	perpetratorId: string;
	targetId: string;
	targetType: EntityType;
}

export interface RetrieveCaseOptions {
	caseID?: string;
	interaction: Typings.CachedGuildInteraction;
}

@singleton()
export class CaseInstanceMethods {
	private readonly client: FetchExtendedClient;
	private readonly retrieveCaseSelect = {
		id: true,
		perpetratorId: true,
		createdAt: true,
		apiEmbeds: true,
		messageURL: true,
		action: true,
		targetId: true
	} as const satisfies Prisma.CaseSelectScalar;

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public async retrieveCase<T>(
		this: T,
		options: RetrieveCaseOptions
	): Promise<Simplify<Pick<Doc, keyof CaseInstanceMethods["retrieveCaseSelect"]>>> {
		const { interaction, caseID } = options;
		const { guildId } = interaction;

		const clazz = container.resolve(CaseInstanceMethods);

		const caseDoc = await clazz.client.case
			.fetchFirst({
				where: {
					guildId,
					id: caseID
				},
				select: clazz.retrieveCaseSelect
			})
			.then((v) => v?.doc);

		if (!caseDoc) {
			throw new ValidationError(InteractionUtils.messages.noData);
		}

		return caseDoc;
	}

	public retrieveRelationFields<T>(this: T, options: RelationFieldOptions): RelationFields {
		const { guildId, channelId, perpetratorId, targetId, targetType } = options;
		const entityInstanceMethods = container.resolve(EntityInstanceMethods);

		const connectGuild: Pick<Prisma.CaseCreateInput, "guild"> = {
			guild: {
				connect: {
					id: guildId
				}
			}
		};

		return {
			channel: entityInstanceMethods.connectOrCreateHelper(channelId, connectGuild, EntityType.CHANNEL),
			perpetrator: entityInstanceMethods.connectOrCreateHelper(perpetratorId, connectGuild, EntityType.USER),
			target: entityInstanceMethods.connectOrCreateHelper(targetId, connectGuild, targetType),
			...connectGuild
		};
	}

	public unixTimestampHelper<T>(this: T, timestamp: Date): string {
		return `${time(timestamp, TimestampStyles.LongDateTime)} (${time(
			timestamp,
			TimestampStyles.RelativeTime
		)}) ${StringUtils.tabCharacter}`;
	}
}
