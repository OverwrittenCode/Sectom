import assert from "assert";

import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { createTranscript } from "discord-html-transcripts";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	ModalBuilder,
	PermissionFlagsBits,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
	ThreadAutoArchiveDuration,
	bold,
	channelMention,
	inlineCode,
	roleMention
} from "discord.js";
import { ButtonComponent, Discord, Guard, ModalComponent, Slash, SlashGroup, SlashOption } from "discordx";
import _ from "lodash";

import { Config } from "~/commands/admin/config/root.js";
import { LIGHT_GOLD, MAX_ACTIVE_THREAD_LIMIT, MAX_REASON_STRING_LENGTH } from "~/constants.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { AtLeastOneSlashOption } from "~/helpers/guards/AtLeastOne.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { GuildInstanceMethods } from "~/models/DB/prisma/extensions/guild.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { ContentClusterManager } from "~/models/framework/managers/ContentClusterManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { Prisma } from "@prisma/client";
import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	GuildTextBasedChannel,
	MessageMentionOptions,
	ModalSubmitInteraction,
	Role
} from "discord.js";

const componentType = Enums.ContentClusterComponentType.Ticket;

enum EmbedTextInputField {
	Title = "title",
	Description = "description",
	Colour = "colour",
	Reason = "reason"
}

enum PromptTextInputField {
	Topic = "topic",
	Description = "description"
}

interface CreateTicketOptions {
	interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached">;
	ticketConfiguration: PrismaJson.TicketConfiguration;
	modalEmbed?: EmbedBuilder;
}

@Discord()
@Category(Enums.CommandCategory.Admin)
@SlashGroup({
	description: "Ticket Configuration",
	name: "ticket",
	root: "config"
})
@SlashGroup("ticket", "config")
export abstract class TicketConfig {
	public static readonly embedDefaults = {
		title: "{subject_name} Ticket",
		description: [
			"A staff will with you shortly.",
			"Please give as much detail as possible for this ticket.",
			StringUtils.LineBreak + "Once this ticket is resolved, you can click the close button below:"
		].join(StringUtils.LineBreak)
	};

	public static readonly customIdRecords = ContentClusterManager.constructCustomIdRecords(
		componentType,
		"embed",
		"prompt",
		"close",
		"lock"
	);

	@Slash({ description: "Enables/disables this configuration " })
	public toggle(
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Config.togglestate("ticket", reason, interaction);
	}

