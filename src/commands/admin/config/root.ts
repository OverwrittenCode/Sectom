import { bold, channelMention, orderedList } from "@discordjs/builders";
import { PaginationType } from "@discordx/pagination";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import {
	ActionRowBuilder,
	Colors,
	EmbedBuilder,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	inlineCode
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import prettyMilliseconds from "pretty-ms";

import { LIGHT_GOLD } from "~/constants.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { ContentClusterManager } from "~/models/framework/managers/ContentClusterManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import { PaginationManager } from "~/models/framework/managers/PaginationManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { NumberUtils } from "~/utils/number.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { PaginationItem } from "@discordx/pagination";
import type { ButtonBuilder, ChatInputCommandInteraction } from "discord.js";

const actionTypePunishmentMap = {
	[ActionType.TIME_OUT_USER_ADD]: "Time Out",
	[ActionType.KICK_USER_SET]: "Kick",
	[ActionType.BAN_USER_ADD]: "Ban"
};

@Discord()
@Category(Enums.CommandCategory.Admin)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({
	dmPermission: false,
	description: "Master configuration of the server",
	name: "config",
	defaultMemberPermissions: [PermissionFlagsBits.Administrator]
})
@SlashGroup("config")
export abstract class Config {
	public static LevelingCustomIDRecords = InteractionUtils.customIdPrefixRecords("leveling_view");

	public static async togglestate(
		key: keyof PrismaJson.Configuration,
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId, channelId } = interaction;

		const { configuration, save } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId });

		configuration[key].disabled = !configuration[key].disabled;

		const actionTypeSuffix = configuration[key].disabled ? "DISABLE" : "ENABLE";

		const actionType = ActionType[`CONFIG_MODULE_${actionTypeSuffix}`];

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			reason,
			actionType,
			actionOptions: {
				pendingExecution: save
			},
			successContent: `${actionTypeSuffix.toLowerCase()}d the ${key} configuration`
		});
	}

	@Slash({ dmPermission: false, description: "Interactive configuration panel" })
	public async panel(_interaction: ChatInputCommandInteraction<"cached">) {}

	@Slash({ dmPermission: false, description: "View all configurations" })
	public async view(interaction: ChatInputCommandInteraction<"cached">) {
		const { guild, guildId } = interaction;

		const { configuration } = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId });

		const paginationPages: Array<Pick<PaginationItem, "embeds" | "components">> = [];

		const displayEmbed = new EmbedBuilder().setColor(LIGHT_GOLD).setTitle(`${guild.name} | Configurations`);

		const configurationValues: string[] = [];
		const pageTextArray: string[] = ["Home"];

		const logChannelConfigurations = await DBConnectionManager.Prisma.entity.fetchMany({
			where: { logChannelGuildId: guildId },
			select: {
				id: true,
				logChannelType: true
			}
		});

		if (logChannelConfigurations.length) {
			const pageText = "Log Channel";

			pageTextArray.push(pageText);
			configurationValues.push(pageText);

			const embed = new EmbedBuilder().setColor(LIGHT_GOLD).setTitle(`${guild.name} | ${pageText} Configuration`);
			const descriptionArray = logChannelConfigurations.map((data) => {
				const channel = channelMention(data.id);

				const type = data.logChannelType ?? "DEFAULT";

				const generalisedPunishment = type.replace(StringUtils.Regexes.AllActionModifiers, "");
				const titleCasePunishment = StringUtils.convertToTitleCase(generalisedPunishment, "_");

				return `${bold(`${titleCasePunishment}:`)} ${channel}`;
			});

			embed.setDescription(descriptionArray.join(StringUtils.LineBreak));

			paginationPages.push({ embeds: [embed] });
		}

		for (const [name, _configuration] of ObjectUtils.entries(configuration)) {
			const pageText = StringUtils.capitaliseFirstLetter(name);

			const colour = _configuration.disabled ? Colors.Red : LIGHT_GOLD;

			const embed = new EmbedBuilder().setColor(colour).setTitle(`${guild.name} | ${pageText} Configuration`);

			if (_configuration.disabled) {
				embed.setFooter({ text: "This configuration is currently disabled" });
			}

			const actionRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

			const descriptionArray: string[] = [];

			switch (name) {
				case "leveling":
					{
						const { disabled, ...levelingConfiguration } =
							_configuration as PrismaJson.LevelingConfiguration;

						const entries = ObjectUtils.entries(levelingConfiguration);

						const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
							baseID: Config.LevelingCustomIDRecords.leveling_view.id,
							messageComponentType: Enums.MessageComponentType.SelectMenu
						});

						const arrayValueBasedSelectMenu = new StringSelectMenuBuilder().setCustomId(
							customIdGenerator()
						);

						for (const [key, value] of entries) {
							const titleCaseLabel = StringUtils.convertToTitleCase(key);

							if (Array.isArray(value)) {
								if (!value.length) {
									continue;
								}

								arrayValueBasedSelectMenu.addOptions(
									new StringSelectMenuOptionBuilder()
										.setDescription(`View The ${titleCaseLabel}`)
										.setLabel(titleCaseLabel)
										.setValue(key)
								);
							} else {
								const valueStr =
									key === "cooldown" && typeof value === "number"
										? prettyMilliseconds(value, { verbose: true })
										: `${value}`;

								descriptionArray.push(`${bold(`${titleCaseLabel}:`)} ${valueStr}`);
							}
						}

						const optionLength = arrayValueBasedSelectMenu.options.length;

						if (optionLength) {
							actionRows.push(
								new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
									arrayValueBasedSelectMenu.setPlaceholder(`(+${optionLength}) more`)
								)
							);
						}
					}

					break;
				case "warning":
					{
						const warningConfiguration = _configuration as PrismaJson.WarningConfiguration;

						descriptionArray.push(
							`${bold("Duration Multiplier:")} ${inlineCode(warningConfiguration.durationMultiplier.toString())}`
						);

						if (warningConfiguration.thresholds.length) {
							descriptionArray.push(bold("Punishments:"));
						}

						warningConfiguration.thresholds.forEach(({ punishment, threshold, duration }) => {
							const generalisedPunishment =
								actionTypePunishmentMap[punishment as keyof typeof actionTypePunishmentMap];

							const strikePosition = NumberUtils.getOrdinalSuffix(threshold);

							let durationDescription = "";

							if (punishment !== ActionType.KICK_USER_SET) {
								if (duration) {
									durationDescription += StringUtils.convertToTitleCase(
										prettyMilliseconds(duration, {
											verbose: true,
											compact: true,
											secondsDecimalDigits: 0
										}).replace(/s$/, "")
									);
								} else {
									durationDescription += "Permanent";
								}

								durationDescription += " ";
							}

							const description = `- ${strikePosition} Strike: ${bold(durationDescription + generalisedPunishment)}`;

							descriptionArray.push(description);
						});
					}

					break;

				case "suggestion":
				case "ticket":
					{
						const componentConfiguration =
							_configuration as PrismaJson.Configuration[Enums.ContentClusterComponentType];

						const componentType =
							Enums.ContentClusterComponentType[StringUtils.capitaliseFirstLetter(name)];

						const customIdRecords = ContentClusterManager.constructCustomIdRecords(componentType);

						const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
							baseID: customIdRecords[`${componentType}_view`].id,
							messageComponentType: Enums.MessageComponentType.SelectMenu
						});

						const validProperties = ContentClusterManager.properties.filter(
							(property) =>
								!!componentConfiguration[
									`${property}s` as `${(typeof ContentClusterManager.properties)[number]}s`
								].length
						);

						if (validProperties.length) {
							validProperties.forEach((property) => {
								const propertyTypeConfigKey =
									`${property}s` as `${(typeof ContentClusterManager.properties)[number]}s`;

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

													if ("emoji" in data && data.emoji) {
														option.setEmoji(data.emoji);
													}

													return option.toJSON();
												})
											)
									)
								);
							});

							descriptionArray.push(StringUtils.LineBreak + "Select which component to view");
						}
					}

					break;

				default:
					throw new Error("Unexpected configuration entry");
			}

			if (!descriptionArray.length) {
				descriptionArray.push("No data yet");
			}

			pageTextArray.push(pageText);

			configurationValues.push(pageText);

			embed.setDescription(descriptionArray.join(StringUtils.LineBreak));

			paginationPages.push({ embeds: EmbedManager.formatEmbeds([embed]), components: actionRows });
		}

		displayEmbed.setDescription(orderedList(configurationValues));

		paginationPages.unshift({ embeds: [displayEmbed] });

		const pagination = new PaginationManager(interaction, paginationPages, {
			type: PaginationType.SelectMenu,
			pageText: pageTextArray,
			placeholder: "View a configuration",
			showStartEnd: false,
			ephemeral: true
		});

		return await pagination.init();
	}
}
