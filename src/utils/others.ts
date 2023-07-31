import type {
	CommandInteraction,
	GuildBasedChannel,
	GuildMember,
	MessageComponentInteraction,
	Role
} from "discord.js";

import { NO_DATA_MESSAGE } from "./config.js";
import type { FilteredKeys, GuildInteraction, ReplyOptions } from "./type.js";

export async function replyOrFollowUp(
	interaction: CommandInteraction | MessageComponentInteraction,
	replyOptions: ReplyOptions | string
) {
	// if interaction is already replied
	if (interaction.replied) {
		await interaction.followUp(replyOptions);
		return;
	}

	// if interaction is deferred but not replied
	if (interaction.deferred) {
		await interaction.editReply(replyOptions);
		return;
	}

	// if interaction is not handled yet
	await interaction.reply(replyOptions);
	return;
}

export async function replyNoData(interaction: CommandInteraction) {
	await replyOrFollowUp(interaction, {
		content: NO_DATA_MESSAGE,
		ephemeral: true
	});
}

type Filter = "members" | "roles" | "channels";
type SearchFilter = Filter[] | ["all"];
type Nullable<T> = { [P in keyof T]: T[P] | null };

type Entity = Nullable<{
	members: GuildMember;
	roles: Role;
	channels: GuildBasedChannel;
}>;

type EntityResult<T extends Filter[] | ["all"]> = T extends [infer P]
	? P extends keyof Entity
		? Entity[P & keyof Entity]
		: null
	: { [P in Extract<T[number], keyof Entity>]: Entity[P & keyof Entity] };

function areAllValuesNull(obj: Record<string, unknown>): boolean {
	for (const key in obj) {
		if (obj[key] !== null) return false;
	}
	return true;
}

export async function getEntityFromGuild<T extends SearchFilter>(
	interaction: GuildInteraction,
	searchFilter: T,
	targetId?: string
): Promise<EntityResult<T> | null> {
	if (!interaction.guild || !targetId) return null;

	const result: {
		members: GuildMember | null;
		roles: Role | null;
		channels: GuildBasedChannel | null;
	} = {
		members: null,
		roles: null,
		channels: null
	};

	const filterArray = searchFilter as Array<
		"members" | "roles" | "channels" | "all"
	>;
	const isAll = filterArray.includes("all");

	const keys = ["members", "roles", "channels"];

	for (const untypedKey of keys) {
		const key = untypedKey as keyof typeof result;

		if (isAll || filterArray.includes(key)) {
			const fetched =
				interaction.guild[key].cache.get(targetId) ||
				(await interaction.guild[key].fetch(targetId).catch(() => null));

			switch (key) {
				case "members":
					result.members = fetched as GuildMember | null;
					break;
				case "roles":
					result.roles = fetched as Role | null;
					break;
				case "channels":
					result.channels = fetched as GuildBasedChannel | null;
					break;
			}
		}
	}

	if (areAllValuesNull(result)) return null;

	if (!isAll && filterArray.length == 1) {
		const singleResult = result[filterArray[0] as keyof typeof result];
		return singleResult as EntityResult<T>;
	}

	return result as EntityResult<T>;
}

export function typegooseClassProps<T extends object>(obj: T) {
	const result: {
		[key: string]: any;
	} = {};

	for (const key in obj) {
		const typedKey = key as keyof T;

		if (!key.startsWith("_") && typeof obj[typedKey] !== "function") {
			result[typedKey as any] = obj[typedKey];
		}
	}

	return result as Omit<FilteredKeys<T>, "_id">;
}
