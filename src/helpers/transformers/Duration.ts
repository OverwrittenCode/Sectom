import assert from "assert";

import { type ApplicationCommandOptionChoiceData, type ChatInputCommandInteraction } from "discord.js";
import ms from "ms";
import prettyMilliseconds from "pretty-ms";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/utils/command.js";
import { NumberUtils } from "~/utils/number.js";
import { StringUtils } from "~/utils/string.js";

import type { ActionType } from "@prisma/client";
import type { AutocompleteInteraction } from "discord.js";

export type DurationMSValidateOptions = ConstantMSValidateOptions | ConditionalMSValidateOptions;

type DurationRangeMSActionTypeData = {
	[K in ActionType]?: DurationRangeOptions & ({ allowDisableOption?: boolean } | { forceDisableOption?: boolean });
};

interface ConditionalMSValidateOptions {
	actionTypeData: DurationRangeMSActionTypeData;
	allowDisableOption: string;
}

interface ConstantMSValidateOptions extends DurationRangeOptions {
	allowDisableOption?: string | boolean;
}

interface DurationRangeOptions {
	max?: string;
	min?: string;
}

interface DurationRangeValue {
	max: number;
	min: number;
}

enum IncrementTimeUnits {
	minutes = "m",
	hours = "h",
	days = "d",
	weeks = "w",
	months = "mo",
	years = "y"
}

export function DurationGenerateAutoComplete(
	interaction: ChatInputCommandInteraction | AutocompleteInteraction,
	options: DurationMSValidateOptions
): ApplicationCommandOptionChoiceData[] {
	const rangeValue = DurationGetRangeValue(interaction, options);

	if (!rangeValue) {
		return [disabledAutoCompleteOption];
	}

	const { min, max } = rangeValue;

	let autoCompleteDataArray: ApplicationCommandOptionChoiceData<string>[] = [];

	if (max < unitToIncrementByMap[IncrementTimeUnits.minutes]) {
		autoCompleteDataArray = Array.from({ length: max / 1000 }, (_, i) => {
			const v = ms(`${i}s`);

			return {
				name: prettyMilliseconds(v, { verbose: true }),
				value: v.toString()
			};
		});
	} else {
		autoCompleteDataArray = units.flatMap((unit) =>
			NumberUtils.chunkByModulus(unitToQuantityMap[unit], unitToIncrementByMap[unit], false).map((msNum, i) => {
				const v = msNum * (i + 1);

				return {
					name: prettyMilliseconds(v, { verbose: true }),
					value: v.toString()
				};
			})
		);
	}

	if (min === 0) {
		autoCompleteDataArray.unshift({ name: "0 seconds", value: "0" });
	}

	if (!autoCompleteDataArray.find(({ value }) => value === min.toString())) {
		autoCompleteDataArray.unshift({ name: `${min / 1000} seconds`, value: min.toString() });
	}

	if (!autoCompleteDataArray.find(({ value }) => value === max.toString())) {
		autoCompleteDataArray.push({ name: prettyMilliseconds(max, { verbose: true }), value: max.toString() });
	}

	if (options.allowDisableOption) {
		autoCompleteDataArray.unshift(disabledAutoCompleteOption);
	}

	const seen = new Set();
	const uniqueAutoCompleteData = autoCompleteDataArray.filter(({ value }) => {
		const isDuplicate = seen.has(value);

		seen.add(value);

		const msDuration = parseInt(value);

		const isInRange = isNaN(msDuration) || (min <= msDuration && max >= msDuration);

		return !isDuplicate && isInRange;
	});

	return uniqueAutoCompleteData;
}

function DurationGetRangeValue(
	interaction: ChatInputCommandInteraction | AutocompleteInteraction,
	options: DurationMSValidateOptions
): DurationRangeValue | null {
	const actionType = StringUtils.isValidString(options.allowDisableOption)
		? interaction.options.getString(options.allowDisableOption, false)
		: null;

	let rangeOptions: DurationRangeOptions;

	if ("actionTypeData" in options) {
		const data =
			actionType && actionType in options.actionTypeData
				? options.actionTypeData[actionType as ActionType]
				: null;

		if (!data || ("forceDisableOption" in data && data.forceDisableOption)) {
			return null;
		}

		const { min, max } = data;

		rangeOptions = { min, max };
	} else {
		const { min, max } = options;

		rangeOptions = { min, max };
	}

	const min = ms(rangeOptions.min ?? defaultMinDuration);
	const max = ms(rangeOptions.max ?? defaultMaxDuration);

	return { min, max };
}

export function DurationTransformer(options: DurationMSValidateOptions) {
	return function (msDurationStr: string | undefined, interaction: ChatInputCommandInteraction): number | undefined {
		assert(interaction.inCachedGuild());

		const rangeValue = DurationGetRangeValue(interaction, options);

		const isDisabled =
			typeof msDurationStr === "undefined" ||
			(options.allowDisableOption && msDurationStr === CommandUtils.slashOptions.DisableChoice);

		if (!rangeValue || isDisabled) {
			return;
		}

		const msDuration = ms(msDurationStr);

		const isInvalidDuration = isNaN(msDuration);

		if (isInvalidDuration) {
			throw new ValidationError("invalid duration provided, please check your input");
		}

		const { min, max } = rangeValue;

		let isInvalidRange = msDuration < min;

		if (max) {
			isInvalidRange ||= msDuration > max;
		}

		if (isInvalidRange) {
			const minVerbose = min === 0 ? "0 seconds" : prettyMilliseconds(min, { verbose: true });
			const maxVerbose = max ? prettyMilliseconds(max, { verbose: true }) : undefined;

			const disallowedRange = `less than ${minVerbose}${maxVerbose ? ` or more than ${maxVerbose}` : ""}`;

			throw new ValidationError(`duration cannot be ${disallowedRange}`);
		}

		return msDuration;
	};
}

const units = Object.values(IncrementTimeUnits);
const defaultMinDuration = "0s";
const defaultMaxDuration = "90d";
const unitToIncrementByMap = {
	[IncrementTimeUnits.minutes]: ms("15s"),
	[IncrementTimeUnits.hours]: ms("15m"),
	[IncrementTimeUnits.days]: ms("6h"),
	[IncrementTimeUnits.weeks]: ms("1d"),
	[IncrementTimeUnits.months]: ms("7d"),
	[IncrementTimeUnits.years]: ms("30d")
} as const;
const unitToQuantityMap = {
	[IncrementTimeUnits.minutes]: ms("1m"),
	[IncrementTimeUnits.hours]: ms("1h"),
	[IncrementTimeUnits.days]: ms("1d"),
	[IncrementTimeUnits.weeks]: ms("7d"),
	[IncrementTimeUnits.months]: ms("30d"),
	[IncrementTimeUnits.years]: ms("1y")
} as const;
const disabledAutoCompleteOption = {
	name: CommandUtils.slashOptions.DisableChoice,
	value: CommandUtils.slashOptions.DisableChoice
};
