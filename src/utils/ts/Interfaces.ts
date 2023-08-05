import type { ChatInputCommandInteraction } from "discord.js";

import type {
	AccessGateSubGroupApplicationCommandOptionType,
	SubCommandActionType
} from "./Access.js";

type CommandName = string | undefined;
type CommonParams = [CommandName, ChatInputCommandInteraction];
type InteractionCommand = (...args: CommonParams) => Promise<void>;

type SubCommandModifier = (
	target: AccessGateSubGroupApplicationCommandOptionType,
	...args: CommonParams
) => Promise<void>;

export interface IBaseListManager {
	view: InteractionCommand;
}

export type SubCommandManagerModifiers = Record<
	SubCommandActionType,
	SubCommandModifier
>;

export interface ISubCommandManager
	extends IBaseListManager,
		Pick<SubCommandManagerModifiers, SubCommandActionType> {
	manageSubCommandAction: (
		action: `${SubCommandActionType}`,
		target: AccessGateSubGroupApplicationCommandOptionType,
		...args: CommonParams
	) => Promise<void | undefined>;
}
