import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import { SlashOption } from "discordx";

import { TargetTransformer } from "~/helpers/transformers/Target.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { StringUtils } from "~/helpers/utils/string.js";
import type { Enums } from "~/ts/Enums.js";

import type { SlashOptionOptions } from "discordx";

interface TargetSlashOptionArguments {
	channelTypes?: ChannelType[];
	descriptionNote?: string;
	entityType: keyof typeof CommandUtils.entityType;
	flags?: Enums.CommandSlashOptionTargetFlags[];
	name?: Lowercase<string>;
	required?: boolean;
}

export function GivenChannelSlashOption(
	options: Omit<TargetSlashOptionArguments, "entityType" | "flags" | "name"> = {}
) {
	const { channelTypes, descriptionNote, required = false } = options;

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) => {
		TargetSlashOption({
			entityType: CommandUtils.entityType.CHANNEL,
			name: CommandUtils.slashOptions.ChannelPermissionName,
			descriptionNote,
			required,
			channelTypes
		})(target, propertyKey, parameterIndex);
	};
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
			channelTypes
		} as SlashOptionOptions<Lowercase<string>, string>;

		SlashOption(slashOptionObj, TargetTransformer(flags))(target, propertyKey, parameterIndex);
	};
}
