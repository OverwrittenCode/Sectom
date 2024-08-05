import { ApplicationCommandOptionType } from "discord.js";

import { MAX_REASON_STRING_LENGTH } from "~/constants.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";

import type { ParameterDecoratorEx } from "discordx";

interface ReasonOptions {
	isAmmended?: boolean;
	required?: boolean;
}

export function ReasonSlashOption(options: ReasonOptions = {}): ParameterDecoratorEx {
	const { isAmmended, required } = options;

	const description = isAmmended ? "The updated case reason" : "The reason";

	const name = isAmmended ? "new_reason" : "reason";

	return CommandUtils.constructSlashOption({
		options: {
			description,
			name,
			type: ApplicationCommandOptionType.String,
			maxLength: MAX_REASON_STRING_LENGTH,
			required
		},
		transformer(value = InteractionUtils.messages.noReason) {
			return value;
		}
	});
}
