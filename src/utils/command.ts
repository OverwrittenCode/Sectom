import { EntityType } from "@prisma/client";
import ms from "ms";

import type { CommandInteraction, CommandInteractionOption } from "discord.js";

export abstract class CommandUtils {
	public static CollectionTime = ms("10m");
	public static EntityType = { ...EntityType, SNOWFLAKE: "SNOWFLAKE" as const };
	public static SlashOptions = {
		ChannelPermissionName: "in_channel",
		DisableChoice: "disable"
	} as const;


	public static retrieveCommandInteractionOptions(interaction: CommandInteraction): CommandInteractionOption[] {
		return interaction.options.data.flatMap((data) =>
			data.options
				? data.options.some((o) => !!o.options)
					? data.options.flatMap((o) => o.options ?? [o])
					: data.options
				: [data]
		);
	}
}
