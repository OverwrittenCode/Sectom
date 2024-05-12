export namespace Enums {
	export enum CommandCategory {
		Moderation = "Moderation",
		Misc = "Misc",
		Admin = "Admin"
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
}
