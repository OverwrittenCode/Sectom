import type {
	CommandInteraction,
	MessageComponentInteraction
} from "discord.js";
import { GuildBasedChannel, GuildMember, Role } from "discord.js";

import { NO_DATA_MESSAGE } from "./config.js";
import type { GuildInteraction, ReplyOptions } from "./ts/Action.js";
import type { FilteredKeys } from "./ts/General.js";

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
type UserInputFilters = Filter[];
type SearchFilter = UserInputFilters | ["all"];
type Nullable<T> = { [P in keyof T]: T[P] | null };

type Entity = Nullable<{
	members: GuildMember;
	roles: Role;
	channels: GuildBasedChannel;
}>;

type EntityMentions = {
	members: "@";
	roles: "@&";
	channels: "#";
};

type EntityKeys = keyof Entity;

type EntityResult<T extends UserInputFilters | ["all"]> = T extends ["all"]
	? { [P in EntityKeys]: Entity[P] }
	: T extends [infer P]
	? P extends EntityKeys
		? Entity[P & EntityKeys]
		: null
	: { [P in Extract<T[number], EntityKeys>]: Entity[P & EntityKeys] };

function isObjectEmpty(obj: Record<string, unknown>): boolean {
	for (const key in obj) {
		if (obj[key] !== null) return false;
	}
	return true;
}

const SearchFilterToMentionString: EntityMentions = {
	members: "@",
	roles: "@&",
	channels: "#"
};

type SingleEntityResult = GuildMember | Role | GuildBasedChannel;
type MultipleEntityResult = {
	[P in EntityKeys]?: GuildMember | Role | GuildBasedChannel;
};

export function getMentionPrefixFromEntity<
	T extends SingleEntityResult | MultipleEntityResult
>({ entity }: { entity: T }): EntityMentions[keyof EntityMentions] {
	if (isSingleEntityResult(entity)) {
		const key = getEntityKey(entity);
		return SearchFilterToMentionString[key];
	} else {
		const key = Object.keys(entity)[0] as EntityKeys;
		return SearchFilterToMentionString[key];
	}
}

export function isSingleEntityResult(
	entity: SingleEntityResult | MultipleEntityResult
): entity is SingleEntityResult {
	return (
		entity instanceof GuildMember ||
		entity instanceof Role ||
		isGuildBasedChannel(entity)
	);
}

function getEntityKey(entity: SingleEntityResult): EntityKeys {
	if (entity instanceof GuildMember) {
		return "members";
	} else if (entity instanceof Role) {
		return "roles";
	} else {
		return "channels";
	}
}

function isGuildBasedChannel(channel: unknown): channel is GuildBasedChannel {
	return (
		typeof channel === "object" &&
		channel !== null &&
		"guild" in (channel as Record<string, unknown>)
	);
}

export async function getEntityFromGuild<T extends SearchFilter>(
	interaction: GuildInteraction,
	searchFilter: T,
	targetId?: string
): Promise<EntityResult<T> | null> {
	if (!interaction.guild || !targetId) return null;

	const entityMap: {
		[K in Filter]: GuildMember | Role | GuildBasedChannel | null;
	} = {
		members: <GuildMember | null>null,
		roles: <Role | null>null,
		channels: <GuildBasedChannel | null>null
	};

	const filterArray = searchFilter as Array<
		"members" | "roles" | "channels" | "all"
	>;
	const isAll = filterArray.includes("all");

	const keys: UserInputFilters = ["members", "roles", "channels"];

	for (const key of keys) {
		if (isAll || filterArray.includes(key)) {
			const fetched =
				interaction.guild[key].cache.get(targetId) ||
				(await interaction.guild[key].fetch(targetId).catch(() => null));

			if (fetched) {
				entityMap[key] = fetched as (typeof entityMap)[Filter];
			}
		}
	}

	if (isObjectEmpty(entityMap)) return null;

	if (!isAll && filterArray.length == 1) {
		const singleResult = entityMap[filterArray[0] as keyof typeof entityMap];
		return singleResult as EntityResult<T>;
	}

	return entityMap as EntityResult<T>;
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
