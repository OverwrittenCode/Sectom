import { Category, EnumChoice, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { GivenChannelSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { Prisma, PrismaPromise } from "@prisma/client";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";

const LogChannelChoices = ActionManager.CreateBasedTypes.reduce(
	(acc, actionType) => {
		const formattedKey = StringUtils.concatenate(
			" ",
			...actionType
				.replace(StringUtils.Regexes.CreateBasedActionModifiers, "")
				.toLowerCase()
				.split("_")
				.map((str) => StringUtils.capitaliseFirstLetter(str))
		);

		acc[formattedKey] = actionType;

		return acc;
	},
	{} as Record<string, string>
);
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";

@Discord()
@Category(Enums.CommandCategory.Admin)
@SlashGroup({
	description: "Controls where different logs are sent to",
	name: "logchannel",
	root: "config"
})
@SlashGroup("logchannel", "config")
export abstract class LogChannelConfig {
	@Slash({ description: "Removes a log channel" })
	public async remove(
		@SlashChoice({ name: "Default", value: "DEFAULT" })
		@SlashChoice(...EnumChoice(LogChannelChoices))
		@SlashOption({
			description: "The action type group",
			name: "action_type",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		actionTypeChoice: ActionType | "DEFAULT",
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const actionTypeGroup = actionTypeChoice === "DEFAULT" ? null : actionTypeChoice;

		const retrievedGuildLogChannel = await DBConnectionManager.Prisma.entity.retrieveGivenGuildLogChannel(
			interaction,
			actionTypeGroup
		);

		const currentCorrespondingLogChannelId = retrievedGuildLogChannel?.id;

		if (!currentCorrespondingLogChannelId) {
			throw new ValidationError(ValidationError.MessageTemplates.NotConfigured("given log channel"));
		}

		return await ActionManager.logCase({
			interaction,
			target: {
				id: currentCorrespondingLogChannelId,
				type: EntityType.CHANNEL
			},
			reason,
			actionType: ActionType.CONFIG_LOG_CHANNEL_REMOVE,
			actionOptions: {
				pastTense: "removed the log channel",
				pendingExecution: () =>
					DBConnectionManager.Prisma.entity.update({
						where: {
							id: currentCorrespondingLogChannelId
						},
						data: {
							logChannelType: null,
							logChannelGuild: {
								disconnect: true
							}
						}
					})
			}
		});
	}

	@Slash({ description: "Sets the log channel for an action type group" })
	@Guard(
		RateLimit(TIME_UNIT.seconds, 3),
		ClientRequiredPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
	)
	public async set(
		@GivenChannelSlashOption()
		channel: TextChannel,
		@SlashChoice({ name: "Default", value: "DEFAULT" })
		@SlashChoice(...EnumChoice(LogChannelChoices))
		@SlashOption({
			description: "The action type group",
			name: "action_type",
			type: ApplicationCommandOptionType.String
		})
		actionTypeChoice: ActionType | "DEFAULT" | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;
		const actionTypeGroup = !actionTypeChoice || actionTypeChoice === "DEFAULT" ? null : actionTypeChoice;

		const retrievedGuildLogChannel = await DBConnectionManager.Prisma.entity.retrieveGivenGuildLogChannel(
			interaction,
			actionTypeGroup
		);

		const currentCorrespondingLogChannelId = retrievedGuildLogChannel?.id;

		const prismaTransaction: PrismaPromise<any>[] = [];

		if (currentCorrespondingLogChannelId) {
			if (currentCorrespondingLogChannelId === channel.id) {
				throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
			}

			prismaTransaction.push(
				DBConnectionManager.Prisma.entity.update({
					where: {
						id: currentCorrespondingLogChannelId
					},
					data: {
						logChannelType: null,
						logChannelGuild: {
							disconnect: true
						}
					}
				})
			);
		}

		const connectGuild = {
			connect: {
				id: guildId
			} satisfies Prisma.GuildWhereUniqueInput
		};

		const updateFields = {
			logChannelType: actionTypeGroup,
			logChannelGuild: connectGuild
		} satisfies Prisma.EntityUpdateInput;

		const createFields = {
			id: channel.id,
			type: EntityType.CHANNEL,
			guild: connectGuild,
			...updateFields
		} satisfies Prisma.EntityCreateInput;

		prismaTransaction.push(
			DBConnectionManager.Prisma.entity.upsert({
				where: {
					id: channel.id
				},
				update: updateFields,
				create: createFields,
				select: {
					id: true
				}
			})
		);

		const actionType = ActionType[`CONFIG_LOG_CHANNEL_${currentCorrespondingLogChannelId ? "UPDATE" : "ADD"}`];

		const actionStr = currentCorrespondingLogChannelId ? "updated" : "set";

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channel.id,
				type: EntityType.CHANNEL
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: `${actionStr} the log channel`,
				pendingExecution: () => DBConnectionManager.Prisma.$transaction(prismaTransaction)
			}
		});
	}
}
