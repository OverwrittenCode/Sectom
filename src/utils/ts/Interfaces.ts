import type {
	CommandInteraction,
	InteractionResponse,
	ButtonInteraction
} from "discord.js";
import type { AccessGateSubGroupApplicationCommandOptionType, SubCommandActionType } from "./AccessTypes";

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
