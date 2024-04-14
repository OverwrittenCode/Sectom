import { CASE_ID_LENGTH, LINE_BREAK } from "@constants";
import * as discordBuilders from "@discordjs/builders";
import { hyperlink, inlineCode, messageLink, userMention } from "@discordjs/builders";
import type { EntityType } from "@prisma/client";
import { type CaseActionType, CaseType, LogChannelGuildType } from "@prisma/client";
import { CommandUtils } from "@utils/command.js";
import { InteractionUtils } from "@utils/interaction.js";
import { StringUtils } from "@utils/string.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { ApplicationCommandOptionType, Colors, EmbedBuilder } from "discord.js";
import ms from "ms";
import prettyMilliseconds from "pretty-ms";

import { DBConnectionManager } from "./DBConnectionManager.js";
import { EmbedManager } from "./EmbedManager.js";
import { EntityManager } from "./EntityManager.js";

interface ActionConditionOptions {
	msDuration?: number;
	pastTense: string;
	checkPossible?: (guildMember: GuildMember) => boolean;
	pendingExecution: () => Promise<any>;
}

interface ModerationUserTargetOptions {
	id: string;
	type: EntityType;
}

interface ModerateUserOptions {
	interaction: ChatInputCommandInteraction<"cached">;
	target: ModerationUserTargetOptions;
	reason: string;
	actionType: CaseActionType;
	actionOptions?: ActionConditionOptions;
	messageContent?: string;
}

interface MSValidateOptions {
	duration: string;
	min?: string;
	max?: string;
}

