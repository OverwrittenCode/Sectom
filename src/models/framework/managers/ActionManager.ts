import assert from "assert";

import * as discordBuilders from "@discordjs/builders";
import { PaginationType } from "@discordx/pagination";
import { ActionType, CaseType, EntityType } from "@prisma/client";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	ComponentType,
	DiscordAPIError,
	EmbedBuilder,
	RESTJSONErrorCodes,
	TextChannel
} from "discord.js";
import _ from "lodash";
import prettyMilliseconds from "pretty-ms";

import { BOT_ID, LIGHT_GOLD, MAX_ELEMENTS_PER_PAGE } from "~/constants";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { PaginationManager } from "~/models/framework/managers/PaginationManager.js";
import type { Typings } from "~/ts/Typings.js";

import { DBConnectionManager } from "./DBConnectionManager.js";
import { EmbedManager } from "./EmbedManager.js";

import type { PaginationItem } from "@discordx/pagination";
import type { Prisma } from "@prisma/client";
import type {
	APIEmbedField,
	ButtonInteraction,
	ChatInputCommandInteraction,
	GuildMember,
	InteractionResponse,
	Message
} from "discord.js";
import type { Simplify } from "type-fest";

type AuditFields = Record<
	string,
	string | Typings.SetNullableCase<Typings.ExactlyOneOf<{ name: string; username: string }> & { id: string }, false>
>;

type Doc = Typings.Database.Prisma.RetrieveModelDocument<"Case">;

type LogCaseOptions = CommandLogCaseOptions | DeferrableLogCaseOptions;

type PrismaTX = (typeof DBConnectionManager.Prisma)["$transaction"] extends (fn: infer A) => any
	? A extends (client: infer B) => Promise<any>
		? B
		: never
	: never;

type CommandMentionArgs = [commandName: string, subcommandGroupName: string, subcommandName: string, commandId: string];

interface ActionOptions {
	checkPossible?: (guildMember: GuildMember) => boolean;
	notifyIfUser?: boolean;
	pastTense?: string;
	pendingExecution?: () => Promise<any>;
}

interface BaseLogCaseOptions {
	actionOptions?: ActionOptions;
	actionType: ActionType;
	buttonActionRows?: ActionRowBuilder<ButtonBuilder>[];
	caseType?: CaseType;
	reason?: string;
	successContent?: string;
	target: ModerationUserTargetOptions;
	tx?: PrismaTX;
}

interface CommandLogCaseOptions extends BaseLogCaseOptions {
	interaction: ChatInputCommandInteraction<"cached">;
}

interface DeferrableLogCaseOptions extends BaseLogCaseOptions {
	commandInteraction?: ChatInputCommandInteraction<"cached">;
	interaction: Typings.CachedDeferrableGuildInteraction;
}

interface ModerationUserTargetOptions {
	id: string;
	type: EntityType;
}

interface TimestampFieldOptions {
	createdAt: Date;
	expiryDate?: Date | null;
	updatedAt?: Date | null;
}

export abstract class ActionManager {
	private static readonly getCasesSelect = {
		id: true,
		action: true,
		createdAt: true,
		apiEmbeds: true,
		messageURL: true
	} satisfies Prisma.CaseSelectScalar;

	public static readonly createBasedTypes = Object.values(ActionType).filter((caseActionType) =>
		StringUtils.regexes.createBasedActionModifiers.test(caseActionType)
	);

	public static generateAuditReason(
		interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">,
		reason: string,
		fields: AuditFields = {}
	): string {
		const { user: actioned_by, channel } = interaction;

		const defaultAuditFields: AuditFields = {
			reason,
			channel,
			actioned_by
		};

		fields = Object.assign(defaultAuditFields, fields);

		const auditReasonArray: string[] = [];

		for (const [key, value] of ObjectUtils.entries(fields)) {
			if (!value) {
				continue;
			}

			const header = key.split("_").join(" ").toUpperCase();

			const str = typeof value === "string" ? value : `${value.name ?? value.username} (${value.id})`;

			auditReasonArray.push(`[${header}]: ${str}`);
		}

		return auditReasonArray.join(" | ");
	}