	@Slash({ description: "Add a new ticket subject or panel" })
	public async add(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType,
			modifierType: Enums.ModifierType.Add
		});
	}

	@Slash({ description: "Update a ticket subject or panel" })
	public async update(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType,
			modifierType: Enums.ModifierType.Update
		});
	}

	@Slash({ description: "Remove a ticket subject or panel" })
	public async remove(interaction: ChatInputCommandInteraction<"cached">) {
		return ContentClusterManager.setupModifyComponent({
			interaction,
			componentType,
			modifierType: Enums.ModifierType.Remove
		});
	}

	@Slash({ description: "Send a ticket panel to a channel" })
	public async send(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.CHANNEL })
		channel: GuildTextBasedChannel,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ContentClusterManager.send({
			interaction,
			channel,
			componentType
		});
	}

	@Slash({ description: "Configure the embed that is sent in the ticket channel when a ticket is created" })
	public async openingembed(interaction: ChatInputCommandInteraction<"cached">) {
		const {
			configuration: { ticket }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: "ticket"
		});

		const currentEmbed = ticket.apiEmbed;

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
			baseID: TicketConfig.customIdRecords.ticket_embed.id,
			messageComponentType: Enums.MessageComponentType.Modal
		});

		const modal = new ModalBuilder().setCustomId(customIdGenerator()).setTitle("Configure Ticket Opening Embed");

		const textInputs: TextInputBuilder[] = [];

		const titleInput = new TextInputBuilder()
			.setCustomId(EmbedTextInputField.Title)
			.setLabel("What is the title of the embed?")
			.setPlaceholder("Provide some text (optional)")
			.setValue(TicketConfig.embedDefaults.title)
			.setMaxLength(50)
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const descriptionInput = new TextInputBuilder()
			.setCustomId(EmbedTextInputField.Description)
			.setLabel("What is the description of the embed?")
			.setPlaceholder("Provide some text")
			.setValue(TicketConfig.embedDefaults.description)
			.setMinLength(10)
			.setMaxLength(1_000)
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		const hexCodeInput = new TextInputBuilder()
			.setCustomId(EmbedTextInputField.Colour)
			.setLabel("What is the hex color code of the embed?")
			.setPlaceholder("Provide a hex code (optional)")
			.setValue(LIGHT_GOLD.toString(16))
			.setMaxLength(7)
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		const reasonInput = new TextInputBuilder()
			.setCustomId(EmbedTextInputField.Reason)
			.setLabel("What is the reason for this?")
			.setPlaceholder("Provide some text (optional)")
			.setMaxLength(MAX_REASON_STRING_LENGTH)
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false);

		if (currentEmbed?.title) {
			titleInput.setValue(currentEmbed.title);
		}

		if (currentEmbed?.description) {
			descriptionInput.setValue(currentEmbed.description);
		}

		if (currentEmbed?.color) {
			hexCodeInput.setValue(currentEmbed.color.toString(16));
		}

		textInputs.push(titleInput, descriptionInput, hexCodeInput, reasonInput);

		modal.addComponents(
			textInputs.map((textInput) => new ActionRowBuilder<TextInputBuilder>().addComponents(textInput).toJSON())
		);

		return await interaction.showModal(modal);
	}

	@Slash({ description: "Configure global ticket settings" })
	@Guard(AtLeastOneSlashOption, RateLimit(TIME_UNIT.seconds, 3))
	public async settings(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.ROLE,
			name: "staff_role",
			descriptionNote: "The staff role for tickets",
			required: false
		})
		staffRole: Role | undefined,
		@SlashOption({
			description: "If the staff role should be mentioned at the start of every ticket",
			name: "auto_staff_mention",
			type: ApplicationCommandOptionType.Boolean
		})
		autoStaffMention: boolean | undefined,
		@SlashOption({
			description: "If tickets should prompt the user with questions",
			name: "prompt_user",
			type: ApplicationCommandOptionType.Boolean
		})
		prompt: boolean | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const updatedSettings = { staffRoleId: staffRole?.id, autoStaffMention, prompt };

		const keys = ObjectUtils.keys(updatedSettings);

		keys.forEach((key) => typeof updatedSettings[key] === "undefined" && delete updatedSettings[key]);

		const {
			configuration: { ticket },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: "ticket"
		});

		const isUpdate = _.isEqual(ticket, GuildInstanceMethods.defaultConfiguration.ticket);

		const actionType = ActionType[`CONFIG_TICKET_SETTINGS_${isUpdate ? "UPDATE" : "ADD"}`];

		const currentSettings = ObjectUtils.pickKeys(ticket, "staffRoleId", "autoStaffMention", "prompt");

		const isEqualToCurrent =
			ObjectUtils.isValidObject(currentSettings) && _.isEqual(currentSettings, updatedSettings);

		if (isEqualToCurrent) {
			throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
		}

		Object.assign(ticket, currentSettings, updatedSettings);

		return await ActionManager.logCase({
			interaction,
			target: {
				id: updatedSettings.staffRoleId ?? interaction.channelId,
				type: EntityType[updatedSettings.staffRoleId ? "ROLE" : "CHANNEL"]
			},
			reason,
			actionType,
			actionOptions: {
				pendingExecution: save
			},
			successContent: "updated ticket settings"
		});
	}
}

@Discord()
export abstract class TicketConfigMessageComponentHandler {
	@ModalComponent({ id: TicketConfig.customIdRecords.ticket_embed.regex })
	public async modalEmbed(interaction: ModalSubmitInteraction<"cached">) {
		const { channelId, fields, guildId } = interaction;
		assert(channelId && fields);

		const {
			configuration: { ticket },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "ticket"
		});

		const isUpdate = _.isEqual(ticket, GuildInstanceMethods.defaultConfiguration.ticket);

		const actionType = ActionType[`CONFIG_TICKET_SETTINGS_${isUpdate ? "UPDATE" : "ADD"}`];

