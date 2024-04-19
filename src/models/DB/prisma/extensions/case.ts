import { EntityType } from "@prisma/client";
import { TimestampStyles, time } from "discord.js";
import { container, singleton } from "tsyringe";

import { TAB_CHARACTER } from "~/constants";

import { EntityInstanceMethods } from "./entity.js";

import type { Prisma } from "@prisma/client";

interface RelationFieldOptions {
	guildId: string;
	channelId: string;
	perpetratorId: string;
	targetId: string;
}

type RelationFields = Pick<Prisma.CaseCreateInput, "channel" | "perpetrator" | "target" | "guild">;

@singleton()
export class CaseInstanceMethods {
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

	public unixTimestampHelper(timestamp: Date): string {
		return `${time(timestamp, TimestampStyles.LongDateTime)} (${time(
			timestamp,
			TimestampStyles.RelativeTime
		)}) ${TAB_CHARACTER}`;
	}
}
