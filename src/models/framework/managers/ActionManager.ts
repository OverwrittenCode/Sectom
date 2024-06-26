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

import { LIGHT_GOLD, MAX_ELEMENTS_PER_PAGE } from "~/constants";
import { PaginationManager } from "~/models/framework/managers/PaginationManager.js";
import type { Typings } from "~/ts/Typings.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import { DBConnectionManager } from "./DBConnectionManager.js";
import { EmbedManager } from "./EmbedManager.js";
import { EntityManager } from "./EntityManager.js";

import type { PaginationItem } from "@discordx/pagination";
import type { Prisma } from "@prisma/client";
import type { APIEmbedField, ChatInputCommandInteraction, GuildMember, InteractionResponse, Message } from "discord.js";

type Doc = Typings.Database.Prisma.RetrieveModelDocument<"Case">;
type PrismaTX = (typeof DBConnectionManager.Prisma)["$transaction"] extends (fn: infer A) => any
	? A extends (client: infer B) => Promise<any>
		? B
		: never
	: never;

interface ActionOptions {
	pastTense?: string;
	notifyIfUser?: boolean;
	checkPossible?: (guildMember: GuildMember) => boolean;
	pendingExecution?: () => Promise<any>;
}

interface ModerationUserTargetOptions {
	id: string;
	type: EntityType;
}

interface BaseLogCaseOptions {
	target: ModerationUserTargetOptions;
	actionType: ActionType;
	reason?: string;
	caseType?: CaseType;
	actionOptions?: ActionOptions;
	successContent?: string;
	buttonActionRows?: ActionRowBuilder<ButtonBuilder>[];
	tx?: PrismaTX;
}

interface CommandLogCaseOptions extends BaseLogCaseOptions {
	interaction: ChatInputCommandInteraction<"cached">;
}

interface DeferrableLogCaseOptions extends BaseLogCaseOptions {
	interaction: Typings.CachedDeferrableGuildInteraction;
	commandInteraction?: ChatInputCommandInteraction<"cached">;
}

type LogCaseOptions = CommandLogCaseOptions | DeferrableLogCaseOptions;

interface TimestampFieldOptions {
	createdAt: Date;
	updatedAt?: Date | null;
	expiryDate?: Date | null;
}

export abstract class ActionManager {
	private static getCasesSelect = {
		id: true,
		action: true,
		createdAt: true,
		apiEmbeds: true,
		messageURL: true
	} as const satisfies Prisma.CaseSelectScalar;

	public static CreateBasedTypes = Object.values(ActionType).filter((caseActionType) =>
		StringUtils.Regexes.CreateBasedActionModifiers.test(caseActionType)
	);

	public static async logCase(options: LogCaseOptions) {
		const { interaction, target, reason, actionType, caseType, actionOptions, successContent, tx } = options;
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
			perpetratorId = interaction.client.user.id;
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

		const id = StringUtils.GenerateID();

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

			const commandMentionArgs = commandString.slice(1).split(" ").concat(commandInteraction.commandId) as [
				commandName: string,
				subcommandGroupName: string,
				subcommandName: string,
				commandId: string
			];

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
								value.replace(StringUtils.Regexes.AllActionModifiers, ""),
								"_"
							);
						} else if (option.name.includes("duration") && StringUtils.Regexes.Number.test(value)) {
							value = prettyMilliseconds(parseInt(value), { verbose: true });
						}

						return { name, value };
					})
				);
			}

			embeds.push(commandInputEmbed);
		} else if (interaction.isModalSubmit() && interaction.isFromMessage() && interaction.message.interaction) {
			const { commandName } = interaction.message.interaction;

			const { id } = interaction.guild.commands.cache.find(({ name }) => name === commandName) ?? { id: "???" };

			commandInputEmbed.setDescription(discordBuilders.chatInputApplicationCommandMention(commandName, id));

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
								? EntityManager.getUserHyperlink(targetId)
								: targetType === "CHANNEL"
									? EntityManager.getChannelHyperlink(channelId, guildId)
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
						value: EntityManager.getUserHyperlink(perpetratorId)
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
		let logMessage: Message<true> | null = null;
		let messageURL: string | null = null;
		if (!moderativeLogChannel && interaction.channel instanceof TextChannel) {
			moderativeLogChannel = interaction.channel;
		}

		if (moderativeLogChannel) {
			logMessage = await moderativeLogChannel.send({ embeds: formattedEmbeds, components: buttonActionRows });
			messageURL = logMessage.url;
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

	public static async getCases(
		interaction: ChatInputCommandInteraction<"cached">,
		simpleFilter?: Typings.Database.SimpleFilter<"Case">
	): Promise<Typings.Prettify<Pick<Doc, keyof typeof this.getCasesSelect>>[]> {
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
			const embedDescription = chunk.join(StringUtils.LineBreak);
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

	public static generateAuditReason(interaction: ChatInputCommandInteraction<"cached">, reason: string): string {
		let auditReason = `[REASON]: ${reason} | [ACTIONED BY]: ${interaction.user.username} (${interaction.user.id})`;

		if (interaction.channel) {
			auditReason += ` | [CHANNEL]: ${interaction.channel.name} (${interaction.channelId})`;
		}

		return auditReason;
	}
}
