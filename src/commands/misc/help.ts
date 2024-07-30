import { PaginationType } from "@discordx/pagination";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	bold,
	unorderedList
} from "discord.js";
import { Discord, Guard, SelectMenuComponent, Slash } from "discordx";

import { LIGHT_GOLD } from "~/constants.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { PaginationManager } from "~/models/framework/managers/PaginationManager.js";
import { Enums } from "~/ts/Enums.js";

import type { PaginationItem } from "@discordx/pagination";
import type { StringSelectMenuInteraction } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Misc)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Help {
	public static customIdRecords = InteractionUtils.customIdPrefixRecords("help_command_view");

	@Slash({ dmPermission: false, description: "Get help on commands and categories" })
	public async help(interaction: ChatInputCommandInteraction<"cached">) {
		const pageTextArray: string[] = ["Home"];
		const embedTitle = `${interaction.guild.name} | Help Menu`;

		const customIdGenerator = InteractionUtils.constructCustomIdGenerator({
			baseID: Help.customIdRecords.help_command_view.id,
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
									StringUtils.lineBreak,
								unorderedList(
									CommandUtils.categoryGroupedData.keys.map((categoryName) => {
										pageTextArray.push(`${categoryName} Commands`);

										return bold(categoryName);
									})
								)
							].join(StringUtils.lineBreak)
						)
				]
			}
		].concat(
			CommandUtils.categoryGroupedData.values.map((data, i) => {
				const boldNames: string[] = [];
				const selectMenuOptions: StringSelectMenuOptionBuilder[] = [];

				const categoryName = CommandUtils.categoryGroupedData.keys[i];

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
					.setDescription(boldNames.join(StringUtils.lineBreak));

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
			showStartEnd: false,
			ephemeral: true
		});

		return await pagination.init();
	}
}

@Discord()
export abstract class HelpMessageComponentHandler {
	@SelectMenuComponent({ id: Help.customIdRecords.help_command_view.regex })
	public async selectMenuCommandView(interaction: StringSelectMenuInteraction<"cached">) {
		const { customId, values } = interaction;

		const categoryName = customId.split(StringUtils.customIDFIeldBodySeperator).at(-1)! as Enums.CommandCategory;
		const commandName = values[0];

		const { options, ...data } = CommandUtils.categoryGroupedData.obj[categoryName].find(
			({ name }) => name === commandName
		)!;

		const description = ObjectUtils.entries(data)
			.map(([key, value]) => `${bold(StringUtils.capitaliseFirstLetter(key))}: ${value}`)
			.join(StringUtils.lineBreak);

		const embed = new EmbedBuilder()
			.setTitle(`${interaction.guild.name} | Command Info`)
			.setColor(LIGHT_GOLD)
			.setDescription(description);

		return await InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed],
			ephemeral: true
		});
	}
}
