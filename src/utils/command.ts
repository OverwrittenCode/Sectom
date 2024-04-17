import type { CommandInteraction, CommandInteractionOption } from "discord.js";

export abstract class CommandUtils {
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
