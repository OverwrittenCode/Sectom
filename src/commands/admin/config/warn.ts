import { EnumChoice } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, inlineCode } from "discord.js";
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import _ from "lodash";

import { Warn } from "~/commands/moderation/warn.js";
import { MAX_ELEMENTS_PER_PAGE } from "~/constants.js";
import { DurationSlashOption } from "~/helpers/decorators/slashOptions/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";

import type { ChatInputCommandInteraction } from "discord.js";
import type { SetRequired } from "type-fest";

type ThresholdPunishmentType = (typeof ThresholdPunishmentOption)[keyof typeof ThresholdPunishmentOption];

const ThresholdPunishmentOption = {
	disable: "disable",
	timeout: ActionType.TIME_OUT_USER_ADD,
	kick: ActionType.KICK_USER_SET,
	ban: ActionType.BAN_USER_ADD
} as const;

@Discord()
@SlashGroup({
	description: "Warning configuration",
	name: "warn",
	root: "config"
})
@SlashGroup("warn", "config")
export abstract class WarnConfig {
	@Slash({
		description:
			"Configures the duration multilpier for repeated automated offences. I.e. for 2 => 3m, 6m, 12m, 24m"
	})
	public async durationmultiplier(
		@SlashOption({
			description: "The duration multiplier",
			name: "duration_multiplier",
			type: ApplicationCommandOptionType.Number,
			minValue: 1,
			maxValue: 10
		})
		multiplier: number | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const where = {
			id: guildId
		};

		const guildDoc = await DBConnectionManager.Prisma.guild.instanceMethods.retrieveGuild(guildId, {
			configuration: true
		});

		const mutualLogFields = {
			interaction,
			target: {
				id: interaction.channelId,
				type: EntityType.CHANNEL
			},
			reason
		};

		if (!multiplier) {
			if (!guildDoc.configuration?.warning) {
				throw new ValidationError("duration multiplier has not been setup yet");
			}

			guildDoc.configuration.warning.durationMultiplier = 1;

			return await ActionManager.logCase({
				...mutualLogFields,
				actionType: ActionType.CONFIG_WARN_DURATION_MULTIPLIER_RESET,
				actionOptions: {
					pendingExecution: async () =>
						await DBConnectionManager.Prisma.guild.update({
							where,
							data: {
								configuration: guildDoc.configuration!
							}
						})
				},
				successContent: `reset the duration multiplier to ${inlineCode("1")}`
			});
		}

		const newAppendedConfiguration: PrismaJson.Configuration = guildDoc.configuration
			? ObjectUtils.cloneObject(guildDoc.configuration)
			: DBConnectionManager.Defaults.Configuration;

		if (newAppendedConfiguration.warning.durationMultiplier === multiplier) {
			throw new ValidationError("a record with the given option already exists");
		}

		newAppendedConfiguration.warning.durationMultiplier = multiplier;

		return await ActionManager.logCase({
			...mutualLogFields,
			actionType: ActionType.CONFIG_WARN_DURATION_MULTIPLIER_SET,
			actionOptions: {
				pendingExecution: async () =>
					await DBConnectionManager.Prisma.guild.update({
						where,
						data: {
							configuration: newAppendedConfiguration
						}
					})
			},
			successContent: `set the duration multiplier to ${inlineCode(multiplier.toString())}`
		});
	}

