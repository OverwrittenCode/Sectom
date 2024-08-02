import { Category, EnumChoice } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, inlineCode } from "discord.js";
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import _ from "lodash";

import { Config } from "~/commands/admin/config/root.js";
import { Warn } from "~/commands/moderation/warn.js";
import { MAX_ELEMENTS_PER_PAGE } from "~/constants.js";
import { DurationSlashOption } from "~/helpers/decorators/slashOptions/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction } from "discord.js";

type ThresholdPunishmentType =
	(typeof WarnConfig.thresholdPunishmentChoices)[keyof typeof WarnConfig.thresholdPunishmentChoices];

@Discord()
@Category(Enums.CommandCategory.Admin)
@SlashGroup({ description: "Warning configuration", name: "warn", root: "config" })
@SlashGroup("warn", "config")
export abstract class WarnConfig {
	public static readonly thresholdPunishmentChoices = {
		disable: "disable",
		timeout: ActionType.TIME_OUT_USER_ADD,
		kick: ActionType.KICK_USER_SET,
		ban: ActionType.BAN_USER_ADD
	} as const;

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
		reason: string = InteractionUtils.messages.noReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;

		const {
			configuration: { warning },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "warning"
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
			warning.durationMultiplier = 1;

			return await ActionManager.logCase({
				...mutualLogFields,
				actionType: ActionType.CONFIG_WARN_DURATION_MULTIPLIER_RESET,
				actionOptions: {
					pendingExecution: save
				},
				successContent: `reset the duration multiplier to ${inlineCode("1")}`
			});
		}

		if (warning.durationMultiplier === multiplier) {
			throw new ValidationError("a record with the given option already exists");
		}

		warning.durationMultiplier = multiplier;

		return await ActionManager.logCase({
			...mutualLogFields,
			actionType: ActionType.CONFIG_WARN_DURATION_MULTIPLIER_SET,
			actionOptions: {
				pendingExecution: save
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
			minValue: Warn.minThreshold,
			maxValue: 20,
			required: true
		})
		threshold: number,
		@SlashChoice(...EnumChoice(WarnConfig.thresholdPunishmentChoices))
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
					[WarnConfig.thresholdPunishmentChoices.timeout]: {
						allowDisableOption: true,
						...CommandUtils.durationLimits.Timeout
					},
					[WarnConfig.thresholdPunishmentChoices.ban]: { forceDisableOption: true },
					[WarnConfig.thresholdPunishmentChoices.kick]: { forceDisableOption: true }
				}
			},
			name: "base_duration",
			descriptionPrefix: "The base duration of the punishment"
		})
		msDuration: number | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.messages.noReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId, channelId } = interaction;

		const {
			configuration: { warning },
			save
		} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
			guildId,
			check: "warning"
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
			if (!warning.thresholds.find((t) => t.threshold === threshold)) {
				throw new ValidationError("a record with the given threshold does not exist");
			}

			warning.thresholds = warning.thresholds.filter((t) => t.threshold !== threshold);

			return await ActionManager.logCase({
				...mutualLogFields,
				actionType: ActionType.CONFIG_WARN_THRESHOLD_REMOVE,
				actionOptions: {
					pendingExecution: save
				},
				successContent: `disabled the threshold for ${inlineCode(threshold.toString())} warnings`
			});
		}

		const currentThresholds = warning.thresholds;

		if (currentThresholds.length >= MAX_ELEMENTS_PER_PAGE) {
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
			throw new ValidationError(ValidationError.messageTemplates.AlreadyMatched);
		}

		const isWithoutTimeoutDuration =
			(isUpdatingPunishmentType ? punishment : currentThreshold?.punishment) === ActionType.TIME_OUT_USER_ADD &&
			!msDuration;

		if (isWithoutTimeoutDuration) {
			throw new ValidationError("you must provide provide a duration for a timeout punishment");
		}

		const updateIndex = currentThresholds.findIndex((t) => t.threshold === threshold);

		const isUpdated = updateIndex !== -1;

		if (isUpdated) {
			warning.thresholds[updateIndex] = newThreshold;
		} else {
			warning.thresholds.push(newThreshold);
		}

		const actionType = ActionType[`CONFIG_WARN_THRESHOLD_${isUpdated ? "UPDATE" : "ADD"}`];
		const pastTenseAction = isUpdated ? "updated the" : "added a";

		return await ActionManager.logCase({
			...mutualLogFields,
			actionType,
			actionOptions: {
				pendingExecution: save
			},
			successContent: `${pastTenseAction} threshold for ${inlineCode(threshold.toString())} warnings`
		});
	}

	@Slash({ description: "Enables/disables this configuration " })
	public toggle(
		@ReasonSlashOption()
		reason: string = InteractionUtils.messages.noReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Config.togglestate("warning", reason, interaction);
	}
}
