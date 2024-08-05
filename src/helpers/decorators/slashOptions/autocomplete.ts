import { MAX_AUTOCOMPLETE_OPTION_LIMIT } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import type { Typings } from "~/ts/Typings.js";

import type { ApplicationCommandOptionChoiceData } from "discord.js";
import type { ParameterDecoratorEx, SlashOptionAutoCompleteOptions } from "discordx";

type SlashOptionOptions = SlashOptionAutoCompleteOptions<Lowercase<string>, string>;

type AutocompleteValue = NonNullable<Typings.SlashOptionTransformerValueParam<SlashOptionOptions>>;

export function AutoCompleteSlashOption(
	options: SlashOptionOptions,
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