	public static generateTimestampField(options: TimestampFieldOptions) {
		const { createdAt, updatedAt, expiryDate } = options;
		const _case = DBConnectionManager.Prisma.case;

		const createdCaseEmbedTimestampFieldValue = [
			{
				name: "Created At",
				value: _case.unixTimestampHelper(createdAt)
			}
		];

		if (updatedAt) {
			createdCaseEmbedTimestampFieldValue.push({
				name: "Last Updated At",
				value: _case.unixTimestampHelper(updatedAt)
			});
		}

		if (expiryDate) {
			createdCaseEmbedTimestampFieldValue.push({
				name: "Expires At",
				value: _case.unixTimestampHelper(expiryDate)
			});
		}

		return {
			name: "Timestamps",
			value: EmbedManager.indentFieldValues(createdCaseEmbedTimestampFieldValue)
		};
	}

	public static async getCases(
		interaction: ChatInputCommandInteraction<"cached">,
		simpleFilter?: Typings.Database.SimpleFilter<"Case">
	): Promise<Simplify<Pick<Doc, keyof typeof this.getCasesSelect>>[]> {
		const { guildId } = interaction;

		return await DBConnectionManager.Prisma.case.fetchMany({
			where: { guildId, ...simpleFilter },
			select: this.getCasesSelect
		});
	}

