import { ApplicationCommandOptionType } from "discord.js";
import { SlashOption } from "discordx";

import { MAX_AUTOCOMPLETE_OPTION_LIMIT } from "~/constants.js";
import type { DurationMSValidateOptions } from "~/helpers/transformers/Duration.js";
import { DurationGenerateAutoComplete, DurationTransformer } from "~/helpers/transformers/Duration.js";
import { CommandUtils } from "~/utils/command.js";

import type { AutocompleteInteraction } from "discord.js";

interface DurationOptions {
	transformerOptions: DurationMSValidateOptions;
	name?: Lowercase<string>;
	descriptionPrefix?: string;
	required?: boolean;
}

export function DurationSlashOption(options: DurationOptions) {
	const { transformerOptions } = options;
	let { name, descriptionPrefix, required } = options;

	name ??= "duration";
	descriptionPrefix ??= "The duration";
	required ??= !transformerOptions?.allowDisableOption;

	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		SlashOption({
			description: `${descriptionPrefix}. Ex: (30m, 1h, 1 day)`,
			name,
			type: ApplicationCommandOptionType.String,
			required,
			transformer: DurationTransformer(transformerOptions),
			autocomplete: (interaction: AutocompleteInteraction) => {
				const autoCompleteData = DurationGenerateAutoComplete(interaction, transformerOptions);

				const isOnlyDisabled =
					autoCompleteData.length === 1 &&
					autoCompleteData[0].value === CommandUtils.SlashOptions.DisableChoice;

				const activeSearch = interaction.options.getFocused();
				const isZero = activeSearch.startsWith("0");

				if (isOnlyDisabled || isZero) {
					interaction.respond(
						autoCompleteData.filter(({ value }) => value === CommandUtils.SlashOptions.DisableChoice)
					);
				} else {
					const wildcardMatch = autoCompleteData.filter(({ name }) =>
						name.includes(activeSearch.toLowerCase())
					);

					const responder = wildcardMatch.length ? wildcardMatch : autoCompleteData;

					interaction.respond(responder.slice(0, MAX_AUTOCOMPLETE_OPTION_LIMIT));
				}
			}
		})(target, propertyKey, parameterIndex);
	};
}
