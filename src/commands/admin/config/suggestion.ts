import assert from "assert";

import { ModalBuilder, channelMention } from "@discordjs/builders";
import { Category } from "@discordx/utilities";
import { ActionType, EntityType, SuggestionStatus } from "@prisma/client";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Colors,
	EmbedBuilder,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	TextChannel,
	TextInputBuilder,
	TextInputStyle
} from "discord.js";
import { ButtonComponent, Discord, SelectMenuComponent, Slash, SlashGroup } from "discordx";

import { Config } from "~/commands/admin/config/root.js";
import { LIGHT_GOLD } from "~/constants.js";
import { ReasonSlashOption } from "~/helpers/decorators/slash/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slash/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { ContentClusterManager } from "~/models/framework/managers/ContentClusterManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { Prisma } from "@prisma/client";
import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	GuildTextBasedChannel,
	StringSelectMenuInteraction
} from "discord.js";

enum StatusType {
	Upvote = "Upvote",
	Downvote = "Downvote",
	Approve = "Approve",
	Reject = "Reject"
}

@Discord()
@Category(Enums.CommandCategory.Admin)
@SlashGroup({
	description: "Suggestion Configuration",
	name: "suggestion",
	root: "config"
})
@SlashGroup("suggestion", "config")
export abstract class SuggestionConfig {
	private static readonly componentType = Enums.ContentClusterComponentType.Suggestion;

	public static readonly customIdRecords = ContentClusterManager.constructCustomIdRecords(
		SuggestionConfig.componentType,
		"status"
	);

	@Slash({ description: "Enables/disables this configuration " })
	public toggle(
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Config.togglestate("suggestion", reason, interaction);
	}

	@Slash({ description: "Add a suggestion subject or panel" })
	public async add(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType: SuggestionConfig.componentType,
			modifierType: Enums.ModifierType.Add
		});
	}

	@Slash({ description: "Update a suggestion subject or panel" })
	public async update(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType: SuggestionConfig.componentType,
			modifierType: Enums.ModifierType.Update
		});
	}

	@Slash({ description: "Remove a suggestion subject or panel" })
	public async remove(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType: SuggestionConfig.componentType,
			modifierType: Enums.ModifierType.Remove
		});
	}

	@Slash({ description: "Configure channels where suggestions are sent" })
	public async channel(
		@TargetSlashOption({ entityType: CommandUtils.entityType.CHANNEL })
		target: GuildTextBasedChannel,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		assert(interaction.channel);

		const {
			configuration: { suggestion }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: "suggestion"
		});

		const { panels } = suggestion;

		if (!panels.length) {
			throw new ValidationError(ValidationError.messageTemplates.NotConfigured("Suggestion Panel"));
		}

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: SuggestionConfig.customIdRecords.suggestion_channel.id,
				messageComponentType: Enums.MessageComponentType.SelectMenu,
				messageComponentFlags: [InteractionUtils.messageComponentIds.oneTimeUse]
			},
			target.id
		);

		const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(customIdGenerator())
				.setPlaceholder("Select some Panels")
				.setMaxValues(panels.length)
				.setOptions(panels.map(({ name }) => ({ label: name, value: name })))
		);

		await InteractionUtils.replyOrFollowUp(interaction, { components: [actionRow] });
	}

	@Slash({ description: "Send a suggestion panel to a channel" })
	public async send(
		@TargetSlashOption({ entityType: CommandUtils.entityType.CHANNEL })
		channel: GuildTextBasedChannel,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ContentClusterManager.send({
			interaction,
			channel,
			componentType: SuggestionConfig.componentType
		});
	}
}

@Discord()
export abstract class SuggestionConfigMessageComponentHandler {
	private readonly progressBar = {
		leftEmpty: "<:leftEmpty:1236061837775339611>",
		middleEmpty: "<:middleEmpty:1236061836483493991>",
		rightEmpty: "<:rightEmpty:1236061834520301599>",
		leftFull: "<:leftFull:1236061832742043762>",
		middleFull: "<:middleFull:1236061831290687529>",
		rightFull: "<:rightFull:1236061830036848760>"
	} as const;

	@SelectMenuComponent({ id: SuggestionConfig.customIdRecords.suggestion_channel.regex })
	public async selectMenuChannel(interaction: StringSelectMenuInteraction<"cached">) {
		const { customId, values: panelNames, guildId } = interaction;

		const channelId = customId.split(StringUtils.customIDFIeldBodySeperator).pop()!;

		const {
			configuration: { suggestion },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "suggestion"
		});

		const { panels } = suggestion;

