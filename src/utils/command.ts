import { COMMAND_TARGET_OPTION_DESCRIPTION } from "@constants";
import type { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import type { CommandInteraction, CommandInteractionOption } from "discord.js";

import { ObjectUtils } from "./object.js";

export abstract class CommandUtils {
	public static generateSlashOptionTargetDescriptionSuffix(flags?: COMMAND_SLASH_OPTION_TARGET_FLAGS[]): string {
		if (!flags) {
			return COMMAND_TARGET_OPTION_DESCRIPTION;
		}

		return ObjectUtils.uniqueArray([COMMAND_TARGET_OPTION_DESCRIPTION, ...flags]).join("_");
	}

	public static retrieveCommandInteractionOption(interaction: CommandInteraction): CommandInteractionOption[] {
		return interaction.options.data.flatMap((data) =>
			data.options
				? data.options.some((o) => !!o.options)
					? data.options.flatMap((o) => o.options ?? [o])
					: data.options
				: [data]
		);
	}
}