	public static async listCases(
		interaction: ChatInputCommandInteraction<"cached">,
		simpleFilter?: Typings.Database.SimpleFilter<"Case">
	) {
		const { guild, guildId } = interaction;
		const rawDocuments = await DBConnectionManager.Prisma.case.fetchMany({
			where: { guildId, ...simpleFilter },
			select: this.getCasesSelect
		});

		const validDocuments = rawDocuments.filter((doc) => doc.apiEmbeds.length);

		if (!validDocuments.length) {
			return await InteractionUtils.replyNoData(interaction);
		}

		const paginationPages: Array<Pick<PaginationItem, "embeds" | "components">> = [];
		const embedTitle = `${guild.name} Cases (${validDocuments.length})`;

		const descriptionArray = validDocuments
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.map(
				({ id, action, createdAt }) =>
					`${discordBuilders.inlineCode(id)} ${discordBuilders.bold(`[${action}]`)} ${discordBuilders.time(createdAt, discordBuilders.TimestampStyles.RelativeTime)}`
			);

		const descriptionChunks = _.chunk(descriptionArray, MAX_ELEMENTS_PER_PAGE);

		const addFooter = descriptionChunks.length > 1;

		descriptionChunks.forEach((chunk, index, arr) => {
			const embedDescription = chunk.join(StringUtils.lineBreak);
			const embed = new EmbedBuilder().setTitle(embedTitle).setColor(LIGHT_GOLD).setDescription(embedDescription);

			if (addFooter) {
				embed.setFooter({ text: `Page ${index + 1} / ${arr.length}` });
			}

			const selectMenu = new discordBuilders.StringSelectMenuBuilder()
				.setCustomId(`string_select_menu_pagination_${index}`)
				.setPlaceholder("View a case");

			const caseIDArray = chunk.map((str) => str.match(/`([^`]+)`/)![1]);

			const selectMenuOptions = caseIDArray.map((caseID) =>
				new discordBuilders.StringSelectMenuOptionBuilder().setLabel(caseID).setValue(caseID)
			);

			selectMenu.addOptions(selectMenuOptions);

			const actionRow = new ActionRowBuilder<discordBuilders.StringSelectMenuBuilder>().addComponents(selectMenu);

			paginationPages.push({ embeds: [embed], components: [actionRow] });
		});

		let collectorTarget: Message | InteractionResponse | null = null;

		if (paginationPages.length === 1) {
			collectorTarget = await InteractionUtils.replyOrFollowUp(interaction, paginationPages[0]);
		} else {
			const pagination = new PaginationManager(interaction, paginationPages, {
				type: PaginationType.Button
			});

			const paginationObject = await pagination.init();

			collectorTarget = paginationObject.message;
		}

		if (!collectorTarget) {
			return;
		}

		const collector = collectorTarget.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			filter: (v) => v.user.id === interaction.user.id
		});

		collector.on("collect", async (i) => {
			const caseID = i.values[0];

			const { apiEmbeds, messageURL } = validDocuments.find((doc) => doc.id === caseID)!;

			if (!apiEmbeds.length) {
				return void (await InteractionUtils.replyNoData(i));
			}

			const components: ActionRowBuilder<ButtonBuilder>[] = [];

			if (messageURL) {
				const messageURLButton = new ButtonBuilder()
					.setLabel("View Log Message")
					.setStyle(ButtonStyle.Link)
					.setURL(messageURL);

				const buttonActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(messageURLButton);

				components.push(buttonActionRow);
			}

			await InteractionUtils.replyOrFollowUp(i, {
				embeds: apiEmbeds,
				components,
				ephemeral: true
			});

			return;
		});
	}

	public static async logCase(options: LogCaseOptions) {
		const {
			interaction,
			target,
			reason = InteractionUtils.messages.noReason,
			actionType,
			caseType,
			actionOptions,
			successContent,
			tx
		} = options;

		let { buttonActionRows = [] } = options;

		const commandInteraction =
			"commandInteraction" in options
				? options.commandInteraction
				: interaction.isChatInputCommand()
					? interaction
					: null;

		const { guild, guildId, channelId, user: perpetrator } = interaction;

		const { id: targetId, type: targetType } = target;

		let { id: perpetratorId } = perpetrator;

		const { case: _case, entity: _entity } = tx ?? DBConnectionManager.Prisma;

		assert(interaction.channel && channelId);

		const type = caseType ?? CaseType.MANUAL;

		const isAutoPunishment = type === CaseType.AUTO;

		if (isAutoPunishment) {
			perpetratorId = BOT_ID;
		}

		let guildMember: GuildMember | void = void 0;

		if (targetType === EntityType.USER) {
			guildMember = await guild.members.fetch(targetId).catch(() => {});
		}

		if (guildMember && actionOptions?.checkPossible && !actionOptions.checkPossible(guildMember)) {
			let failTitle = isAutoPunishment ? `[AUTO] ${reason} but ` : "";

			failTitle += "I cannot perform this action";

			const content = `${failTitle}: insufficient permissions against the target.`;

			await InteractionUtils.replyOrFollowUp(interaction, {
				content,
				ephemeral: !isAutoPunishment
			});

			return;
		}

		const [verboseDuration, expiryDate] =
			actionType === ActionType.TIME_OUT_USER_ADD || actionType === ActionType.TIME_OUT_USER_UPDATE
				? [
						prettyMilliseconds(guildMember!.communicationDisabledUntilTimestamp! - Date.now(), {
							verbose: true,
							secondsDecimalDigits: 0,
							millisecondsDecimalDigits: 0
						}),

						new Date(guildMember!.communicationDisabledUntilTimestamp!)
					]
				: [];

		const relationFields = _case.retrieveRelationFields({
			guildId,
			channelId,
			targetId,
			perpetratorId
		});

		const id = StringUtils.generateID();

		const targetTypeLowercase = targetType.toLowerCase() as Lowercase<typeof targetType>;
		const targetTypeSentenceCase = StringUtils.capitaliseFirstLetter(targetTypeLowercase);
		const targetMentionFn = discordBuilders[`${targetTypeLowercase}Mention`];
		const targetMention = targetMentionFn(targetId);
		const perpetratorMention = perpetrator.toString();

		const createdAt = new Date();

		const timestampField = this.generateTimestampField({
			createdAt,
			expiryDate
		});

		const embeds: EmbedBuilder[] = [];

		let title = isAutoPunishment ? "[AUTO] " : "";

		title += `CASE ${id}`;

		const colour = isAutoPunishment ? Colors.Purple : Colors.Red;

		const baseEmbed = new EmbedBuilder()
			.setColor(colour)
			.setFooter({
				text: `Perpetrator Name: ${perpetrator.displayName}`,
				iconURL: perpetrator.displayAvatarURL()
			})
			.setTimestamp()
			.toJSON();

		const commandInputEmbed = new EmbedBuilder(baseEmbed).setTitle(
			`${title} | ${!interaction.isChatInputCommand() ? "Partial " : ""}Command Input`
		);

		if (!isAutoPunishment && commandInteraction && commandInteraction.options.data.length) {
			let commandString = `/${commandInteraction.commandName}`;

			const commandOption = commandInteraction.options.data[0];

			if (
				commandOption.type === ApplicationCommandOptionType.Subcommand ||
				commandOption.type === ApplicationCommandOptionType.SubcommandGroup
			) {
				commandString += ` ${commandOption.name}`;

				const hasSubCommandOption =
					commandOption.options?.[0]?.type === ApplicationCommandOptionType.Subcommand;

				if (hasSubCommandOption) {
					commandString += ` ${commandOption.options![0].name}`;
				}
			}

			const commandMentionArgs = commandString
				.slice(1)
				.split(" ")
				.concat(commandInteraction.commandId) as CommandMentionArgs;

			const nestedCommandOption = commandOption.options?.[0];

			if (nestedCommandOption && nestedCommandOption.type === ApplicationCommandOptionType.Subcommand) {
				commandString += ` ${nestedCommandOption.name}`;
			}

			const givenOptions = CommandUtils.retrieveCommandInteractionOptions(commandInteraction).filter(
				({ value }) => typeof value !== "undefined"
			);

			commandInputEmbed.setDescription(discordBuilders.chatInputApplicationCommandMention(...commandMentionArgs));

			if (givenOptions.length) {
				commandInputEmbed.addFields(
					givenOptions.map((option) => {
						const name = StringUtils.convertToTitleCase(option.name, "_");

						const toStringPrototypeKey =
							ObjectUtils.keys(option).find((key) => !["name", "type", "value"].includes(key)) || "value";

						const toStringPrototypeValue = option[toStringPrototypeKey] ?? option.value!;

						let value = toStringPrototypeValue?.toString();

						if (value in ActionType) {
							value = StringUtils.convertToTitleCase(
								value.replace(StringUtils.regexes.allActionModifiers, ""),
								"_"
							);
						} else if (option.name.includes("duration") && StringUtils.regexes.number.test(value)) {
							value = prettyMilliseconds(parseInt(value), { verbose: true });
						}

						return { name, value };
					})
				);
			}

			embeds.push(commandInputEmbed);
		} else if (interaction.isModalSubmit() && interaction.isFromMessage() && interaction.message.interaction) {
			const { commandName } = interaction.message.interaction;

			const commandElements = commandName.split(" ").slice(0, 3);

			const { id } = interaction.guild.commands.cache.find(({ name }) => name === commandElements[0]) ?? {
				id: "???"
			};

			const commandMentionArgs = commandElements.concat(id) as CommandMentionArgs;

			commandInputEmbed.setDescription(discordBuilders.chatInputApplicationCommandMention(...commandMentionArgs));

			embeds.push(commandInputEmbed);
		}

		const fields: APIEmbedField[] = [
			timestampField,
			{
				name: "Target Information",
				value: EmbedManager.indentFieldValues([
					{
						name: `${targetTypeSentenceCase} ID`,
						value:
							targetType === "USER"
								? this.getUserHyperlink(targetId)
								: targetType === "CHANNEL"
									? discordBuilders.hyperlink(
											channelId,
											discordBuilders.channelLink(channelId, guildId)
										)
									: targetId
					},
					{
						name: `${targetTypeSentenceCase} Mention`,
						value: targetMention
					}
				])
			},
			{
				name: "Actioned By",
				value: EmbedManager.indentFieldValues([
					{
						name: "User ID",
						value: this.getUserHyperlink(perpetratorId)
					},
					{
						name: "User Mention",
						value: perpetratorMention
					}
				])
			}
		];

		if (verboseDuration) {
			fields.push({
				name: "Duration",
				value: verboseDuration
			});
		}

		const createdCaseEmbed = new EmbedBuilder(baseEmbed)
			.setTitle(title)
			.setDescription(`Perpetrator ${perpetratorMention} actioned ${discordBuilders.inlineCode(actionType)}.`)
			.addFields(fields);

		embeds.push(createdCaseEmbed);

		embeds.reverse();

		if (interaction.isModalSubmit()) {
			const fields = InteractionUtils.modalSubmitToEmbedFIelds(interaction);

			if (fields.length) {
				const modalInputEmbed = new EmbedBuilder(baseEmbed)
					.setTitle(`${title} | Modal Submit`)
					.addFields(fields);

				embeds.push(modalInputEmbed);
			}
		}

		const formattedEmbeds = EmbedManager.formatEmbeds(embeds);

		const apiEmbeds = formattedEmbeds.map((embed) => embed.toJSON());

		let moderativeLogChannel = await _entity.retrieveGivenGuildLogChannel(interaction, actionType);
		let moderationLogFailStatusMessage: string | null = null;
		let logMessage: Message<true> | null = null;
		let messageURL: string | null = null;

		if (!moderativeLogChannel && interaction.channel instanceof TextChannel) {
			moderativeLogChannel = interaction.channel;
		}

		if (moderativeLogChannel) {
			try {
				logMessage = await moderativeLogChannel.send({ embeds: formattedEmbeds, components: buttonActionRows });
				messageURL = logMessage.url;
			} catch (err) {
				if (!InteractionUtils.isPermissionError(err)) {
					throw err;
				}

				moderationLogFailStatusMessage = `I was unable to send the log message to ${moderativeLogChannel.toString()}`;
			}
		}

		await _case.create({
			data: {
				id,
				reason,
				action: actionType,
				type,
				apiEmbeds,
				messageURL,
				expiryDate,
				...relationFields
			},
			select: {
				id: true
			}
		});

		let dmFailStatusMessage: string | null = null;

		if (guildMember && actionOptions && actionOptions.notifyIfUser !== false) {
			let noticeName = isAutoPunishment ? "[AUTO] " : "";

			noticeName += "Notice";

			const fields: APIEmbedField[] = [
				{
					name: noticeName,
					value: `Perpertrator ${perpetratorMention} actioned ${discordBuilders.inlineCode(actionType)} against you.`
				}
			];

			if (reason) {
				fields.push({
					name: "Reason",
					value: reason
				});
			}

			if (verboseDuration) {
				fields.push({
					name: "Duration",
					value: verboseDuration
				});
			}

			const warnedNoticeEmbed = new EmbedBuilder()
				.setAuthor({
					name: `${interaction.guild.name} | CASE ${id}`,
					iconURL: interaction.guild.iconURL() ?? void 0
				})
				.setColor(colour)
				.addFields(fields)
				.setFooter({
					text: `Perpetrator ID: ${perpetrator.id}`,
					iconURL: perpetrator.displayAvatarURL()
				})
				.setTimestamp();

			try {
				await guildMember.user.send({ embeds: [warnedNoticeEmbed], components: buttonActionRows });
			} catch (err) {
				const isUnableToDMUser =
					err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser;

				if (!isUnableToDMUser) {
					throw err;
				}

				dmFailStatusMessage = "User was unable to be notified.";
			}
		}

		let returnMessage: Message<boolean> | InteractionResponse<boolean> | null = null;

		if (successContent || actionOptions?.pastTense) {
			let successElement = successContent?.toLowerCase().startsWith("no") ? "" : "Successfully ";

			successElement +=
				successContent ??
				`${actionOptions?.pastTense ?? `actioned ${discordBuilders.inlineCode(actionType)}`} on target ${targetMention}${verboseDuration ? ` for ${discordBuilders.inlineCode(verboseDuration)}` : ""}`;

			const successColour = isAutoPunishment ? Colors.Purple : Colors.Green;

			let successTitle = isAutoPunishment ? "[AUTO] " : "";

			successTitle += "Success";

			const successEmbed = new EmbedBuilder().setColor(successColour).addFields({
				name: successTitle,
				value: successElement
			});

			if (dmFailStatusMessage) {
				successEmbed.addFields({
					name: "DM Status",
					value: dmFailStatusMessage
				});
			}

			if (moderationLogFailStatusMessage) {
				successEmbed.addFields({
					name: "Log Status",
					value: moderationLogFailStatusMessage
				});
			}

			if (messageURL && moderativeLogChannel && moderativeLogChannel.id !== interaction.channelId) {
				const messageURLButton = new ButtonBuilder()
					.setLabel("View Log Message")
					.setStyle(ButtonStyle.Link)
					.setURL(messageURL);

				const buttonActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(messageURLButton);

				buttonActionRows.push(buttonActionRow);
			}

			if (buttonActionRows.length > 1) {
				const mergedButtonComponents = new ActionRowBuilder<ButtonBuilder>().addComponents(
					buttonActionRows.flatMap((c) => c.components)
				);

				buttonActionRows = [mergedButtonComponents];
			}

			returnMessage = await InteractionUtils.replyOrFollowUp(interaction, {
				embeds: [successEmbed],
				components: buttonActionRows
			});
		}

		if (actionOptions?.pendingExecution) {
			await actionOptions.pendingExecution();
		}

		return returnMessage;
	}

	private static getUserHyperlink(userId: string): string {
		return discordBuilders.hyperlink(userId, `https://discordapp.com/users/${userId}`);
	}
}
