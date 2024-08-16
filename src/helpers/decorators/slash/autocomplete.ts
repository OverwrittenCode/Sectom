import { EnumChoice } from "@discordx/utilities";
import { type ParameterDecoratorEx, SlashChoice, type SlashOptionAutoCompleteOptions } from "discordx";
import { MAX_AUTOCOMPLETE_OPTION_LIMIT } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
type AutoCompleteSlashOptionOptions = SlashOptionAutoCompleteOptions<Lowercase<string>, string>;

type AutocompleteValue = NonNullable<Typings.SlashOptionTransformerValueParam<AutoCompleteSlashOptionOptions>>;
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

