import { bold, channelMention, orderedList, underline } from "@discordjs/builders";
import { Pagination, PaginationType } from "@discordx/pagination";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import {
	ActionRowBuilder,
	EmbedBuilder,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	inlineCode
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import prettyMilliseconds from "pretty-ms";

import { LIGHT_GOLD } from "~/constants.js";
import { RedisCache } from "~/models/DB/cache";
import { ContentClusterManager } from "~/models/framework/managers/ContentClusterManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { PaginationItem } from "@discordx/pagination";
import type { Prisma } from "@prisma/client";
import type { ButtonBuilder, ChatInputCommandInteraction } from "discord.js";
import type { Entries } from "type-fest";

@Discord()
@Category(Enums.CommandCategory.Admin)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({
	description: "Master configuration of the server",
	name: "config",
	defaultMemberPermissions: [PermissionFlagsBits.Administrator]
})
@SlashGroup("config")
export abstract class Config {
	@Slash({ description: "View all configurations" })
	public async view(interaction: ChatInputCommandInteraction<"cached">) {
		const { guild, guildId } = interaction;

		const guildDoc = await DBConnectionManager.Prisma.guild.instanceMethods.retrieveGuild(guildId, {
			configuration: true
		});

		if (!guildDoc.configuration) {
			return await InteractionUtils.replyNoData(interaction);
		}

		const paginationPages: Array<Pick<PaginationItem, "embeds" | "components">> = [];

		const displayEmbed = new EmbedBuilder().setColor(LIGHT_GOLD).setTitle(`${guild.name} Configuration`);

		const configurationName = "Configurations";
		const configurationValues: string[] = [];
		const pageTextArray: string[] = ["Configurations"];

		const logChannelWhere = {
			logChannelGuildId: guildId
		} satisfies Prisma.EntityWhereInput;

		let logChannelConfigurations: Pick<
			Typings.Database.Prisma.RetrieveModelDocument<"Entity">,
			"id" | "logChannelType"
		>[] = await RedisCache.entity.retrieveDocuments(logChannelWhere);

		if (!logChannelConfigurations.length) {
			logChannelConfigurations = await DBConnectionManager.Prisma.entity.findMany({
				where: logChannelWhere,
				select: {
					id: true,
					logChannelType: true
				}
			});
		}

		if (logChannelConfigurations.length) {
			const configurationValue = "Log Channel";
			const pageText = `${configurationValue} Configuration`;
			pageTextArray.push(pageText);
			configurationValues.push(configurationValue);

			const embed = new EmbedBuilder().setColor(LIGHT_GOLD).setTitle(`${guild.name} | ${pageText}`);
			const descriptionArray: string[] = [
				`${bold(underline("Key:"))} #channel ${inlineCode("ACTION")} ${StringUtils.LineBreak}`
			];

			logChannelConfigurations.forEach((logChannelConfiguration) => {
				const channel = channelMention(logChannelConfiguration.id);
				const type = logChannelConfiguration.logChannelType ?? "DEFAULT";

				const generalisedPunishment = type.replace(StringUtils.Regexes.AllActionModifiers, "");

				descriptionArray.push(`${channel} ${inlineCode(generalisedPunishment)}`);
			});

			embed.setDescription(descriptionArray.join(StringUtils.LineBreak));

			paginationPages.push({ embeds: [embed] });
		}

		const guildConfigurationEntries = (
			Object.entries(guildDoc.configuration) as [keyof PrismaJson.Configuration, unknown][]
		).filter(([, v]) => typeof v !== "undefined") as Entries<
			Record<keyof PrismaJson.Configuration, Required<PrismaJson.Configuration>[keyof PrismaJson.Configuration]>
		>;

		for (const [name, data] of guildConfigurationEntries) {
			data.disabled ??= false;

			const titleCaseName = StringUtils.capitaliseFirstLetter(name);
			const pageText = `${titleCaseName} Configuration`;

			const embed = new EmbedBuilder().setColor(LIGHT_GOLD).setTitle(`${guild.name} | ${pageText}`);
			const actionRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

			const descriptionArray: string[] = [`${bold("Disabled:")}: ${data.disabled}`];

			switch (name) {
				case "warning":
					{
						const warningData = data as PrismaJson.WarningConfiguration;

						descriptionArray.push(
							`${bold("Duration Multiplier:")} ${inlineCode(warningData.durationMultiplier.toString())}`
						);

						if (warningData.thresholds.length) {
							descriptionArray.push(
								`${bold(underline("Key:"))} ${inlineCode("Threshold")} ${bold("[PUNISHMENT]")} Duration?` +
									StringUtils.LineBreak
							);
						}

						warningData.thresholds.forEach(({ punishment, threshold, duration }) => {
							const generalisedPunishment = punishment.replace(
								StringUtils.Regexes.AllActionModifiers,
								""
							);

							let content = `${inlineCode(threshold.toString())} ${bold(`[${generalisedPunishment}]`)}`;

							if (duration) {
								content += ` ${prettyMilliseconds(duration, { secondsDecimalDigits: 0, millisecondsDecimalDigits: 0 }).replaceAll(" ", "")}`;
							}

							descriptionArray.push(content);
						});
					}

					break;

				case "suggestion":
				case "ticket":
					{
						const componentConfiguration =
							data as PrismaJson.Configuration[Enums.ContentClusterComponentType];

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

			pageTextArray.push(pageText);

			configurationValues.push(titleCaseName);

			embed.setDescription(descriptionArray.join(StringUtils.LineBreak));

			paginationPages.push({ embeds: EmbedManager.formatEmbeds([embed]), components: actionRows });
		}

		displayEmbed.addFields({
			name: configurationName,
			value: orderedList(configurationValues)
		});

		paginationPages.unshift({ embeds: [displayEmbed] });

		const pagination = new Pagination(interaction, paginationPages, {
			time: CommandUtils.CollectionTime,
			type: PaginationType.SelectMenu,
			pageText: pageTextArray,
			placeholder: "View a configuration",
			enableExit: true,
			showStartEnd: false,
			filter: (v) => v.user.id === interaction.user.id,
			onTimeout: () => interaction.deleteReply().catch(() => {})
		});

		await pagination.send();
	}

	@Slash({ description: "Interactive configuration panel" })
	public async panel(interaction: ChatInputCommandInteraction<"cached">) {}
}
