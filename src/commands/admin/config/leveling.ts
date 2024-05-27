import { ActionType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, bold, inlineCode, roleMention } from "discord.js";
import { Discord, SelectMenuComponent, Slash, SlashGroup, SlashOption } from "discordx";
import prettyMilliseconds from "pretty-ms";

import { Config } from "~/commands/admin/config/root.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import type { Typings } from "~/ts/Typings.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { ChatInputCommandInteraction, Role, StringSelectMenuInteraction } from "discord.js";

@Discord()
@SlashGroup({
	description: "Leveling Configuration",
	name: "leveling",
	root: "config"
})
@SlashGroup("leveling", "config")
export abstract class LevelingConfig {
	@Slash({ description: "Enables/disables this configuration " })
	public toggle(
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Config.togglestate("leveling", reason, interaction);
	}

	@Slash({ description: "Configures the cooldown for gaining xp" })
	public async cooldown(
		@SlashOption({
			description: "The cooldown in seconds. Default is 3 seconds",
			name: "cooldown",
			type: ApplicationCommandOptionType.Integer,
			minValue: 3,
			maxValue: 60
		})
		cooldown: number = 3,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.SNOWFLAKE,
			descriptionNote: "Applied globally if blank",
			name: "override_for",
			required: false
		})
		target: Typings.EntityObjectType | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.mutualPropertyHandler(cooldown * 1000, "cooldown", target, reason, interaction);
	}

	@Slash({ description: "Configures the xp multiplier" })
	public async multiplier(
		@SlashOption({
			description: "The multiplier",
			name: "multiplier",
			type: ApplicationCommandOptionType.Number,
			minValue: 0.1,
			maxValue: 10
		})
		multiplier: number = 1,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.SNOWFLAKE,
			descriptionNote: "Applied globally if blank",
			name: "override_for",
			required: false
		})
		target: Typings.EntityObjectType | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.mutualPropertyHandler(multiplier, "multiplier", target, reason, interaction);
	}

	@Slash({ description: "Configures the roles given on reaching a certain level" })
	public async autorole(
		@SlashOption({
			description: "The level that grants them the role",
			name: "level",
			type: ApplicationCommandOptionType.Number,
			minValue: 1,
			maxValue: 250,
			required: true
		})
		level: number,
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.ROLE,
			required: false,
			descriptionNote: "Leave blank to remove"
		})
		role: Role | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const {
			configuration: { leveling },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId, check: "leveling" });

		const index = leveling.roles.findIndex((r) => r.id === role?.id || r.level === level);
		const isValidIndex = index !== -1;
		let targetId: string;

		if (role) {
			if (isValidIndex) {
				throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
			}

			targetId = role.id;

			leveling.roles.push({
				id: role.id,
				level
			});
		} else {
			if (!isValidIndex) {
				throw new ValidationError(ValidationError.MessageTemplates.NotConfigured("given level's autorole"));
			}

			targetId = leveling.roles[index].id;

			leveling.roles.splice(index, 1);
		}

		const actionType = ActionType[`CONFIG_LEVEL_SETTINGS_${role ? "ADD" : "REMOVE"}`];

		return await ActionManager.logCase({
			interaction,
			target: {
				id: targetId,
				type: EntityType.ROLE
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: `${role ? "added" : "removed"} the level autorole configuration`,
				pendingExecution: save
			}
		});
	}

	@Slash({ description: "Toggles the stackXPMultipliers true/false" })
	public async stackxpmultipliers(
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId, channelId } = interaction;

		const {
			configuration: { leveling },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId, check: "leveling" });

		leveling.stackXPMultipliers = !leveling.stackXPMultipliers;

		return await ActionManager.logCase({
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			reason,
			actionType: ActionType.CONFIG_LEVEL_SETTINGS_UPDATE,
			actionOptions: {
				pastTense: "updated the leveling configuration",
				pendingExecution: save
			},
			successContent: `updated the leveling configuration ${StringUtils.LineBreak} -> toggle ${inlineCode("stackXPMultipliers")} to ${leveling.stackXPMultipliers}`
		});
	}

	private async mutualPropertyHandler(
		property: number,
		propertyType: "multiplier" | "cooldown",
		target: Typings.EntityObjectType | undefined,
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const {
			configuration: { leveling },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId, check: "leveling" });

		const indexOrData = target ? leveling.overrides.findIndex(({ id }) => id === target.id) : leveling;

		const isIndexBased = typeof indexOrData === "number";

		const currentMultiplier = (isIndexBased ? leveling.overrides[indexOrData] : leveling)?.[propertyType];

		const isEqual = property === currentMultiplier;

		if (isEqual) {
			throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
		}

		let actionTypeSuffix: "UPDATE" | "ADD" = "UPDATE";

		const configName = target ? "given target's " : "" + propertyType;

		if (target) {
			if (isIndexBased && indexOrData !== -1) {
				leveling.overrides[indexOrData][propertyType] = property;
			} else {
				actionTypeSuffix = "ADD";

				leveling.overrides.push({
					id: target.id,
					mention: target.toString(),
					[propertyType]: property
				});
			}
		} else {
			leveling[propertyType] = property;
		}

		const actionType = ActionType[`CONFIG_LEVEL_SETTINGS_${actionTypeSuffix}`];

		return await ActionManager.logCase({
			interaction,
			target: {
				id: target?.id ?? guildId,
				type: target
					? target.toString().startsWith("<@&")
						? EntityType.ROLE
						: target.toString().startsWith("<@")
							? EntityType.USER
							: EntityType.CHANNEL
					: EntityType.ROLE
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: `${currentMultiplier ? "updated" : "set"} the ${configName} configuration`,
				pendingExecution: save
			}
		});
	}
}

@Discord()
export abstract class LevelingConfigMessageComponentHandler {
	@SelectMenuComponent({ id: Config.LevelingCustomIDRecords.leveling_view.regex })
	public async selectMenuView(interaction: StringSelectMenuInteraction<"cached">) {
		const { values, guild, guildId } = interaction;

		const {
			configuration: { leveling }
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId, check: "leveling" });

		const option = values[0] as keyof Typings.PickMatching<PrismaJson.LevelingConfiguration, any[]>;

		const descriptionArray: string[] = [];

		switch (option) {
			case "overrides":
				{
					leveling[option].map((data) => {
						const { id, ...iterableData } = data;

						const elements: string[] = [];

						const entries = ObjectUtils.entries(iterableData, {
							excludeUndefined: true,
							sortByTypeof: true
						});

						for (const [key, value] of entries) {
							const titleCaseLabel = StringUtils.convertToTitleCase(key);
							const valueLabel =
								key === "cooldown" && typeof value === "number"
									? prettyMilliseconds(value, { verbose: true })
									: value;

							elements.push(`${bold(titleCaseLabel)}: ${valueLabel}`);
						}

						descriptionArray.push(elements.join(StringUtils.LineBreak));
					});
				}
				break;
			case "roles":
				{
					descriptionArray.push(
						...leveling[option].map(
							({ id, level }) => `Level ${bold(level.toString())}: ${roleMention(id)}`
						)
					);
				}
				break;
			default:
				throw new Error("Unexpected option", option);
		}

		const embedTitle = `${guild.name} | Leveling | ${StringUtils.convertToTitleCase(option)}`;

		return EmbedManager.handleStaticEmbedPagination({ sendTo: interaction, embedTitle, descriptionArray });
	}
}
