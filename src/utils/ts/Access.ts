import type { GuildBasedChannel, Role, User } from "discord.js";

import { CaseType } from "../../DB/cache/Cases";
import {
	Channel as ChannelObj,
	Role as RoleObj,
	User as UserObj
} from "../../DB/models/Server.js";

export type AccessGateSubGroupApplicationCommandOptionType =
	| User
	| Role
	| GuildBasedChannel;

export type ServerModelSelectionSnowflakeType = UserObj | RoleObj | ChannelObj;

export type EnumValues<T extends Record<string, string>> = T[keyof T];

export enum TargetClass {
	USERS = "users",
	MEMBERS = "users",
	ROLES = "roles",
	CHANNELS = "channels"
}

export enum TargetClassSingular {
	USER = "user",
	MEMBER = "user",
	ROLE = "role",
	CHANNEL = "channel"
}

export const EntityConstants = {
	MEMBERS: "members",
	ROLES: TargetClass.ROLES,
	CHANNELS: TargetClass.CHANNELS
};

export enum SecondaryTargetClass {
	GUILDS = "guilds"
}

export enum SecondaryTargetClassSingular {
	GUILD = "guild"
}

export const CombinedTargetClass = {
	...TargetClass,
	...SecondaryTargetClass
};

export const CombinedTargetSingularClass = {
	...TargetClassSingular,
	...SecondaryTargetClassSingular
};

export enum TargetType {
	USER = "User",
	MEMBER = "User",
	CHANNEL = "Channel",
	ROLE = "Role"
}

export enum AccessListBarrier {
	BLACKLIST = "blacklist",
	WHITELIST = "whitelist"
}

export enum PaginationIDBarrier {
	ACTIONS = "actions",
	BLACKLIST = AccessListBarrier.BLACKLIST,
	WHITELIST = AccessListBarrier.WHITELIST
}

export enum SubCommandActionType {
	ADD = "add",
	REMOVE = "remove"
}

export type ButtonIDPrefix = `${CaseType}_${EnumValues<
	typeof CombinedTargetClass
>}_`;

export type ButtonIDFormat<T extends string = string> = T extends string
	? `${ButtonIDPrefix}${T}`
	: ButtonIDPrefix;
