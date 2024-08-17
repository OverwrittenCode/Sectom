import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType, EventType } from "@prisma/client";
import { PermissionFlagsBits } from "discord.js";
import { Discord, Guard, MethodDecoratorEx, Slash as SlashDecorator, SlashGroup } from "discordx";

import { ActionSlashChoiceOption } from "~/helpers/decorators/slash/autocomplete.js";
import { ReasonSlashOption } from "~/helpers/decorators/slash/reason.js";
import { GivenChannelSlashOption } from "~/helpers/decorators/slash/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";

interface BaseHandlerOptions {
	actionTypeChoice?: ActionType;
	eventType: EventType;
	interaction: ChatInputCommandInteraction<"cached">;
	reason: string;
}

interface RemoveHandlerOptions extends BaseHandlerOptions {
	modifyType: Enums.ModifierType.Remove;
}

interface SetHandlerOptions extends BaseHandlerOptions {
	channel: TextChannel;
	modifyType: Enums.ModifierType.Add;
}

type HandlerOptions = RemoveHandlerOptions | SetHandlerOptions;

@Discord()
@Category(Enums.CommandCategory.Admin)
@SlashGroup({
	description: "Controls where different logs are sent to",
	name: "logchannel",
	root: "config"
})
@SlashGroup("logchannel", "config")
export abstract class LogChannelConfig {
	private static Slash(modifierType: HandlerOptions["modifyType"], eventType: EventType): MethodDecoratorEx {
		const modiferTypeStr = modifierType === Enums.ModifierType.Add ? "set" : "remove";

		const eventTypeLowercase = eventType.toLowerCase() as Lowercase<EventType>;

		return SlashDecorator({
			description: `${StringUtils.capitaliseFirstLetter(modiferTypeStr)}s a ${eventTypeLowercase} log channel`,
			name: `${modiferTypeStr}-${eventTypeLowercase}-log`
		});
	}

	@LogChannelConfig.Slash(Enums.ModifierType.Remove, EventType.BOT)
	public async removeBotLog(
		@ActionSlashChoiceOption({ eventType: EventType.BOT, required: true })
		actionTypeChoice: ActionType,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler({
			interaction,
			reason,
			actionTypeChoice,
			eventType: EventType.BOT,
			modifyType: Enums.ModifierType.Remove
		});
	}

	@LogChannelConfig.Slash(Enums.ModifierType.Remove, EventType.DISCORD)
	public async removeDiscordLog(
		@ActionSlashChoiceOption({ eventType: EventType.DISCORD, required: true })
		actionTypeChoice: ActionType,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler({
			interaction,
			reason,
			actionTypeChoice,
			eventType: EventType.DISCORD,
			modifyType: Enums.ModifierType.Remove
		});
	}

