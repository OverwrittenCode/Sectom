import { EntityType } from "@prisma/client";
import { SlashOption } from "discordx";
import ms from "ms";

import type { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

import type { ChatInputCommandInteraction, CommandInteraction, CommandInteractionOption } from "discord.js";
import type { NotEmpty, ParameterDecoratorEx, SlashOptionOptions, VerifyName } from "discordx";
import type { Simplify } from "type-fest";

type CategoryGroupedDataKey = Enums.CommandCategory;

type CategoryGroupedDataValue = Array<
	Simplify<Pick<Required<Typings.DSlashCommand>, "name" | "description" | "options" | "category">>
>;

interface CategoryGroupedData {
	keys: CategoryGroupedDataKey[];
	obj: Record<CategoryGroupedDataKey, CategoryGroupedDataValue>;
	values: CategoryGroupedDataValue[];
}

interface ConstructSlashOptionOptions<SlashObj extends Typings.SlashOption> {
	options: SlashObj;
	transformer?: (
		value: Typings.SlashOptionTransformerValueParam<SlashObj>,
		interaction: ChatInputCommandInteraction
	) => Awaited<any>;
}

export abstract class CommandUtils {
	public static categoryGroupedData: CategoryGroupedData;
	public static readonly collectionTime = ms("10m");
	public static readonly durationLimits = {
		Timeout: { min: "5s", max: "28d" },
		Warn: { min: "1m", max: "90d" },
		Ban: { max: "7d" }
	} as const;
	public static readonly entityType = { ...EntityType, SNOWFLAKE: "SNOWFLAKE" as const };
	public static readonly slashOptions = {
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

	public static constructSlashOption<SlashObj extends Typings.SlashOption>(
		options: ConstructSlashOptionOptions<SlashObj>
	): ParameterDecoratorEx {
		return (target, propertyKey, parameterIndex) =>
			SlashOption(
				options.options as SlashOptionOptions<VerifyName<string>, NotEmpty<string>>,
				options.transformer
			)(target, propertyKey, parameterIndex);
	}
}