		panelNames.forEach((name) => {
			const panelIndex = panels.findIndex((panel) => panel.name === name);

			if (panelIndex === -1) {
				throw new ValidationError(ValidationError.messageTemplates.CannotRecall(`${name} Panel`));
			}

			const isEqualToCurrent = panels[panelIndex].channelId === channelId;

			if (isEqualToCurrent) {
				throw new ValidationError(ValidationError.messageTemplates.AlreadyMatched);
			}

			suggestion.panels[panelIndex].channelId = channelId;
		});

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			actionType: ActionType.CONFIG_SUGGESTION_PANEL_UPDATE,
			actionOptions: {
				pendingExecution: save
			},
			successContent: `updated all panels' channels to ${channelMention(channelId)}`
		});
	}

	@ButtonComponent({ id: SuggestionConfig.customIdRecords.suggestion_create.regex })
	public async buttonCreate(interaction: ButtonInteraction<"cached">) {
		const {
			configuration: { suggestion }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: "suggestion"
		});

		const subjectName = interaction.customId.split(StringUtils.customIDFIeldBodySeperator).pop()!;
		const isInvalidSubject = !suggestion.subjects.find(({ name }) => name === subjectName);

		if (isInvalidSubject) {
			throw new ValidationError(ValidationError.messageTemplates.CannotRecall(`${subjectName} Subject`));
		}

		const panelName = interaction.message.embeds[0].title!;
		const panel = suggestion.panels.find(({ name }) => name === panelName)!;

		if (!panel) {
			throw new ValidationError(ValidationError.messageTemplates.CannotRecall(`${panelName} Panel`));
		}

		if (!panel.channelId) {
			throw new ValidationError(ValidationError.messageTemplates.NotConfigured(`${panelName} Panel Channel`));
		}

		const channel = await interaction.guild.channels.fetch(panel.channelId ?? "");

		if (!channel) {
			throw new ValidationError(ValidationError.messageTemplates.CannotRecall(`${panelName} Panel Channel`));
		}

		if (!(channel instanceof TextChannel)) {
			throw new ValidationError(
				ValidationError.messageTemplates.InvalidChannelType("Panel", ChannelType.GuildText)
			);
		}

		const modalCustomIdGenerator = InteractionUtils.constructCustomIdGenerator({
			baseID: SuggestionConfig.customIdRecords.suggestion_create.id,
			messageComponentType: Enums.MessageComponentType.Modal
		});

		const modalCustomId = modalCustomIdGenerator(StringUtils.generateID());
		const contentId = "content";

		const modal = new ModalBuilder()
			.setCustomId(modalCustomId)
			.setTitle(`Suggestion: ${subjectName}`)
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>()
					.addComponents(
						new TextInputBuilder()
							.setCustomId(contentId)
							.setLabel("What is the suggestion?")
							.setPlaceholder("Enter some content")
							.setMinLength(15)
							.setMaxLength(1_000)
							.setStyle(TextInputStyle.Paragraph)
							.setRequired(true)
					)
					.toJSON()
			);

		await interaction.showModal(modal);

		const modalSubmitInteraction = await interaction
			.awaitModalSubmit({
				time: CommandUtils.collectionTime,
				filter: (i) => i.customId === modalCustomId
			})
			.catch(() => void interaction.deleteReply().catch(() => {}));

		if (modalSubmitInteraction) {
			const { fields } = modalSubmitInteraction;

			assert(fields);

			const content = fields.getTextInputValue(contentId);

			const buttonCustomIdGenerator = InteractionUtils.constructCustomIdGenerator({
				baseID: SuggestionConfig.customIdRecords.suggestion_status.id,
				messageComponentType: Enums.MessageComponentType.Button
			});

			const upvoteButton = new ButtonBuilder()
				.setEmoji("👍")
				.setLabel(StatusType.Upvote)
				.setStyle(ButtonStyle.Primary)
				.setCustomId(buttonCustomIdGenerator(StatusType.Upvote));

			const downvoteButton = new ButtonBuilder()
				.setEmoji("👎")
				.setLabel(StatusType.Downvote)
				.setStyle(ButtonStyle.Primary)
				.setCustomId(buttonCustomIdGenerator(StatusType.Downvote));

			const approveButton = new ButtonBuilder()
				.setEmoji("✅")
				.setLabel(StatusType.Approve)
				.setStyle(ButtonStyle.Success)
				.setCustomId(buttonCustomIdGenerator(StatusType.Approve));

			const rejectButton = new ButtonBuilder()
				.setEmoji("🗑️")
				.setLabel(StatusType.Reject)
				.setStyle(ButtonStyle.Danger)
				.setCustomId(buttonCustomIdGenerator(StatusType.Reject));

			const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteButton, downvoteButton);
			const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, rejectButton);

			const connectGuild: Pick<Prisma.CaseCreateInput, "guild"> = {
				guild: {
					connect: {
						id: interaction.guildId
					}
				}
			};

			const author = DBConnectionManager.Prisma.entity.connectOrCreateHelper(
				interaction.user.id,
				connectGuild,
				EntityType.USER
			);

			const { id } = await DBConnectionManager.Prisma.suggestion.create({
				data: {
					id: StringUtils.generateID(),
					author,
					guild: connectGuild.guild
				},
				select: {
					id: true
				}
			});

			const embed = new EmbedBuilder()
				.setColor(LIGHT_GOLD)
				.setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
				.setFields([
					{ name: "Content", value: content },
					{ name: "Status", value: "⏳ Pending" },
					{ name: "Votes", value: this.formatVotes() }
				])
				.setFooter({ text: `Suggestion ID: ${id} | User ID: ${interaction.user.id}` })
				.setTimestamp();

			const { url } = await channel.send({ embeds: [embed], components: [firstRow, secondRow] });

			const viewMessageEmbed = new EmbedBuilder()
				.setColor(LIGHT_GOLD)
				.setDescription(`Successfully sent suggestion in ${channel.toString()}`);

			const viewMessageActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View Message").setURL(url)
			);

			return await InteractionUtils.replyOrFollowUp(modalSubmitInteraction, {
				embeds: [viewMessageEmbed],
				components: [viewMessageActionRow],
				ephemeral: true
			});
		}
	}

	@ButtonComponent({ id: SuggestionConfig.customIdRecords.suggestion_status.regex })
	public async buttonStatus(interaction: ButtonInteraction<"cached">) {
		const statusType = interaction.customId.split(StringUtils.customIDFIeldBodySeperator).pop() as StatusType;

		const isVerdictBased = statusType === StatusType.Approve || statusType === StatusType.Reject;

		const isInsufficientPermission =
			isVerdictBased && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

		if (isInsufficientPermission) {
			throw new ValidationError("you need Administrator to perform this action");
		}

		const apiEmbed = interaction.message.embeds[0].toJSON();
		const statusFieldIndex = apiEmbed.fields!.findIndex(({ name }) => name === "Status");
		const voteFieldIndex = apiEmbed.fields!.findIndex(({ name }) => name === "Votes");

		assert(apiEmbed.footer && apiEmbed.fields && statusFieldIndex !== -1 && voteFieldIndex !== -1);

		const { text: footerText } = apiEmbed.footer;
		const suggestionId = footerText.match(/(?<=Suggestion ID: )\S+/)![0];
		const authorId = footerText.split(" ").pop()!;

		if (authorId === interaction.user.id) {
			throw new ValidationError("verdict or vote cannot be actioned to yourself");
		}

		if (isVerdictBased) {
			const { status } = await DBConnectionManager.Prisma.suggestion.update({
				where: { id: suggestionId },
				data: { status: SuggestionStatus[statusType === StatusType.Approve ? "APPROVED" : "REJECTED"] },
				select: { status: true }
			});

			apiEmbed.color = Colors[statusType === StatusType.Approve ? "Green" : "Red"];
			apiEmbed.fields[statusFieldIndex].value = statusType === StatusType.Approve ? "✅ Approved" : "❌ Rejected";

			await InteractionUtils.disableComponents(interaction.message, {
				messageEditOptions: { embeds: [apiEmbed] }
			});

			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: `Suggestion ${suggestionId} ${StringUtils.capitaliseFirstLetter(status.toLowerCase())}!`,
				ephemeral: true
			});
		}

		const { doc } = await DBConnectionManager.Prisma.suggestion.fetchByIdOrThrow({
			id: suggestionId,
			select: { upvotedUserIDs: true, downvotedUserIDs: true }
		});

		const hasAlreadyVoted = [...doc.downvotedUserIDs, ...doc.upvotedUserIDs].includes(interaction.user.id);

		if (hasAlreadyVoted) {
			throw new ValidationError("you have already voted");
		}

		doc[statusType === StatusType.Upvote ? "upvotedUserIDs" : "downvotedUserIDs"].push(interaction.user.id);

		const { upvotedUserIDs, downvotedUserIDs } = await DBConnectionManager.Prisma.suggestion.update({
			where: { id: suggestionId },
			data: doc,
			select: { upvotedUserIDs: true, downvotedUserIDs: true }
		});

		apiEmbed.fields[voteFieldIndex].value = this.formatVotes(upvotedUserIDs, downvotedUserIDs);

		await interaction.message.edit({ embeds: [apiEmbed] });

		const perfectTenseAction = `${statusType.toUpperCase()}ED`;

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content: `Suggestion ${suggestionId} successfully ${perfectTenseAction}!`,
			ephemeral: true
		});
	}

	private formatVotes(upvotes: string[] = [], downvotes: string[] = []) {
		const totalVotes = upvotes.length + downvotes.length;
		const progressBarLength = 12;
		const filledSquares = Math.round((upvotes.length / totalVotes) * progressBarLength) || 0;

		let emptySquares = progressBarLength - filledSquares || 0;

		if (!filledSquares && !emptySquares) {
			emptySquares = progressBarLength;
		}

		const upPercentage = (upvotes.length / totalVotes) * 100 || 0;
		const downPercentage = (downvotes.length / totalVotes) * 100 || 0;

		const progressBar =
			(filledSquares ? this.progressBar.leftFull : this.progressBar.leftEmpty) +
			(this.progressBar.middleFull.repeat(filledSquares) + this.progressBar.middleEmpty.repeat(emptySquares)) +
			(filledSquares === progressBarLength ? this.progressBar.rightFull : this.progressBar.rightEmpty);

		const results = [];

		results.push(
			`👍 ${upvotes.length} upvotes (${upPercentage.toFixed(1)}%) • 👎 ${
				downvotes.length
			} downvotes (${downPercentage.toFixed(1)}%)`
		);
		results.push(progressBar);

		return results.join("\n");
	}
}
