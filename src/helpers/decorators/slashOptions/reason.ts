import { ApplicationCommandOptionType } from "discord.js";
import { SlashOption } from "discordx";

import { MAX_REASON_STRING_LENGTH } from "~/constants.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";

import type { ParameterDecoratorEx, SlashOptionOptions, TransformerFunction } from "discordx";

interface ReasonOptions {
	isAmmendedReason?: boolean;
	required?: boolean;
}

export function ReasonSlashOption(options: ReasonOptions = {}): ParameterDecoratorEx {
	const { isAmmendedReason, required = false } = options;

	const description = isAmmendedReason ? "The updated case reason" : "The reason";

	const name = isAmmendedReason ? "new_reason" : "reason";

	const slashObj = {
		description,
		name,
		type: ApplicationCommandOptionType.String,
		maxLength: MAX_REASON_STRING_LENGTH,
		required
	} as SlashOptionOptions<Lowercase<string>, string>;

	const transformer: TransformerFunction = (reason: string = InteractionUtils.messages.noReason) => reason;

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) =>
		SlashOption(slashObj, transformer)(target, propertyKey, parameterIndex);
}
