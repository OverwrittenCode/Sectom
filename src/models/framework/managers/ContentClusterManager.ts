import assert from "assert";

import { EntityType } from "@prisma/client";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	HeadingLevel,
	ModalBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
	bold,
	channelMention,
	heading,
	inlineCode
} from "discord.js";
import { ButtonComponent, Discord, ModalComponent, SelectMenuComponent } from "discordx";
import _ from "lodash";

import { LIGHT_GOLD, MAX_REASON_STRING_LENGTH } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { ActionType } from "@prisma/client";
import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	GuildTextBasedChannel,
	ModalSubmitInteraction,
	StringSelectMenuInteraction
} from "discord.js";
import type { SetRequired } from "type-fest";

interface BaseOptions extends Pick<CustomIdFieldOptions, "componentType"> {
	interaction: ChatInputCommandInteraction<"cached">;
}

interface CustomIdFieldOptions {
	componentType: Enums.ContentClusterComponentType;
	modifierType: Enums.ModifierType;
	propertyType: Enums.ContentClusterPropertyType;
}

interface ModalPropertyHandlerOptions extends CustomIdFieldOptions {
	data?: Typings.Prettify<
		SetRequired<
			{
				[K in
					| `${SubjectTextInputField}`
					| `${PanelTextInputField}`]?: K extends `${PanelTextInputField.LinkedSubjects}`
					? string[]
					: K extends `${PanelTextInputField.Colour}`
						? number
						: string;
			},
			BaseTextInputField.Name
		> & { configuration: PrismaJson.Configuration }
	>;
	interaction: ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached">;
}

interface ModifyFieldOptions extends BaseOptions, Omit<CustomIdFieldOptions, "propertyType"> {}

interface SendOptions extends BaseOptions {
	channel: GuildTextBasedChannel;
}

enum BaseTextInputField {
	Name = "name",
	Description = "description",
	Reason = "reason"
}

enum PanelTextInputField {
	Name = "name",
	Description = "description",
	Reason = "reason",
	Colour = "colour",
	LinkedSubjects = "linked_subjects"
}

enum SubjectTextInputField {
	Name = "name",
	Description = "description",
	Reason = "reason",
	Emoji = "emoji"
}

export abstract class ContentClusterManager {
	private static readonly modifiers = Object.values(Enums.ModifierType);
	
	public static readonly properties = Object.values(Enums.ContentClusterPropertyType);
	public static readonly baseCustomIds = ["setup", "view", "channel", "send", "create"];
	public static readonly componentTypePrefixMatch = `(${Object.values(Enums.ContentClusterComponentType).join("|")})`;

	public static constructCustomIdRecords<
		const ComponentType extends Enums.ContentClusterComponentType,
		const AdditionalCustomIds extends string[]
	>(componentType: ComponentType, ...additionalCustomIds: AdditionalCustomIds) {
		const customIds = [...ContentClusterManager.baseCustomIds, ...(additionalCustomIds || [])].map(
			(customId) =>
				(componentType +
					StringUtils.CustomIDFieldPrefixSeperator +
					customId) as `${ComponentType}${typeof StringUtils.CustomIDFieldPrefixSeperator}${typeof customId}`
		);

		return InteractionUtils.customIdPrefixRecords(...customIds);
	}

	public static retrieveCustomIdFields(customId: string): CustomIdFieldOptions {
		const componentType = customId
			.split(StringUtils.CustomIDFieldPrefixSeperator)
			.shift() as Enums.ContentClusterComponentType;

		const bodyFields = customId.split(StringUtils.CustomIDFIeldBodySeperator);

		const propertyType = bodyFields.find((str) =>
			this.properties.includes(str)
		) as Enums.ContentClusterPropertyType;

		const modifierType = bodyFields.find((str) => this.modifiers.includes(str)) as Enums.ModifierType;

		return { componentType, propertyType, modifierType };
	}

