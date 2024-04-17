import type { COMMAND_ENTITY_TYPE } from "@constants";
import { TargetTransformer } from "@helpers/transformers/TargetValidator.js";
import type { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { StringUtils } from "@utils/string.js";
import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import type { SlashOptionOptions } from "discordx";
import { SlashOption } from "discordx";

interface TargetSlashOptionArguments {
	entityType: keyof typeof COMMAND_ENTITY_TYPE;
	flags?: COMMAND_SLASH_OPTION_TARGET_FLAGS[];
	required?: boolean;
	name?: string;
}

export function TargetSlashOption(args: TargetSlashOptionArguments) {
	const { flags, name, entityType } = args;
	let { required } = args;

	required ??= true;

	const entityTypeLowercase = entityType.toLowerCase() as Lowercase<typeof entityType>;
	const entityTypeTitleCase = StringUtils.capitalizeFirstLetter(entityTypeLowercase);

	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		const slashOptionObj = {
			description: `The ${entityTypeLowercase} mention or ${entityTypeLowercase}Id. Ex: 1090725120628111864`,
			name: name ?? entityTypeLowercase,
			type:
				entityTypeTitleCase === "Snowflake"
					? ApplicationCommandOptionType.Mentionable
					: ApplicationCommandOptionType[entityTypeTitleCase],
			required,
			channelTypes: entityTypeTitleCase === "Channel" ? [ChannelType.GuildText] : undefined,
			transformer: TargetTransformer(flags)
		} as SlashOptionOptions<Lowercase<string>, string>;

		SlashOption(slashOptionObj)(target, propertyKey, parameterIndex);
	};
}
