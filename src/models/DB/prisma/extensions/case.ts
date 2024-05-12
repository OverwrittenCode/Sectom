import { EntityType } from "@prisma/client";
import { TimestampStyles, time } from "discord.js";
import { container, inject, singleton } from "tsyringe";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import { Beans } from "~/models/framework/DI/Beans.js";
import type { Typings } from "~/ts/Typings.js";
import { StringUtils } from "~/utils/string.js";

import { EntityInstanceMethods } from "./entity.js";

import type { ActionType, Prisma, PrismaClient } from "@prisma/client";

type Doc = Typings.Database.Prisma.RetrieveModelDocument<"Case">;
type RelationFields = Pick<Prisma.CaseCreateInput, "channel" | "perpetrator" | "target" | "guild">;

interface RelationFieldOptions {
	guildId: string;
	channelId: string;
	perpetratorId: string;
	targetId: string;
}

interface RetrieveCaseOptions {
	interaction: Typings.CachedGuildInteraction;
	allowedActions?: ActionType[];
	caseID?: string;
	targetId?: string;
}

@singleton()
export class CaseInstanceMethods {
	private client: PrismaClient;
	private retrieveCaseSelect = {
		id: true,
		perpetratorId: true,
		createdAt: true,
		apiEmbeds: true,
		messageURL: true,
		action: true,
		targetId: true
	} as const satisfies Prisma.CaseSelectScalar;

	constructor(
		@inject(Beans.IExtensionInstanceMethods)
		_client: PrismaClient
	) {
		this.client = _client;
	}

	public retrieveRelationFields(options: RelationFieldOptions): RelationFields {
		const { guildId, channelId, perpetratorId, targetId } = options;
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
			target: entityInstanceMethods.connectOrCreateHelper(targetId, connectGuild, EntityType.USER),
			...connectGuild
		};
	}

	public async retrieveCase(
		options: RetrieveCaseOptions
	): Promise<Typings.Prettify<Pick<Doc, keyof typeof this.retrieveCaseSelect>>> {
		const { interaction, allowedActions, caseID, targetId } = options;
		const { guildId } = interaction;

		let caseDoc: Pick<Doc, keyof typeof this.retrieveCaseSelect> | null = null;

		if (caseID) {
			const where = {
				guildId,
				id: caseID
			};

			const cachedRecords = await RedisCache.case.indexes.byGuildIdAndId.match(where);

			if (cachedRecords.length) {
				caseDoc = cachedRecords[0].data;
			} else {
				caseDoc = await this.client.case.findFirst({ where, select: this.retrieveCaseSelect });
			}
		} else {
			const cachedRecords = await RedisCache.case.indexes.byGuildId.match({ guildId });

			if (cachedRecords.length) {
				caseDoc = cachedRecords
					.map((record) => record.data)
					.filter((data) => {
						const actionFilter = !allowedActions || allowedActions.includes(data.action);
						const targetFilter = !targetId || data.targetId === targetId;

						return actionFilter && targetFilter;
					})
					.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
			} else {
				caseDoc = await this.client.case.findFirst({
					where: {
						guildId,
						targetId,
						action: allowedActions
							? {
									in: allowedActions
								}
							: undefined
					},
					orderBy: {
						createdAt: "desc"
					},
					select: this.retrieveCaseSelect
				});
			}
		}

		if (!caseDoc) {
			throw new ValidationError("no case records were found against the filter");
		}

		return caseDoc;
	}

	public unixTimestampHelper(timestamp: Date): string {
		return `${time(timestamp, TimestampStyles.LongDateTime)} (${time(
			timestamp,
			TimestampStyles.RelativeTime
		)}) ${StringUtils.TabCharacter}`;
	}
}
