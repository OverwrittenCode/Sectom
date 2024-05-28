import { PaginationType } from "@discordx/pagination";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	bold
} from "discord.js";
import { Discord, Guard, SelectMenuComponent, Slash } from "discordx";

import { LIGHT_GOLD } from "~/constants.js";
import { PaginationManager } from "~/models/framework/managers/PaginationManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { PaginationItem } from "@discordx/pagination";
import type { StringSelectMenuInteraction } from "discord.js";
import type { DApplicationCommandOption } from "discordx";

@Discord()
@Category(Enums.CommandCategory.Misc)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Help {
	public static CustomIdRecords = InteractionUtils.customIdPrefixRecords("help_command_view");

	@Slash({ dmPermission: false, description: "Get help on commands and categories" })
	public async help(interaction: ChatInputCommandInteraction<"cached">) {
		const pageTextArray: string[] = ["Home"];
		const embedTitle = `${interaction.guild.name} | Help Menu`;

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
			baseID: Help.CustomIdRecords.help_command_view.id,
			messageComponentType: Enums.MessageComponentType.SelectMenu
		});

		const paginationPages: Array<Pick<PaginationItem, "embeds" | "components">> = [
			{
				embeds: [
					new EmbedBuilder()
						.setTitle(embedTitle)
						.setColor(LIGHT_GOLD)
						.setDescription(
							[
								"Here you can select a category of commands to view by selecting a category below:" +
									StringUtils.LineBreak,
								...CommandUtils.CategoryGroupedData.keys.map((categoryName, i) => {
									pageTextArray.push(`${categoryName} Commands`);

									let str = bold(categoryName);
									const quantity = CommandUtils.CategoryGroupedData.values[i].length;

									str += ` (${quantity}) command${quantity > 1 ? "s" : ""}`;
									return str;
								})
							].join(StringUtils.LineBreak)
						)
				]
			}
		].concat(
			CommandUtils.CategoryGroupedData.values.map((data, i) => {
				const boldNames: string[] = [];
				const selectMenuOptions: StringSelectMenuOptionBuilder[] = [];

				const categoryName = CommandUtils.CategoryGroupedData.keys[i];

				data.forEach(({ name, description }) => {
					boldNames.push(bold(`/${name}`));
					selectMenuOptions.push(
						new StringSelectMenuOptionBuilder()
							.setLabel(StringUtils.capitaliseFirstLetter(name))
							.setDescription(description)
							.setValue(name)
					);
				});

				const embed = new EmbedBuilder()
					.setTitle(`${embedTitle} | ${categoryName} Commands`)
					.setColor(LIGHT_GOLD)
					.setDescription(boldNames.join(StringUtils.LineBreak));

				const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder()
						.setCustomId(customIdGenerator(categoryName))
						.setPlaceholder("View a command")
						.addOptions(selectMenuOptions)
				);

				return {
					embeds: [embed],
					components: [actionRow]
				};
			})
		);

		const pagination = new PaginationManager(interaction, paginationPages, {
			type: PaginationType.SelectMenu,
			pageText: pageTextArray,
			placeholder: "View a category",
			ephemeral: true
		});

		return await pagination.init();
	}
}

@Discord()
export abstract class HelpMessageComponentHandler {
	@SelectMenuComponent({ id: Help.CustomIdRecords.help_command_view.regex })
	public async selectMenuCommandView(interaction: StringSelectMenuInteraction<"cached">) {
		const { customId, values } = interaction;

		const categoryName = customId.split(StringUtils.CustomIDFIeldBodySeperator).at(-1)! as Enums.CommandCategory;

		const commandName = values[0];

		const { options, ...data } = CommandUtils.CategoryGroupedData.obj[categoryName].find(
			({ name }) => name === commandName
		)!;

		let description = ObjectUtils.entries(data)
			.map(([key, value]) => `${bold(StringUtils.capitaliseFirstLetter(key))}: ${value}`)
			.join(StringUtils.LineBreak);

		const embed = new EmbedBuilder().setTitle(`${interaction.guild.name} | Command Info`).setColor(LIGHT_GOLD);

		if (options.length) {
			let commandStructure = `${bold("Structure")}:` + StringUtils.LineBreak;

			const countType = (options: DApplicationCommandOption[]): number => {
				return options.reduce((count, option) => {
					if (option.options.length === 0) {
						return count + 1;
					} else {
						return count + countType(option.options);
					}
				}, 0);
			};

			options.forEach(({ name }, index, arr) => {
				const isLast = index === arr.length - 1;
				const connector = isLast ? "└──" : "├──";
				commandStructure += ` ${connector} ${bold(name)}` + StringUtils.LineBreak;
			});

			description += StringUtils.LineBreak + commandStructure;
		}

		embed.setDescription(description);

		return await InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed],
			ephemeral: true
		});
	}
}
