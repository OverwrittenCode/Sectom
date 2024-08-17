import { EnumChoice } from "@discordx/utilities";
import { EventType } from "@prisma/client";
import { type ApplicationCommandOptionChoiceData, ApplicationCommandOptionType } from "discord.js";
import { type ParameterDecoratorEx, SlashChoice, type SlashOptionAutoCompleteOptions } from "discordx";

import { MAX_AUTOCOMPLETE_OPTION_LIMIT } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import type { Typings } from "~/ts/Typings.js";

import type { ActionType } from "@prisma/client";

type AutoCompleteSlashOptionOptions = SlashOptionAutoCompleteOptions<Lowercase<string>, string>;

type AutocompleteValue = NonNullable<Typings.SlashOptionTransformerValueParam<AutoCompleteSlashOptionOptions>>;

interface ActionChoiceSlashOptionOptions extends Partial<Pick<AutoCompleteSlashOptionOptions, "description" | "name">> {
	eventType: EventType;
	grouped?: boolean;
	required?: boolean;
}

export function ActionSlashChoiceOption(options: ActionChoiceSlashOptionOptions): ParameterDecoratorEx {
	const {
		eventType,
		required,
		grouped = true,
		description = `The ${eventType} log type group`,
		name = `${eventType.toLowerCase()}_log_type` as Lowercase<string>
	} = options;

	const glossary = choiceConfigs[eventType].types.reduce(
		(acc, type) => {
			let formattedKey: string = type;

			if (grouped) {
				formattedKey = type.replace(choiceConfigs[eventType].regex, "");
			}

			formattedKey = StringUtils.concatenate(
				" ",
				...formattedKey.toLowerCase().split("_").map(StringUtils.capitaliseFirstLetter)
			);

			acc[formattedKey] = type;

			return acc;
		},
		{} as Record<string, ActionType>
	);

	return AutoCompleteSlashChoiceOption(
		{
			description,
			name,
			type: ApplicationCommandOptionType.String,
			required
		},
		glossary
	);
}

export function AutoCompleteSlashChoiceOption(
	options: AutoCompleteSlashOptionOptions,
	glossary: AutocompleteValue[] | Record<AutocompleteValue, AutocompleteValue>
): ParameterDecoratorEx {
	const cleanRegex = /[\s_\-\.,]/g;

	const list = Array.isArray(glossary) ? glossary : Object.keys(glossary);

	let choiceData: ApplicationCommandOptionChoiceData[];

	if (Array.isArray(glossary)) {
		choiceData = list.map((value) => ({
			name: value.toString(),
			value
		}));
	} else {
		choiceData = Object.entries(glossary).map(([name, value]) => ({
			name,
			value: value.toString()
		}));
	}

	if (choiceData.length <= MAX_AUTOCOMPLETE_OPTION_LIMIT) {
		const slashChoice = SlashChoice(
			...EnumChoice(
				choiceData.reduce(
					(acc, choice) => ({ ...acc, [choice.name]: choice.value.toString() }),
					{} as Record<string, string>
				)
			)
		);

		const slashOption = CommandUtils.constructSlashOption({
			options
		});

		return ObjectUtils.functionStack(slashChoice, slashOption);
	}

	const cleanString = (str: string): string => {
		return str.replace(cleanRegex, "").toLowerCase();
	};

	options.autocomplete ??= (interaction) => {
		const activeSearch = interaction.options.getFocused();

		const filteredChoices = choiceData.filter((choice) =>
			cleanString(choice.name).includes(cleanString(activeSearch))
		);

		const choiceArr = filteredChoices.length ? filteredChoices : choiceData;

		interaction.respond(choiceArr.slice(0, MAX_AUTOCOMPLETE_OPTION_LIMIT));
	};

	return CommandUtils.constructSlashOption({
		options,
		transformer(value) {
			if (typeof value !== "undefined" && list.findIndex((v) => v === value) === -1) {
				throw new ValidationError("Unsupported input, you must choose an option from the list provided");
			}

			return value;
		}
	});
}

const choiceConfigs = {
	[EventType.BOT]: {
		types: ActionManager._createBasedTypes,
		regex: StringUtils.regexes.createBasedActionModifiers
	},
	[EventType.DISCORD]: {
		types: ActionManager.eventBasedLogTypes[EventType.DISCORD],
		regex: StringUtils.regexes.discordBasedActionLog
	}
};