	@Slash({ description: "Configures the auto punishment at a given warning threshold" })
	public async threshold(
		@SlashOption({
			description: "The number of warnings to trigger a punishment",
			name: "threshold",
			type: ApplicationCommandOptionType.Integer,
			minValue: Warn.MinThreshold,
			maxValue: 20,
			required: true
		})
		threshold: number,
		@SlashChoice(...EnumChoice(ThresholdPunishmentOption))
		@SlashOption({
			description: "The punishment on reaching the threshold",
			name: "punishment",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		punishment: ThresholdPunishmentType,
		@DurationSlashOption({
			transformerOptions: {
				allowDisableOption: "punishment",
				actionTypeData: {
					[ThresholdPunishmentOption.timeout]: {
						allowDisableOption: true,
						...CommandUtils.DurationLimits.Timeout
					},
					[ThresholdPunishmentOption.ban]: {
						allowDisableOption: true,
						...CommandUtils.DurationLimits.Ban
					},
					[ThresholdPunishmentOption.kick]: { forceDisableOption: true }
				}
			},
			name: "base_duration",
			descriptionPrefix: "The base duration of the punishment"
		})
		msDuration: number | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId, channelId } = interaction;

		const where = {
			id: guildId
		};

		const guildDoc = await DBConnectionManager.Prisma.guild.instanceMethods.retrieveGuild(guildId, {
			configuration: true
		});

		const mutualLogFields = {
			interaction,
			target: {
				id: channelId,
				type: EntityType.CHANNEL
			},
			reason
		};

		if (!punishment || punishment === "disable") {
			if (
				!guildDoc.configuration?.warning ||
				!guildDoc.configuration.warning.thresholds.find((t) => t.threshold === threshold)
			) {
				throw new ValidationError("a record with the given threshold does not exist");
			}

			const newOmittedConfiguration = ObjectUtils.cloneObject(
				guildDoc.configuration as SetRequired<PrismaJson.Configuration, "warning">
			);

			newOmittedConfiguration.warning.thresholds = newOmittedConfiguration.warning.thresholds.filter(
				(t) => t.threshold !== threshold
			);

			return await ActionManager.logCase({
				...mutualLogFields,
				actionType: ActionType.CONFIG_WARN_THRESHOLD_REMOVE,
				actionOptions: {
					pendingExecution: async () =>
						await DBConnectionManager.Prisma.guild.update({
							where,
							data: {
								configuration: newOmittedConfiguration
							}
						})
				},
				successContent: `disabled the threshold for ${inlineCode(threshold.toString())} warnings`
			});
		}

		const currentThresholds = guildDoc.configuration.warning.thresholds;

		if (currentThresholds && currentThresholds.length >= MAX_ELEMENTS_PER_PAGE) {
			throw new ValidationError(`max number of warning thresholds reached (${MAX_ELEMENTS_PER_PAGE})`);
		}

		const currentThreshold = currentThresholds.find((t) => t.threshold === threshold);

		const rawThreshold = { threshold, punishment };

		const isUpdatingPunishmentType = currentThreshold && currentThreshold?.punishment !== punishment;

		const newMsDuration = isUpdatingPunishmentType && !msDuration ? currentThreshold.duration : msDuration;
		const newThreshold = newMsDuration ? { ...rawThreshold, duration: newMsDuration } : rawThreshold;

		const isDuplicateThreshold =
			!!currentThresholds.length && currentThresholds.some((t) => _.isEqual(t, newThreshold));

		if (isDuplicateThreshold) {
			throw new ValidationError(ValidationError.MessageTemplates.AlreadyMatched);
		}

		const isWithoutTimeoutDuration =
			(isUpdatingPunishmentType ? punishment : currentThreshold?.punishment) === ActionType.TIME_OUT_USER_ADD &&
			!msDuration;

		if (isWithoutTimeoutDuration) {
			throw new ValidationError("You must provide provide a duration for a timeout punishment");
		}

		const newAppendedConfiguration = ObjectUtils.cloneObject(guildDoc.configuration);

		const updateIndex = currentThresholds.findIndex((t) => t.threshold === threshold);

		const isUpdated = updateIndex !== -1;

		if (updateIndex !== -1) {
			newAppendedConfiguration.warning.thresholds[updateIndex] = newThreshold;
		} else {
			newAppendedConfiguration.warning.thresholds.push(newThreshold);
		}

		const actionType = isUpdated ? ActionType.CONFIG_WARN_THRESHOLD_UPDATE : ActionType.CONFIG_WARN_THRESHOLD_ADD;

		const pastTenseAction = isUpdated ? "updated the" : "added a";

		return await ActionManager.logCase({
			...mutualLogFields,
			actionType,
			actionOptions: {
				pendingExecution: async () =>
					await DBConnectionManager.Prisma.guild.update({
						where,
						data: {
							configuration: newAppendedConfiguration
						},
						select: {
							id: true
						}
					})
			},
			successContent: `${pastTenseAction} threshold for ${inlineCode(threshold.toString())} warnings`
		});
	}
}
