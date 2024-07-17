export namespace Enums {
	export enum CommandCategory {
		Admin = "Admin",
		Moderation = "Moderation",
		Misc = "Misc",
		Game = "Game"
	}

	export enum CommandSlashOptionTargetFlags {
		Guild = "guild",
		Passive = "passive"
	}

	export enum ContentClusterPropertyType {
		Subject = "subject",
		Panel = "panel"
	}

	export enum ContentClusterComponentType {
		Suggestion = "suggestion",
		Ticket = "ticket"
	}

	export enum ModifierType {
		Add = "add",
		Update = "update",
		Remove = "remove"
	}

	export enum MessageComponentType {
		Button = "button",
		Modal = "modal",
		SelectMenu = "select_menu"
	}

	export enum GameMode {
		/** Normal game, no special rules applied */
		Classic = "Classic",
		/** All special rules applied */
		Chaos = "Chaos",
		/**
		 * - Game Master can allow a player to replace any button on the board
		 * - Very overpowered, has a reduced chance of occuring
		 * */
		Overrule = "Overrule",
		/** Game Master can readjust the whole board */
		Jumble = "Jumble",
		"Swap Move" = "Swap Move",
		"Swap Teams" = "Swap Teams",
		"Skip Turn" = "Skip Turn"
	}
}
