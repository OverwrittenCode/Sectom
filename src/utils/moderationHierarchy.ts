import type {
	CommandInteraction,
	MessageContextMenuCommandInteraction,
	Role,
	User,
	UserContextMenuCommandInteraction
} from "discord.js";
import { GuildMember } from "discord.js";

import { logger } from "./logger.js";
import { getEntityFromGuild } from "./others.js";
import type { ModerationHierarchy } from "./ts/Action.js";

export async function moderationHierarchy(
	target: User | Role,
	interaction:
		| CommandInteraction
		| UserContextMenuCommandInteraction
		| MessageContextMenuCommandInteraction
): Promise<ModerationHierarchy | void> {
	try {
		if (target.id == interaction.user.id) return "You cannot select yourself";

		const targetIsGuildMember = await getEntityFromGuild(
			interaction,
			["members"],
			target.id
		);

		const interactionTarget = interaction.guild?.[
			targetIsGuildMember ? "members" : "roles"
		].cache.get(target.id);

		const interactionAuthor = interaction.guild?.members.cache.get(
			interaction.user.id
		);

		if (!interactionTarget || !interactionAuthor) return;

		if (
			interactionTarget instanceof GuildMember &&
			interactionTarget.user.bot
		) {
			return "You cannot select a bot";
		}

		const targetPosition =
			interactionTarget instanceof GuildMember
				? interactionTarget.roles.highest.position
				: interactionTarget.position;

		if (targetPosition >= interactionAuthor.roles.highest.position) {
			return `You cannot select that ${
				interactionTarget instanceof GuildMember ? "user" : "role"
			} as they are higher or equal to your target in the role hierarchy`;
		}
	} catch (error) {
		logger.error(error);
	}
}
