import { ApplicationCommandOptionType } from "discord.js";
import { SlashOption } from "discordx";

import { MAX_REASON_STRING_LENGTH } from "~/constants.js";

import type { ParameterDecoratorEx } from "discordx";

interface ReasonOptions {
	isAmmendedReason?: boolean;
	required?: boolean;
}

export function ReasonSlashOption(options: ReasonOptions = {}): ParameterDecoratorEx {
	const { isAmmendedReason, required = false } = options;

	const description = isAmmendedReason ? "The updated case reason" : "The reason";

	const name = isAmmendedReason ? "new_reason" : "reason";

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) =>
		SlashOption({
			description,
			name,
			type: ApplicationCommandOptionType.String,
			maxLength: MAX_REASON_STRING_LENGTH,
			required
		})(target, propertyKey, parameterIndex);
}