	public static async send(options: SendOptions) {
		const { interaction, channel, componentType } = options;

		assert(interaction.channel);

		const customIdRecords = this.constructCustomIdRecords(componentType);

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: componentType
		});

		const { NotConfigured } = ValidationError.MessageTemplates;

		if (componentType === Enums.ContentClusterComponentType.Ticket && !configuration[componentType].staffRoleId) {
			throw new ValidationError(NotConfigured("ticket staff role"));
		}

		const componentConfiguration = configuration[componentType];

		if (!componentConfiguration.panels.length) {
			throw new ValidationError(NotConfigured("Panel"));
		}

		const linkedPanels = componentConfiguration.panels.filter(({ subjectNames }) => subjectNames.length);

		if (!ObjectUtils.isValidArray(linkedPanels)) {
			throw new ValidationError("no Panels with linked subjects, try updating a Panel instead.");
		}

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: customIdRecords[`${componentType}_send`].id,
				messageComponentType: Enums.MessageComponentType.SelectMenu
			},
			channel.id
		);

		const customId = customIdGenerator();

		const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(customId)
				.setPlaceholder("Select a Panel")
				.setOptions(linkedPanels.map(({ name }) => ({ label: name, value: name })))
		);

		await InteractionUtils.replyOrFollowUp(interaction, { components: [actionRow] });
	}

	public static async setupModifyComponent(options: ModifyFieldOptions) {
		const { interaction, componentType, modifierType } = options;

		const customIdRecords = this.constructCustomIdRecords(componentType);

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId: interaction.guildId,
			check: componentType
		});

		const componentConfiguration = configuration[componentType];

		if (modifierType === Enums.ModifierType.Add) {
			const noSubjects = !componentConfiguration.subjects.length;

			const buttonCustomIdGenerator = InteractionUtils.constructCustomIdGenerator(
				{
					baseID: customIdRecords[`${componentType}_setup`].id,
					messageComponentType: Enums.MessageComponentType.Button
				},

				modifierType
			);

			const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				this.properties.map((property, i) =>
					new ButtonBuilder()
						.setCustomId(buttonCustomIdGenerator(property))
						.setStyle(i + 1)
						.setLabel(StringUtils.capitaliseFirstLetter(property))
						.setDisabled(property === Enums.ContentClusterPropertyType.Panel && noSubjects)
				)
			);

			const panelDescriptionArray = [
				heading("Panels", HeadingLevel.Two),
				"Panels are embeds which contain Subjects as buttons, essentially grouping Subjects together",
				"- You can change the name (assigned to embed title), description, and colour"
			];

			if (noSubjects) {
				panelDescriptionArray.push("- Panel Button is disabled as there are no subjects to add to it");
			}

			const subjectDescriptionArray = [
				heading("Subjects", HeadingLevel.Two),
				"They are button components of a panel",
				"- You can change the name, emoji, and description (added to the Panel when sent)"
			];

			const embed = new EmbedBuilder()
				.setTitle("Add a subject or panel")
				.setColor(LIGHT_GOLD)
				.setDescription([...panelDescriptionArray, ...subjectDescriptionArray].join(StringUtils.LineBreak));

			return await InteractionUtils.replyOrFollowUp(interaction, { embeds: [embed], components: [actionRow] });
		}

		const validProperties = ContentClusterManager.properties.filter(
			(property) => !!componentConfiguration[`${property}s` as `${(typeof this.properties)[number]}s`].length
		);

		if (!validProperties.length) {
			throw new ValidationError(`no current subjects or panels to ${modifierType}`);
		}

		const actionRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: customIdRecords[`${componentType}_setup`].id,
				messageComponentType: Enums.MessageComponentType.SelectMenu
			},
			modifierType
		);

		validProperties.forEach((property) => {
			const propertyTypeConfigKey = `${property}s` as `${(typeof this.properties)[number]}s`;

			actionRows.push(
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(customIdGenerator(property))
						.setPlaceholder(`Select a ${StringUtils.capitaliseFirstLetter(property)}`)
						.setDisabled(!componentConfiguration[propertyTypeConfigKey].length)
						.setOptions(
							componentConfiguration[propertyTypeConfigKey].map((data) => {
								const option = new StringSelectMenuOptionBuilder()
									.setLabel(data.name)
									.setValue(data.name);

								if ("description" in data && data.description) {
									option.setDescription(data.description);
								}

								if (
									"emoji" in data &&
									data.emoji &&
									InteractionUtils.isValidEmoji(interaction, data.emoji)
								) {
									option.setEmoji(data.emoji);
								}

								return option.toJSON();
							})
						)
				)
			);
		});

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content: `Select which property to ${modifierType}`,
			components: actionRows
		});
	}
}

