import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import { SlashOption } from "discordx";

import { TargetTransformer } from "~/helpers/transformers/Target.js";
import type { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { StringUtils } from "~/utils/string.js";

import type { SlashOptionOptions } from "discordx";

interface TargetSlashOptionArguments {
	entityType: keyof typeof CommandUtils.EntityType;
	flags?: Enums.CommandSlashOptionTargetFlags[];
	required?: boolean;
	name?: Lowercase<string>;
	descriptionNote?: string;
	channelTypes?: ChannelType[];
}

export function TargetSlashOption(args: TargetSlashOptionArguments) {
	const { entityType, flags, required = true, name } = args;
	let { descriptionNote = "", channelTypes } = args;

	if (descriptionNote) {
		descriptionNote += ". ";
	}

	descriptionNote += "Ex: 1090725120628111864";

	const entityTypeLowercase = entityType.toLowerCase() as Lowercase<typeof entityType>;
	const entityTypeSentenceCase = StringUtils.capitaliseFirstLetter(entityTypeLowercase);

	if (entityTypeSentenceCase === "Channel") {
		channelTypes ??= [ChannelType.GuildText];
	}

	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		const slashOptionObj = {
			description: `The ${entityTypeLowercase} mention or ${entityTypeLowercase}Id. ${descriptionNote}`,
			name: name ?? entityTypeLowercase,
			type:
				entityTypeSentenceCase === "Snowflake"
					? ApplicationCommandOptionType.Mentionable
					: ApplicationCommandOptionType[entityTypeSentenceCase],
			required,
			channelTypes,
			transformer: TargetTransformer(flags)
		} as SlashOptionOptions<Lowercase<string>, string>;

		SlashOption(slashOptionObj)(target, propertyKey, parameterIndex);
	};
}

export function GivenChannelSlashOption(
	options: Omit<TargetSlashOptionArguments, "entityType" | "flags" | "name"> = {}
) {
	const { channelTypes, descriptionNote, required = false } = options;

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) => {
		TargetSlashOption({
			entityType: CommandUtils.EntityType.CHANNEL,
			name: CommandUtils.SlashOptions.ChannelPermissionName,
			descriptionNote,
			required,
			channelTypes
		})(target, propertyKey, parameterIndex);
	};
}