	@LogChannelConfig.Slash(Enums.ModifierType.Add, EventType.BOT)
	@Guard(
		RateLimit(TIME_UNIT.seconds, 3),
		ClientRequiredPermissions([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
	)
	public async setBotLog(
		@GivenChannelSlashOption({ required: true })
		channel: TextChannel,
		@ActionSlashChoiceOption({ eventType: EventType.BOT })
		actionTypeChoice: ActionType | undefined,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler({
			interaction,
			reason,
			actionTypeChoice,
			eventType: EventType.BOT,
			modifyType: Enums.ModifierType.Add,
			channel
		});
	}

	@LogChannelConfig.Slash(Enums.ModifierType.Add, EventType.DISCORD)
	@Guard(
		RateLimit(TIME_UNIT.seconds, 3),
		ClientRequiredPermissions([
			PermissionFlagsBits.ViewChannel,
			PermissionFlagsBits.SendMessages,
			PermissionFlagsBits.ManageWebhooks,
			PermissionFlagsBits.ViewAuditLog
		])
	)
	public async setDiscordLog(
		@GivenChannelSlashOption({ required: true })
		channel: TextChannel,
		@ActionSlashChoiceOption({ eventType: EventType.DISCORD })
		actionTypeChoice: ActionType | undefined,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler({
			interaction,
			reason,
			actionTypeChoice,
			eventType: EventType.DISCORD,
			modifyType: Enums.ModifierType.Add,
			channel
		});
	}

	private async handler(options: HandlerOptions) {
		const { interaction, reason, actionTypeChoice = null, eventType, modifyType } = options;

		await InteractionUtils.deferInteraction(interaction, true);

		const logChannelData = await DBConnectionManager.Prisma.logChannel.retrieveMatching({
			input: interaction,
			actionType: actionTypeChoice,
			eventType
		});

		const currentCorrespondingLogChannelId = logChannelData?.channel?.id;

		const sucessContent = (pastTenseAction: string, newChannel?: TextChannel): string => {
			const contentArr = [`${pastTenseAction} the`];

			if (actionTypeChoice) {
				let actionType: string = actionTypeChoice;

				if (eventType === EventType.BOT) {
					actionType = actionType.replace(StringUtils.regexes.allActionModifiers, "");
				}

				contentArr.push(StringUtils.convertToTitleCase(actionType, "_"));
			} else {
				contentArr.push(`default ${eventType.toLowerCase()}`);
			}

			contentArr.push("log channel");

			if (newChannel) {
				contentArr.push(`to ${newChannel}`);
			}

			return contentArr.join(" ");
		};

		switch (modifyType) {
			case Enums.ModifierType.Add:
				{
					const updateFields: Omit<Prisma.LogChannelCreateInput, "id" | "guild"> = {
						actionType: actionTypeChoice,
						eventType
					};

					const { channel } = options;
					const { guildId } = interaction;

					if (currentCorrespondingLogChannelId === channel.id) {
						throw new ValidationError(ValidationError.messageTemplates.AlreadyMatched);
					}

					const connectGuild = {
						connect: {
							id: guildId
						} satisfies Prisma.GuildWhereUniqueInput
					};

					if (eventType === EventType.DISCORD) {
						const webhooks = await channel.fetchWebhooks();

						let webhookUrl = webhooks.find(
							(webhook) => webhook.isUserCreated() && webhook.owner.id === interaction.client.user.id
						)?.url;

						if (!webhookUrl) {
							const webhook = await ActionManager.generateLogWebhook(interaction, channel);

							webhookUrl = webhook.url;
						}

						updateFields.webhookUrl = webhookUrl;
					}

					const actionType =
						ActionType[`CONFIG_LOG_CHANNEL_${currentCorrespondingLogChannelId ? "UPDATE" : "ADD"}`];

					const actionStr = currentCorrespondingLogChannelId ? "updated" : "set";

					await ActionManager.logCase({
						interaction,
						target: {
							id: channel.id,
							type: EntityType.CHANNEL
						},
						reason,
						actionType,
						actionOptions: {
							pendingExecution: () =>
								DBConnectionManager.Prisma.logChannel.upsert({
									where: {
										id: channel.id
									},
									update: updateFields,
									create: {
										id: channel.id,
										guild: connectGuild,
										...updateFields
									},
									select: {
										id: true
									}
								})
						},
						successContent: sucessContent(actionStr, channel)
					});
				}

				break;

			case Enums.ModifierType.Remove:
				{
					if (!currentCorrespondingLogChannelId) {
						throw new ValidationError(
							ValidationError.messageTemplates.NotConfigured(
								`given ${eventType.toLowerCase()} log channel`
							)
						);
					}

					await ActionManager.logCase({
						interaction,
						target: {
							id: currentCorrespondingLogChannelId,
							type: EntityType.CHANNEL
						},
						reason,
						actionType: ActionType.CONFIG_LOG_CHANNEL_REMOVE,
						actionOptions: {
							pendingExecution: () =>
								DBConnectionManager.Prisma.logChannel.delete({
									where: {
										id: currentCorrespondingLogChannelId,
										eventType,
										actionType: actionTypeChoice
									}
								})
						},
						successContent: sucessContent("removed")
					});
				}

				break;
		}
	}
}