		const [title, description, colour, reason] = [
			EmbedTextInputField.Title,
			EmbedTextInputField.Description,
			EmbedTextInputField.Colour,
			EmbedTextInputField.Reason
		].map((id) => fields.fields.find((data) => data.customId === id)?.value) as [
			...requiredFields: [string, string],
			...optionalFields: Array<string | undefined>
		];

		const rawCode = colour?.replace("#", "");
		const hexCode = rawCode ? parseInt(`0x${rawCode}`) : null;

		if (rawCode && !StringUtils.Regexes.HexCode.test(rawCode)) {
			throw new ValidationError("invalid hex code provided.");
		}

		const newEmbed = new EmbedBuilder(ticket.apiEmbed)
			.setTitle(title)
			.setColor(hexCode)
			.setDescription(description);

		if (title) {
			newEmbed.setTitle(title);
		}

		ticket.apiEmbed = newEmbed.toJSON();

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			reason: reason ?? InteractionUtils.Messages.NoReason,
			actionType,
			actionOptions: {
				pendingExecution: save
			},
			successContent: `${isUpdate ? "updated" : "set"} the ticket configuration`
		});
	}

	@ModalComponent({ id: TicketConfig.customIdRecords.ticket_prompt.regex })
	public async modalPrompt(interaction: ModalSubmitInteraction<"cached">) {
		const {
			configuration: { ticket: ticketConfiguration }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: "ticket"
		});

		const embedFields = InteractionUtils.modalSubmitToEmbedFIelds(interaction);

		const modalEmbed = new EmbedBuilder().addFields(embedFields);

		return this.createTicket({ interaction, ticketConfiguration, modalEmbed });
	}

	@ButtonComponent({ id: TicketConfig.customIdRecords.ticket_create.regex })
	@Guard(
		ClientRequiredPermissions<ButtonInteraction>([
			PermissionFlagsBits.ManageThreads,
			PermissionFlagsBits.ManageMessages
		])
	)
	public async buttonCreate(interaction: ButtonInteraction<"cached">) {
		const { customId, channel: parent, channelId: parentId, guildId, user: author } = interaction;

		assert(parentId);

		if (!(parent instanceof TextChannel)) {
			throw new ValidationError(
				ValidationError.MessageTemplates.InvalidChannelType("current", ChannelType.GuildText)
			);
		}

		const { threads: activeSubjectTicketThreads } = await parent.threads.fetchActive();

		if (activeSubjectTicketThreads.size > MAX_ACTIVE_THREAD_LIMIT) {
			throw new ValidationError("too many current tickets, please try again later");
		}

		const subjectName = customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		const {
			configuration: { ticket: ticketConfiguration }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "ticket"
		});

		if (!ticketConfiguration.staffRoleId) {
			throw new ValidationError(ValidationError.MessageTemplates.NotConfigured("ticket staff role"));
		}

		const authorTicketThreadIds = await DBConnectionManager.Prisma.ticket
			.fetchMany({
				where: { guildId, parentId, authorId: author.id },
				select: { channelId: true }
			})
			.then((data) => data.map(({ channelId }) => channelId));

		let currentTicketThreadId: string | undefined;

		if (authorTicketThreadIds.length) {
			currentTicketThreadId = activeSubjectTicketThreads.find(({ id }) => authorTicketThreadIds.includes(id))?.id;
		}

		if (currentTicketThreadId) {
			throw new ValidationError(
				`you already have a current ${inlineCode(subjectName)} ticket: ${channelMention(currentTicketThreadId)}`
			);
		}

		if (ticketConfiguration.prompt) {
			const customIdGenerator = InteractionUtils.constructCustomIdGenerator(
				{
					baseID: TicketConfig.customIdRecords.ticket_prompt.id,
					messageComponentType: Enums.MessageComponentType.Modal
				},
				subjectName
			);

			const modal = new ModalBuilder().setCustomId(customIdGenerator()).setTitle(`${subjectName} Ticket`);

			const topicInput = new TextInputBuilder()
				.setCustomId(PromptTextInputField.Topic)
				.setLabel("What is the topic of your ticket?")
				.setPlaceholder("Enter some text")
				.setMinLength(3)
				.setMaxLength(60)
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const descriptionInput = new TextInputBuilder()
				.setCustomId(PromptTextInputField.Description)
				.setLabel("What is the description of your ticket?")
				.setPlaceholder("Enter some text")
				.setMinLength(15)
				.setMaxLength(1_000)
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true);

			const textInputs = [topicInput, descriptionInput];

			modal.addComponents(
				textInputs.map((textInput) =>
					new ActionRowBuilder<TextInputBuilder>().addComponents(textInput).toJSON()
				)
			);

			return interaction.showModal(modal);
		}

		await InteractionUtils.deferInteraction(interaction, true);

		return this.createTicket({ interaction, ticketConfiguration });
	}

	@ButtonComponent({ id: TicketConfig.customIdRecords.ticket_lock.regex })
	@Guard(ClientRequiredPermissions<ButtonInteraction>([PermissionFlagsBits.ManageThreads]))
	public async buttonLock(interaction: ButtonInteraction<"cached">) {
		const { customId, channel, member, guildId } = interaction;

		assert(channel?.isThread());

		const subjectName = customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		if (channel.locked) {
			throw new ValidationError("already locked");
		}

		const {
			configuration: { ticket }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "ticket"
		});

		if (!ticket.staffRoleId || !member.roles.cache.has(ticket.staffRoleId)) {
			throw new ValidationError("you are not a ticket staff");
		}

		const auditReasonArray = [
			`The Ticket Subject Name is called "${subjectName}"`,
			`This was actioned by a user with the username of "${interaction.user.username}" who has the user id of ${interaction.user.id}`
		];

		await channel.setLocked(true, auditReasonArray.map((str) => `${str}.`).join(" "));

		await InteractionUtils.replyOrFollowUp(interaction, {
			content: "Locked ticket channel."
		});
	}

	@ButtonComponent({ id: TicketConfig.customIdRecords.ticket_close.regex })
	@Guard(ClientRequiredPermissions<ButtonInteraction>([PermissionFlagsBits.ManageThreads]))
	public async buttonClose(interaction: ButtonInteraction<"cached">) {
		const { channelId, channel, customId } = interaction;

		assert(channelId && channel?.isThread());

		const subjectName = customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		const collection = await InteractionUtils.confirmationButton(interaction, {
			content: "Are you sure you want to close this ticket?"
		});

		await InteractionUtils.replyOrFollowUp(collection.first()!, {
			content: "Please wait: generating transcript."
		});

		const cacheChannelId = process.env.DISCORD_CACHE_CHANNEL;

		assert(cacheChannelId);

		const cacheChannel = await interaction.client.channels.fetch(cacheChannelId);

		assert(cacheChannel?.isTextBased());

		const transcriptAttachment = await createTranscript(channel, {
			poweredBy: false,
			saveImages: true,
			hydrate: true,
			filename: `${channel.name.toLowerCase()}-transcript.html`
		});

		const { attachments } = await cacheChannel.send({
			files: [transcriptAttachment]
		});

		const proxyWorkerURL = `https://discord-cdn-proxy.sectom.workers.dev/?${attachments.first()!.url}`;

		const transcriptActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Transcript").setURL(proxyWorkerURL)
		);

		const {
			doc: { authorId: ticketAuthorId }
		} = await DBConnectionManager.Prisma.ticket.fetchFirstOrThrow({
			where: { channelId },
			select: { authorId: true }
		});

		const ticketAuthor = {
			username: "",
			id: ticketAuthorId,
			...channel.members.cache.find((m) => m.id === ticketAuthorId)
		};

		const reason = `The Ticket Subject Name is called "${subjectName}"`;

		const auditReason = ActionManager.generateAuditReason(interaction, reason, {
			author: ticketAuthor
		});

		await ActionManager.logCase({
			interaction,
			target: {
				id: ticketAuthorId,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.TICKET_INSTANCE_CLOSE,
			actionOptions: {
				pendingExecution: () => channel.delete(auditReason)
			},
			buttonActionRows: [transcriptActionRow]
		});
	}

	private async createTicket(options: CreateTicketOptions) {
		const { interaction, ticketConfiguration, modalEmbed } = options;
		const { channel: parent, channelId: parentId, guildId, customId, member, user: author } = interaction;

		assert(parentId && parent?.type === ChannelType.GuildText);

		if (!ticketConfiguration.staffRoleId) {
			throw new ValidationError("ticket staff role not set");
		}

		const subjectName = customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		const embeds: EmbedBuilder[] = [];

		let threadName = member.nickname ?? author.displayName;

		const title = (ticketConfiguration.apiEmbed?.title ?? TicketConfig.embedDefaults.title).replaceAll(
			"{subject_name}",
			subjectName
		);

		const description = ticketConfiguration.apiEmbed?.description ?? TicketConfig.embedDefaults.description;

		const colour = !ticketConfiguration.apiEmbed ? LIGHT_GOLD : ticketConfiguration.apiEmbed.color ?? null;

		if (modalEmbed) {
			embeds.push(modalEmbed.setTitle(`${title} | Modal Submit`).setColor(colour));

			const modalTitleField = modalEmbed.data.fields!.find(
				(field) => field.name.toLowerCase() === PromptTextInputField.Topic
			)!.value;

			threadName += `: ${modalTitleField}`;
		}

		const openingEmbed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(colour);

		embeds.push(openingEmbed);

		const contentArray = [`${bold("Author:")} ${author.toString()}`];

		const allowedMentions: MessageMentionOptions = { users: [author.id] };

		if (ticketConfiguration.autoStaffMention) {
			contentArray.push(`${bold("Staff Role:")} ${roleMention(ticketConfiguration.staffRoleId)}`);
			allowedMentions.roles = [ticketConfiguration.staffRoleId];
		}

		const auditReasonArray = [
			`The Ticket Subject Name is called "${subjectName}"`,
			`The author of this ticket has the username "${author.username}" and has the user id ${author.id}`,
			`The channel where the panel is posted has the name of "${parent.name}" and has the id ${parentId}`
		];

		const thread = await parent.threads.create({
			name: threadName,
			type: ChannelType.PrivateThread,
			invitable: false,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
			reason: auditReasonArray.map((str) => `${str}.`).join(" ")
		});

		const closeCustomIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: TicketConfig.customIdRecords.ticket_close.id,
				messageComponentType: Enums.MessageComponentType.Button
			},
			subjectName
		);

		const lockCustomIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: TicketConfig.customIdRecords.ticket_lock.id,
				messageComponentType: Enums.MessageComponentType.Button
			},
			subjectName
		);

		const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(closeCustomIdGenerator())
				.setLabel("Close Ticket")
				.setStyle(ButtonStyle.Danger)
				.setEmoji("⛔"),
			new ButtonBuilder()
				.setCustomId(lockCustomIdGenerator())
				.setLabel("Lock Ticket")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji("🔒")
		);

		const openingMessage = await thread.send({
			allowedMentions,
			embeds,
			content: contentArray.join(StringUtils.LineBreak),
			components: [actionRow]
		});

		await openingMessage.pin("Opening message");

		const viewTicketActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View Ticket").setURL(thread.url)
		);

		const connectGuild: Pick<Prisma.CaseCreateInput, "guild"> = {
			guild: {
				connect: {
					id: guildId
				}
			}
		};

		const relationFieldFn = DBConnectionManager.Prisma.entity.connectOrCreateHelper;

		await ActionManager.logCase({
			interaction,
			target: {
				id: thread.id,
				type: EntityType.CHANNEL
			},
			reason: `Ticket Subject Name: "${subjectName}"`,
			actionType: ActionType.TICKET_INSTANCE_CREATE,
			actionOptions: {
				pendingExecution: () =>
					DBConnectionManager.Prisma.ticket.create({
						data: {
							id: StringUtils.GenerateID(),
							guild: connectGuild.guild,
							channel: relationFieldFn(thread.id, connectGuild, EntityType.CHANNEL),
							parent: relationFieldFn(parentId, connectGuild, EntityType.CHANNEL),
							author: relationFieldFn(author.id, connectGuild, EntityType.USER)
						},
						select: {
							id: true
						}
					})
			},
			buttonActionRows: [viewTicketActionRow]
		});

		await thread.members.add(author, "User is the author");

		await InteractionUtils.replyOrFollowUp(interaction, {
			content: `Ticket created: ${thread.toString()}`
		});
	}
}
