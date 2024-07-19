import { EntityType } from "@prisma/client";
import ms from "ms";

import type { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

import type { CommandInteraction, CommandInteractionOption } from "discord.js";

type CategoryGroupedDataKey = Enums.CommandCategory;

type CategoryGroupedDataValue = Array<
	Typings.Prettify<Pick<Required<Typings.DSlashCommand>, "name" | "description" | "options" | "category">>
>;

interface CategoryGroupedData {
	keys: CategoryGroupedDataKey[];
	obj: Record<CategoryGroupedDataKey, CategoryGroupedDataValue>;
	values: CategoryGroupedDataValue[];
}

export abstract class CommandUtils {
	public static CategoryGroupedData: CategoryGroupedData;
	public static CollectionTime = ms("10m");
	public static DurationLimits = {
		Timeout: { min: "5s", max: "28d" },
		Warn: { min: "1m", max: "90d" },
		Ban: { max: "7d" }
	} as const;
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
