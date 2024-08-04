import { SlashOption } from "discordx";

import { MAX_AUTOCOMPLETE_OPTION_LIMIT } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";

import type {
	ApplicationCommandOptionChoiceData,
	AutocompleteInteraction,
	ChatInputCommandInteraction
} from "discord.js";
import type { ParameterDecoratorEx, SlashOptionOptions, TransformerFunction } from "discordx";

type AutocompleteValue = ApplicationCommandOptionChoiceData["value"];

export function AutoCompleteSlashOption(
	slashOptions: SlashOptionOptions<Lowercase<string>, string>,
	glossary: AutocompleteValue[] | Record<AutocompleteValue, AutocompleteValue>
): ParameterDecoratorEx {
	const cleanRegex = /[\s_\-\.,]/g;

	const list = Array.isArray(glossary) ? glossary : Object.keys(glossary);

	const choiceData: ApplicationCommandOptionChoiceData[] = list.map((value) => ({
		name: value.toString(),
		value
	}));

	const cleanString = (str: string): string => {
		return str.replace(cleanRegex, "").toLowerCase();
	};

	const transformer: TransformerFunction = (
		v: AutocompleteValue | undefined,
		_interaction: ChatInputCommandInteraction
	) => {
		if (typeof v !== "undefined" && list.findIndex((value) => value === v) === -1) {
			throw new ValidationError("Unsupported input, you must choose an option from the list provided");
		}

		return v;
	};

	slashOptions.autocomplete ??= (interaction: AutocompleteInteraction) => {
		const activeSearch = interaction.options.getFocused();

		const filteredChoices = choiceData.filter((choice) =>
			cleanString(choice.name).includes(cleanString(activeSearch))
		);

		const choiceArr = filteredChoices.length ? filteredChoices : choiceData;

		interaction.respond(choiceArr.slice(0, MAX_AUTOCOMPLETE_OPTION_LIMIT));
	};

	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		SlashOption(slashOptions, transformer)(target, propertyKey, parameterIndex);
	};
}
