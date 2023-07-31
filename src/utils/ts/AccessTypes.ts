import type { User, Role, GuildBasedChannel } from "discord.js";

import type {
    Channel as ChannelObj,
    Role as RoleObj,
    User as UserObj
} from "../../models/ServerModel.js";

export type AccessGateSubGroupApplicationCommandOptionType =
    | User
    | Role
    | GuildBasedChannel;

export type ServerModelSelectionSnowflakeType = UserObj | RoleObj | ChannelObj;

export type EnumValues<T extends Record<string, string>> = T[keyof T];

export enum TargetClass {
    USERS = "users",
    ROLES = "roles",
    CHANNELS = "channels"
}

export enum TargetClassSingular {
    USER = "user",
    ROLE = "role",
    CHANNEL = "channel"
}

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

type ButtonIDPrefix = `${PaginationIDBarrier}_${EnumValues<
    typeof CombinedTargetClass
>}_`;

export type ButtonIDFormat<T extends string = string> = T extends string
    ? `${ButtonIDPrefix}${T}`
    : ButtonIDPrefix;
