import type { COMMAND_ENTITY_TYPE } from "@constants";
import { EntityType } from "@prisma/client";
import type { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { CommandUtils } from "@utils/command.js";
import { StringUtils } from "@utils/string.js";
import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import type { SlashOptionOptions } from "discordx";
import { SlashOption } from "discordx";

export function TargetSlashOption(
	flags?: COMMAND_SLASH_OPTION_TARGET_FLAGS[],
	entityType: keyof typeof COMMAND_ENTITY_TYPE = EntityType.USER,
	required: boolean = true,
	namePrefix: string = ""
) {
	const entityTypeLowercase = entityType.toLowerCase() as Lowercase<typeof entityType>;
	const entityTypeTitleCase = StringUtils.capitalizeFirstLetter(entityTypeLowercase);

	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		const slashOptionObj = {
			description: `The ${entityTypeLowercase} mention or ${entityTypeLowercase}Id. Ex: 1090725120628111864. ${CommandUtils.generateSlashOptionTargetDescriptionSuffix(flags)}`,
			name: namePrefix ? `${namePrefix}_${entityTypeLowercase}` : entityTypeLowercase,
			type:
				entityTypeTitleCase === "Snowflake"
					? ApplicationCommandOptionType.Mentionable
					: ApplicationCommandOptionType[entityTypeTitleCase],
			required,
			channelTypes: entityTypeTitleCase === "Channel" ? [ChannelType.GuildText] : undefined
		} as SlashOptionOptions<Lowercase<string>, string>;

		SlashOption(slashOptionObj)(target, propertyKey, parameterIndex);
	};
}
