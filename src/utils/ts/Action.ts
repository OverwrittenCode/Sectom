import type {
	ButtonInteraction,
	ChannelSelectMenuInteraction,
	CommandInteraction,
	ContextMenuCommandInteraction,
	InteractionReplyOptions,
	MentionableSelectMenuInteraction,
	ModalSubmitInteraction,
	RoleSelectMenuInteraction,
	StringSelectMenuInteraction,
	UserSelectMenuInteraction
} from "discord.js";
import type { TargetClassSingular } from "./Access.js";

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
