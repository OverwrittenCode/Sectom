import { ApplicationCommandOptionType } from "discord.js";
import { SlashOption } from "discordx";

export function ReasonSlashOption() {
	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		SlashOption({
			description: "The reason",
			name: "reason",
			type: ApplicationCommandOptionType.String
		})(target, propertyKey, parameterIndex);
	};
}