export abstract class ActionModerationManager {
	public static async logCase(options: ModerateUserOptions) {
		const { case: _case, entity: _entity } = DBConnectionManager.Prisma;

		const { interaction, target, reason, actionType, actionOptions, messageContent } = options;
		const { guild, guildId, channelId, user: perpetrator, commandName } = interaction;
		const { id: targetId, type: targetType } = target;
		const { id: perpetratorId } = perpetrator;

		const guildMember = guild.members.resolve(targetId);

		if (guildMember && actionOptions?.checkPossible && !actionOptions.checkPossible(guildMember)) {
			return InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: insufficient permissions against the target.",
				ephemeral: true
			});
		}

		if (actionOptions?.pendingExecution) {
			await actionOptions.pendingExecution();
		}

		const verboseDuration = actionOptions?.msDuration
			? prettyMilliseconds(actionOptions.msDuration, { verbose: true })
			: null;

		const expiryDate = actionOptions?.msDuration ? new Date(Date.now() + actionOptions.msDuration) : undefined;

		const relationFields = _case.instanceMethods.retrieveRelationFields({
			guildId,
			channelId,
			targetId,
			perpetratorId
		});

		const id = StringUtils.GenerateID(CASE_ID_LENGTH);

		const targetTypeLowercase = targetType.toLowerCase() as Lowercase<typeof targetType>;
		const targetTypeTitleCase = StringUtils.capitalizeFirstLetter(targetTypeLowercase);
		const targetMentionFn = discordBuilders[`${targetTypeLowercase}Mention`];
		const targetMention = targetMentionFn(targetId);
		const perpetratorMention = userMention(perpetratorId);

		const currentDate = new Date();

		const createdCaseEmbedTimestampFieldValue = [
			{
				name: "Created At",
				value: _case.instanceMethods.unixTimestampHelper(currentDate)
			}
		];

		if (expiryDate) {
			createdCaseEmbedTimestampFieldValue.push({
				name: "Expires At",
				value: _case.instanceMethods.unixTimestampHelper(expiryDate)
			});
		}
		const moderativeLogChannel = await _entity.instanceMethods.retrieveGuildLogChannel(
			interaction,
			actionOptions ? LogChannelGuildType.MODERATIVE : LogChannelGuildType.PASSIVE
		);

		let commandString = `/${commandName}`;

		if (interaction.options.data.length) {
			const optionItem = interaction.options.data[0];
			if (
				optionItem.type === ApplicationCommandOptionType.Subcommand ||
				optionItem.type === ApplicationCommandOptionType.SubcommandGroup
			) {
				commandString += ` ${optionItem.name}`;
			}

			const nestedOptionItem = optionItem.options?.[0];
			if (nestedOptionItem && nestedOptionItem.type === ApplicationCommandOptionType.Subcommand) {
				commandString += ` ${nestedOptionItem.name}`;
			}

			CommandUtils.retrieveCommandInteractionOption(interaction)
				.filter(({ value }) => !!value)
				.forEach((option) => (commandString += ` ${option.name}: ${option.value}`));
		}

		const createdCaseEmbed = new EmbedBuilder()
			.setTitle(`CASE ${id}`)
			.setColor(Colors.Red)
			.setDescription(`Perpetrator ${perpetratorMention} actioned ${inlineCode(actionType)}.`)
			.addFields([
				{
					name: "Command Input",
					value: inlineCode(commandString)
				},
				{
					name: "Timestamps",
					value: EmbedManager.indentFieldValues(createdCaseEmbedTimestampFieldValue)
				},
				{
					name: "Target Information",
					value: EmbedManager.indentFieldValues([
						{
							name: `${targetTypeTitleCase} ID`,
							value:
								targetType === "USER"
									? EntityManager.getUserHyperlink(targetId)
									: targetType === "CHANNEL"
										? EntityManager.getChannelHyperlink(channelId, guildId)
										: targetId
						},
						{
							name: `${targetTypeTitleCase} Mention`,
							value: targetMention
						}
					])
				},
				{
					name: "Actioned By",
					value: EmbedManager.indentFieldValues([
						{
							name: "User ID",
							value: EntityManager.getUserHyperlink(perpetratorId)
						},
						{
							name: "User Mention",
							value: userMention(perpetratorId)
						}
					])
				},
				{
					name: "Reason",
					value: reason
				}
			])
			.setFooter({
				text: `Perpetrator Name: ${perpetrator.displayName}`,
				iconURL: perpetrator.displayAvatarURL()
			})
			.setTimestamp();

		if (verboseDuration) {
			createdCaseEmbed.addFields([
				{
					name: "Duration",
					value: verboseDuration
				}
			]);
		}

		const embeds = EmbedManager.formatEmbeds([createdCaseEmbed]);

		const APIEmbeds = embeds.map((embed) => embed.toJSON());

		await _case.create({
			data: {
				id,
				reason,
				action: actionType,
				type: CaseType.MANUAL,
				embeds: APIEmbeds,
				expiryDate,
				...relationFields
			},
			select: {
				id: true
			}
		});

		const logMessage = await moderativeLogChannel.send({ embeds });

		const messageURL = messageLink(moderativeLogChannel.id, logMessage.id, guildId);
		const messageHyperlink =
			moderativeLogChannel.id === interaction.channelId ? "" : hyperlink("View Log Message", messageURL);

		const content = [
			messageContent ??
				`Successfully ${actionOptions?.pastTense ?? "actioned"} ${targetMention}${verboseDuration ? ` for ${inlineCode(verboseDuration)}` : ""}.`,
			messageHyperlink
		].join(LINE_BREAK);

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content
		});
	}

	public static generateAuditReason(interaction: ChatInputCommandInteraction<"cached">, reason: string): string {
		return `${interaction.user.username} - ${reason}`;
	}

	public static retrieveMsDuration(durationStr: string, defaultUnit: string = "s"): number {
		const numberRegex = /^\d+$/;
		const isOnlyDigits = numberRegex.test(durationStr);
		const msDuration = ms(isOnlyDigits ? durationStr + defaultUnit : durationStr);

		return msDuration;
	}

	public static async validateMsDuration(
		interaction: ChatInputCommandInteraction<"cached">,
		options: MSValidateOptions
	): Promise<number | null> {
		const { duration, min, max } = options;

		const numberRegex = /^\d+$/;
		const isOnlyDigits = numberRegex.test(duration);
		const msDuration = ms(isOnlyDigits ? `${duration}s` : duration);

		const isInvalidDuration = isNaN(msDuration);

		if (isInvalidDuration) {
			await InteractionUtils.replyOrFollowUp(interaction, {
				content: "Argument error: please provide a valid timeout duration"
			});

			return null;
		}

		const minDurationMs = ms(min ?? "0s");
		const maxDurationMs = max ? ms(max) : undefined;

		let isInvalidRange = msDuration < minDurationMs;

		if (maxDurationMs) {
			isInvalidRange ||= msDuration > maxDurationMs;
		}

		if (isInvalidRange) {
			const minVerbose = prettyMilliseconds(minDurationMs);
			const maxVerbose = maxDurationMs ? prettyMilliseconds(maxDurationMs) : undefined;

			const disallowedRange = `less than ${minVerbose}${maxVerbose ? `or more than ${maxVerbose}` : ""}`;

			await InteractionUtils.replyOrFollowUp(interaction, {
				content: `Range error: timeout duration cannot be ${disallowedRange}.`,
				ephemeral: true
			});

			return null;
		}

		return msDuration;
	}
}
