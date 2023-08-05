import type {
	CommandInteraction,
	MessageComponentInteraction
} from "discord.js";
import { GuildBasedChannel, GuildMember, Role } from "discord.js";

import { NO_DATA_MESSAGE, UNEXPECTED_FALSY_VALUE__MESSAGE } from "./config.js";
import { ValidationError } from "./errors/ValidationError.js";
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

type Entity = Partial<{
	members: GuildMember;
	roles: Role;
	channels: GuildBasedChannel;
}>;

export type EntityMentions = {
	members: "@";
	roles: "@&";
	channels: "#";
};

type EntityKeys = keyof Entity;

type EntityResult<T extends SearchFilter> = T extends ["all"]
	? { [P in EntityKeys]: Entity[P] }
	: T extends [infer P]
	? P extends EntityKeys
		? Entity[P & EntityKeys]
		: undefined
	: { [P in Extract<T[number], EntityKeys>]: Entity[P & EntityKeys] };

function isEmptyObject(obj: object) {
	return obj !== null && Object.keys(obj).length === 0;
}

const SearchFilterToMentionString: EntityMentions = {
	members: "@",
	roles: "@&",
	channels: "#"
};

type SingleEntityResult = GuildMember | Role | GuildBasedChannel;
type MultipleEntityResult = {
	[P in EntityKeys]: SingleEntityResult | undefined;
};

export function getMentionPrefixFromEntity<
	T extends SingleEntityResult | MultipleEntityResult
>(entity: T): EntityMentions[keyof EntityMentions] {
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

function isEntityWithoutChannels(
	entity: Entity
): entity is Omit<Entity, "channels"> {
	return !entity.channels;
}

export function isEntityWithoutRoles(
	entity: Entity
): entity is Omit<Entity, "roles"> {
	return !entity.roles;
}

function isEntityWithoutMembers(
	entity: Entity
): entity is Omit<Entity, "members"> {
	return !entity.members;
}

export async function getEntityFromGuild<T extends SearchFilter>(
	interaction: GuildInteraction,
	searchFilter: T,
	targetId: string,
	onlyCache?: boolean
): Promise<EntityResult<T> | undefined> {
	if (!interaction.guild || !interaction.guildId)
		throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	const entityMap: {
		[K in Filter]?: GuildMember | Role | GuildBasedChannel;
	} = {};

	const filterArray = searchFilter as Array<Filter | "all">;
	const isAll = filterArray.includes("all");

	const selection: UserInputFilters = ["members", "roles", "channels"];

	const keys = isAll
		? selection
		: selection.filter((str) => filterArray.includes(str));

	for (const key of keys) {
		let fetched =
			interaction.guild[key].cache.get(targetId) ?? onlyCache
				? undefined
				: await interaction.guild[key]
						.fetch(targetId)
						.catch(() => undefined);

		if (fetched) {
			entityMap[key] = fetched as (typeof entityMap)[Filter];
		}
	}

	if (isEmptyObject(entityMap)) return;

	if (!isAll && filterArray.length == 1) {
		const singleResult = entityMap[filterArray[0] as keyof typeof entityMap];
		return singleResult as EntityResult<T>;
	}

	const result = entityMap as EntityResult<T>;

	if (isEntityWithoutChannels(result)) {
		return result;
	} else if (isEntityWithoutRoles(result)) {
		return result;
	} else if (isEntityWithoutMembers(result)) {
		return result;
	} else {
		throw new Error("Entity has unexpected properties");
	}
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
