import type {
	BeAnObject,
	IObjectWithTypegooseFunction
} from "@typegoose/typegoose/lib/types";
import type {
	APIMessageComponentEmoji,
	ButtonInteraction,
	ButtonStyle,
	ChannelSelectMenuInteraction,
	CommandInteraction,
	ContextMenuCommandInteraction,
	GuildBasedChannel,
	InteractionReplyOptions,
	InteractionResponse,
	MentionableSelectMenuInteraction,
	ModalSubmitInteraction,
	Role,
	RoleSelectMenuInteraction,
	StringSelectMenuInteraction,
	User,
	UserSelectMenuInteraction
} from "discord.js";
import mongoose, { Types } from "mongoose";

import type {
	Channel as ChannelObj,
	Role as RoleObj,
	User as UserObj
} from "../models/ServerModel.js";

// General types
export type ModelUpdateProperties<I> = {
	[K in keyof Omit<I, "_id" | "__v">]?: I[K];
};

export type MongooseDocumentType<T = any> = mongoose.Document<
	unknown,
	BeAnObject,
	T
> &
	Omit<
		T & {
			_id: Types.ObjectId;
		},
		"typegooseName"
	> &
	IObjectWithTypegooseFunction;

export type ClassPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? never : K;
}[keyof T] extends infer U
	? U
	: never;

export type FunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type NonFunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

export type FilteredKeys<T> = {
	[K in keyof T as T[K] extends Function ? never : K]: T[K];
};

export type TitleCase<T extends string> =
	T extends `${infer First}${infer Rest}`
		? `${Uppercase<First>}${Lowercase<Rest>}`
		: never;

export type TitleCaseEnum<T extends string> = {
	[P in T as Uppercase<P>]: TitleCase<P>;
};

export type NonNullProperties<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends null | undefined ? never : K;
}[keyof T];

export type NonNullResultKeys<T extends Record<string, unknown>> =
	NonNullProperties<T>;

export type NonNullResultValues<T extends Record<string, unknown>> = Exclude<
	T[NonNullResultKeys<T>],
	null
>;

// Access types
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

// Button types
export interface ButtonOptions {
	/**
	 * Button emoji
	 */
	emoji?: APIMessageComponentEmoji;
	/**
	 * Button id
	 */
	id?: string;
	/**
	 * Button label
	 */
	label?: string;
	/**
	 * Button style
	 */
	style?: ButtonStyle;
}

export type ButtonPaginationPositions = {
	start: ButtonOptions;
	next: ButtonOptions;
	previous: ButtonOptions;
	end: ButtonOptions;
	exit: ButtonOptions;
};

// Action types
export enum ActionType {
	MUTE = "mute",
	KICK = "kick",
	BAN = "ban"
}

export type ModerationHierarchy =
	| "You cannot select yourself"
	| "You cannot select a bot"
	| `You cannot select that ${
			| TargetClassSingular.USER
			| TargetClassSingular.ROLE} as they are higher or equal to your target in the role hierarchy`;

export type ReplyOptions = InteractionReplyOptions & { ephemeral?: boolean };

export type GuildInteraction =
	| ButtonInteraction
	| ChannelSelectMenuInteraction
	| CommandInteraction
	| ContextMenuCommandInteraction
	| MentionableSelectMenuInteraction
	| ModalSubmitInteraction
	| RoleSelectMenuInteraction
	| StringSelectMenuInteraction
	| UserSelectMenuInteraction;

export interface IBaseListManager {
	view: (
		commandName: string | undefined,
		interaction: CommandInteraction
	) => Promise<void>;
}

export interface ISubCommandManager extends IBaseListManager {
	manageSubCommandAction: (
		action: `${SubCommandActionType}`,
		target: AccessGateSubGroupApplicationCommandOptionType,
		commandName: string | undefined,
		interaction: CommandInteraction
	) => Promise<InteractionResponse<boolean> | undefined>;
	moveSubCommandType: (interaction: ButtonInteraction) => Promise<void>;
	add: (
		target: AccessGateSubGroupApplicationCommandOptionType,
		commandName: string | undefined,
		interaction: CommandInteraction
	) => Promise<void>;
	remove: (
		target: AccessGateSubGroupApplicationCommandOptionType,
		commandName: string | undefined,
		interaction: CommandInteraction
	) => Promise<void>;
}