@Discord()
export abstract class ContentClusterMessageComponentHandler {
	private static readonly propertyRegexes = ContentClusterManager.baseCustomIds.reduce(
		(acc, id) => {
			acc[id] = new RegExp(
				`^${ContentClusterManager.componentTypePrefixMatch + StringUtils.CustomIDFieldPrefixSeperator + id}`
			);
			return acc;
		},
		{} as Record<(typeof ContentClusterManager.baseCustomIds)[number], RegExp>
	);

	@ButtonComponent({ id: ContentClusterMessageComponentHandler.propertyRegexes.setup })
	public async buttonPropertySetup(interaction: ButtonInteraction<"cached">) {
		const { interaction: originalInteraction } = interaction.message;

		assert(originalInteraction);

		const isNotSpecifiedUser = originalInteraction.user.id !== interaction.user.id;

		if (isNotSpecifiedUser) {
			return;
		}

		const customIdFields = ContentClusterManager.retrieveCustomIdFields(interaction.customId);

		return this.modalPropertySetupHandler({
			interaction,
			...customIdFields
		});
	}

	@ModalComponent({ id: ContentClusterMessageComponentHandler.propertyRegexes.setup })
	public async modalPropertySetup(interaction: ModalSubmitInteraction<"cached">) {
		const {
			customId,
			guildId,
			channelId,
			fields: { fields }
		} = interaction;

		assert(channelId && interaction.isFromMessage());

		await InteractionUtils.disableComponents(interaction.message);

		const {
			componentType,
			propertyType: propertyType,
			modifierType
		} = ContentClusterManager.retrieveCustomIdFields(customId);

		const propertyTypeSentenceCase = StringUtils.capitaliseFirstLetter(propertyType);

		const propertyTypeConfigKey = `${propertyType}s` as `${Enums.ContentClusterPropertyType}s`;

		const actionTypeBody = [componentType, propertyType, modifierType].map((v) => v.toUpperCase()).join("_");
		const actionType = `CONFIG_${actionTypeBody}` as ActionType;

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: componentType
		});

		const componentConfiguration = configuration[componentType];

		const subjects = componentConfiguration.subjects;

		const continuousTense = modifierType.slice(0, -1) + "ing";

		const [name, description, reason, emoji, colour, linkedSubject] = [
			BaseTextInputField.Name,
			BaseTextInputField.Description,
			BaseTextInputField.Reason,
			SubjectTextInputField.Emoji,
			PanelTextInputField.Colour,
			PanelTextInputField.LinkedSubjects
		].map((id) => fields.find((data) => data.customId === id)?.value);

		const subjectNames = linkedSubject?.match(/\[(.*?)\]/g)!.map((str) => str.slice(1, -1)) ?? [];
		const rawCode = colour?.replace("#", "");
		const hexCode = rawCode ? parseInt(`0x${rawCode}`) : null;

		const isInvalidOrUnwrappedSubject =
			!!subjects.length && subjectNames.some((subject) => !subjects.find(({ name }) => name === subject));

		if (isInvalidOrUnwrappedSubject) {
			throw new ValidationError("at least one Subject is not valid, or not [wrapped] in square braces correctly");
		}

		if (rawCode && !StringUtils.Regexes.HexCode.test(rawCode)) {
			throw new ValidationError("invalid hex code provided.");
		}

		if (emoji) {
			const unicodeEmojiCount = emoji.match(StringUtils.Regexes.UnicodeEmoji)?.length;

			const isInvalidEmoji = !unicodeEmojiCount && !interaction.client.emojis.resolve(emoji);

			if (isInvalidEmoji) {
				throw new ValidationError("invalid emoji provided");
			}

			if (unicodeEmojiCount && unicodeEmojiCount > 1) {
				throw new ValidationError("you may only provide one emoji");
			}
		}

		const isDuplicateProperty =
			componentConfiguration[propertyTypeConfigKey].filter((property) => property.name === name).length >=
			(modifierType === Enums.ModifierType.Add ? 1 : 2);

		if (isDuplicateProperty) {
			throw new ValidationError(`duplicate ${propertyTypeSentenceCase} name given`);
		}

		const targetName =
			modifierType === Enums.ModifierType.Add
				? name!
				: customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		const currentIndex = componentConfiguration[propertyTypeConfigKey].findIndex(
			(property) => property.name === targetName
		);

		let newProperty: (typeof componentConfiguration)[`${typeof propertyType}s`][number] | null = null;

		if (modifierType === Enums.ModifierType.Remove) {
			configuration[componentType][propertyTypeConfigKey].splice(currentIndex, 1);

			if (propertyType === Enums.ContentClusterPropertyType.Subject) {
				configuration[componentType].panels = configuration[componentType].panels.map((panel) => ({
					...panel,
					subjectNames: panel.subjectNames.filter((str) => str !== targetName)
				}));
			}
		} else {
			assert(name);

			if (propertyType === Enums.ContentClusterPropertyType.Panel) {
				newProperty = {
					name,
					subjectNames,
					apiEmbed: new EmbedBuilder()
						.setTitle(name)
						.setDescription(description ?? "")
						.setColor(hexCode)
						.toJSON()
				};
			} else {
				newProperty = {
					name,
					description,
					emoji
				};
			}

			const isUpdate = modifierType === Enums.ModifierType.Update;

			const nextIndex = configuration[componentType][propertyTypeConfigKey].length;
			const appliedIndex = isUpdate ? currentIndex : nextIndex;

			const isEqualToCurrent =
				isUpdate && _.isEqual(configuration[componentType][propertyTypeConfigKey][appliedIndex], newProperty);

			if (isEqualToCurrent) {
				throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
			}

			configuration[componentType][propertyTypeConfigKey][appliedIndex] = newProperty;
		}

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			reason: reason ?? InteractionUtils.Messages.NoReason,
			actionType,
			actionOptions: {
				pendingExecution: () =>
					DBConnectionManager.Prisma.guild.update({
						where: { id: guildId },
						data: { configuration }
					})
			},
			successContent: `${continuousTense.replace("ing", "ed")} a ${propertyType} with the name ${inlineCode(targetName)}`
		});
	}

	@SelectMenuComponent({ id: ContentClusterMessageComponentHandler.propertyRegexes.send })
	public async selectMenuPropertySend(interaction: StringSelectMenuInteraction<"cached">) {
		const { customId, guildId, guild, values } = interaction;

		const channelId = customId.split(StringUtils.CustomIDFIeldBodySeperator).pop()!;

		const channel = await guild.channels.fetch(channelId);

		if (!channel) {
			throw new ValidationError(ValidationError.MessageTemplates.CannotRecall("Channel"));
		}

		if (!(channel instanceof TextChannel)) {
			throw new ValidationError(
				ValidationError.MessageTemplates.InvalidChannelType("Panel", ChannelType.GuildText)
			);
		}

		const { componentType } = ContentClusterManager.retrieveCustomIdFields(customId);

		const customIdRecords = ContentClusterManager.constructCustomIdRecords(componentType);

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: componentType
		});

		const componentConfiguration = configuration[componentType];

		const panelName = values[0];
		const panel = componentConfiguration.panels.find(({ name }) => name === panelName);

		if (!panel) {
			throw new ValidationError(ValidationError.MessageTemplates.CannotRecall(`${panelName} Panel`));
		}

		panel.apiEmbed.description ??= "";

		const subjectDescriptionInfoArray: string[] = [];

		const linkedSubjects = panel.subjectNames.map(
			(subjectName) => componentConfiguration.subjects.find((subject) => subject.name === subjectName)!
		);

		const linkedSubjectActionRow = new ActionRowBuilder<ButtonBuilder>();
		const linkedSubjectCustomIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: customIdRecords[`${componentType}_create`].id,
				messageComponentType: Enums.MessageComponentType.Button
			},
			Enums.MessageComponentType.Modal
		);

		linkedSubjects.forEach((subject) => {
			const button = new ButtonBuilder()
				.setCustomId(linkedSubjectCustomIdGenerator(subject.name))
				.setLabel(subject.name)
				.setStyle(ButtonStyle.Primary);

			let description = "";

			if (subject.emoji && InteractionUtils.isValidEmoji(interaction, subject.emoji)) {
				description += `${subject.emoji} `;
				button.setEmoji(subject.emoji);
			}

			description += `${bold(subject.name)}`;

			if (subject.description) {
				description += ` - ${subject.description}`;
			}

			subjectDescriptionInfoArray.push(description);
			linkedSubjectActionRow.addComponents(button);
		});

		panel.apiEmbed.description +=
			StringUtils.LineBreak.repeat(2) + subjectDescriptionInfoArray.join(StringUtils.LineBreak);

		const { url } = await channel.send({ embeds: [panel.apiEmbed], components: [linkedSubjectActionRow] });

		const viewMessageEmbed = new EmbedBuilder()
			.setColor(LIGHT_GOLD)
			.setDescription(`Successfully sent panel in ${channelMention(channel.id)}`);

		const viewMessageActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View Message").setURL(url)
		);

		return await InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [viewMessageEmbed],
			components: [viewMessageActionRow]
		});
	}

	@SelectMenuComponent({ id: ContentClusterMessageComponentHandler.propertyRegexes.setup })
	public async selectMenuPropertySetup(interaction: StringSelectMenuInteraction<"cached">) {
		const { component, guildId } = interaction;
		const { options, customId } = component;

		const { label: name, description, emoji } = options[0];

		const {
			componentType,
			propertyType: propertyType,
			modifierType
		} = ContentClusterManager.retrieveCustomIdFields(customId);

		const propertyConfigKey = `${propertyType}s` as `${typeof propertyType}s`;

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: componentType
		});

		const componentConfiguration = configuration[componentType];

		let linked_subjects: string[] = [];

		if (propertyConfigKey === "panels") {
			linked_subjects = componentConfiguration[propertyConfigKey].find(
				(panel) => panel.name === name
			)!.subjectNames;
		}

		return this.modalPropertySetupHandler({
			interaction,
			componentType,
			propertyType: propertyType,
			modifierType,
			data: {
				name,
				description,
				emoji: emoji?.id ?? emoji?.name,
				linked_subjects,
				configuration
			}
		});
	}

	@SelectMenuComponent({ id: ContentClusterMessageComponentHandler.propertyRegexes.view })
	public async selectMenuPropertyView(interaction: StringSelectMenuInteraction<"cached">) {
		const { component, guildId } = interaction;
		const { options, customId } = component;

		const { value, description, emoji } = options[0];

		const { componentType, propertyType: propertyType } = ContentClusterManager.retrieveCustomIdFields(customId);
		const propertyTypeConfigKey = `${propertyType}s` as `${Enums.ContentClusterPropertyType}s`;

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: componentType
		});

		const componentConfiguration = configuration[componentType];

		const property = componentConfiguration[propertyTypeConfigKey].find(({ name }) => name === value);

		if (!property) {
			throw new ValidationError(
				ValidationError.MessageTemplates.CannotRecall(
					`${value} ${StringUtils.capitaliseFirstLetter(propertyType)}`
				)
			);
		}

		const embeds: EmbedBuilder[] = [];

		const descriptionArray = [`${bold("Name:")} ${value}`];

		if (description) {
			descriptionArray.push(`${bold("Description:")}, ${description}`);
		}

		if (emoji) {
			const emojiMention = InteractionUtils.emojiMention(emoji);

			descriptionArray.push(`${bold("Emoji:")} ${emojiMention}`);
		}

		if ("channelId" in property && property.channelId) {
			descriptionArray.push(`${bold("Channel:")} ${channelMention(property.channelId)}`);
		}

		const infoEmbed = new EmbedBuilder()
			.setTitle(
				`${StringUtils.capitaliseFirstLetter(componentType)} ${StringUtils.capitaliseFirstLetter(propertyType)}: ${property.name}`
			)
			.setColor(LIGHT_GOLD)
			.setDescription(descriptionArray.join(StringUtils.LineBreak));

		embeds.push(infoEmbed);

		if ("apiEmbed" in property) {
			embeds.push(new EmbedBuilder(property.apiEmbed));
		}

		return await InteractionUtils.replyOrFollowUp(interaction, { embeds, ephemeral: true });
	}

	private async modalPropertySetupHandler(options: ModalPropertyHandlerOptions) {
		const { interaction, componentType, propertyType: propertyType, modifierType, data } = options;

		const [componentTypeSentenceCase, propertyTypeSentenceCase, modifierTypeSentenceCase] = [
			componentType,
			propertyType,
			modifierType
		].map(StringUtils.capitaliseFirstLetter);

		let configuration = data?.configuration;

		if (!configuration) {
			const { configuration: _configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
				guildId: interaction.guildId,
				check: componentType
			});

			configuration = _configuration;
		}

		const customIdRecords = ContentClusterManager.constructCustomIdRecords(componentType);

		const componentConfiguration = configuration[componentType];

		const subjects = componentConfiguration.subjects;

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator(
			{
				baseID: customIdRecords[`${componentType}_setup`].id,
				messageComponentType: Enums.MessageComponentType.Modal
			},
			propertyType,
			modifierType,
			data?.name ?? ""
		);

		const continuousTense = modifierType.slice(0, -1) + "ing";

		const modal = new ModalBuilder()
			.setCustomId(customIdGenerator())
			.setTitle(
				`${modifierTypeSentenceCase} ${modifierType === Enums.ModifierType.Add ? "a" : "the"} ${componentTypeSentenceCase} ${propertyTypeSentenceCase}`
			);

		const textInputs: TextInputBuilder[] = [];

		const reasonInput = new TextInputBuilder()
			.setCustomId(BaseTextInputField.Reason)
			.setLabel(`What is the reason for ${continuousTense} this?`)
			.setPlaceholder("Provide some text (optional)")
			.setMaxLength(MAX_REASON_STRING_LENGTH)
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false);

		if (modifierType === Enums.ModifierType.Remove) {
			textInputs.push(reasonInput);
		} else {
			const nameInput = new TextInputBuilder()
				.setCustomId(BaseTextInputField.Name)
				.setLabel("What is the unique name?")
				.setPlaceholder("Enter a unique name")
				.setMinLength(3)
				.setMaxLength(20)
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const descriptionInput = new TextInputBuilder()
				.setCustomId(BaseTextInputField.Description)
				.setLabel("What is the description?")
				.setPlaceholder("Provide some text (optional)")
				.setMaxLength(1_000)
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(false);

			if (data) {
				nameInput.setValue(data.name);

				if (data.description) {
					descriptionInput.setValue(data.description);
				}
			}

			if (propertyType === "subject") {
				const emojiInput = new TextInputBuilder()
					.setCustomId(SubjectTextInputField.Emoji)
					.setLabel("What is the Button Emoji's Symbol or Id?")
					.setPlaceholder("e.g. 🎮 or 960199376511336448 (optional)")
					.setMaxLength(19)
					.setStyle(TextInputStyle.Short)
					.setRequired(false);

				if (data) {
					if (data.emoji) {
						emojiInput.setValue(data.emoji);
					}
				} else if (componentType === Enums.ContentClusterComponentType.Suggestion) {
					nameInput.setValue("Gaming Events");
					descriptionInput.setValue(
						"Use this for suggesting new gaming events, tournaments, or game-specific activities."
					);
					emojiInput.setValue("🎮");
				} else {
					nameInput.setValue("User Report");
					descriptionInput.setValue(
						"Provide the User ID of the user you are reporting and what rule(s) they broke."
					);
					emojiInput.setValue("🛑");
				}

				textInputs.push(nameInput, descriptionInput, emojiInput, reasonInput);
			} else {
				const hexCodeInput = new TextInputBuilder()
					.setCustomId(PanelTextInputField.Colour)
					.setLabel("What is the hex color code of the embed?")
					.setPlaceholder("Provide a hex code (optional)")
					.setMaxLength(7)
					.setStyle(TextInputStyle.Short)
					.setRequired(false);

				const wrappedSubjects = subjects.map(({ name }) => `[${name}]`);

				const shortestSubjectLength = wrappedSubjects
					.map((subject) => subject.length)
					.toSorted((a, b) => a - b)[0];

				const allSubjectsAdded = wrappedSubjects.join(StringUtils.LineBreak);

				const linkedSubjectInput = new TextInputBuilder()
					.setCustomId(PanelTextInputField.LinkedSubjects)
					.setLabel("What subjects will linked to this?")
					.setPlaceholder("Wrap each subject in [subject] [subject 1]")
					.setMinLength(shortestSubjectLength)
					.setMaxLength(allSubjectsAdded.length)
					.setStyle(TextInputStyle.Paragraph)
					.setRequired(true);

				if (data) {
					if (data.colour) {
						hexCodeInput.setValue(data.colour.toString(16));
					}

					if (data.linked_subjects?.length) {
						linkedSubjectInput.setValue(
							data.linked_subjects.map((name) => `[${name}]`).join(StringUtils.LineBreak)
						);
					}
				} else {
					if (componentType === Enums.ContentClusterComponentType.Suggestion) {
						nameInput.setValue("Event Ideas");
						descriptionInput.setValue(
							[
								"This component is for users who want to suggest new events or activities that could be hosted on the server.",
								"It's a place to share ideas that could bring the community together and create memorable experiences.",
								StringUtils.LineBreak +
									"You can choose one of the subjects below to create a suggestion:"
							].join(StringUtils.LineBreak)
						);
					} else {
						nameInput.setValue("Report Centre");
						descriptionInput.setValue(
							[
								"If you would like to create a report, please click an appropriate button below.",
								`${bold("Warning:")} False reports will result in punishment!`
							].join(StringUtils.LineBreak)
						);
					}

					hexCodeInput.setValue(`#${LIGHT_GOLD.toString(16)}`);
					linkedSubjectInput.setValue(allSubjectsAdded);
				}

				textInputs.push(nameInput, descriptionInput, hexCodeInput, linkedSubjectInput, reasonInput);
			}
		}

		modal.addComponents(
			textInputs.map((textInput) => new ActionRowBuilder<TextInputBuilder>().addComponents(textInput).toJSON())
		);

		return await interaction.showModal(modal);
	}
}
