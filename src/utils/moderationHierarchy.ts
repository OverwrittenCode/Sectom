import type {
	CommandInteraction,
	MessageContextMenuCommandInteraction,
	UserContextMenuCommandInteraction
} from "discord.js";
import { GuildMember } from "discord.js";

import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "./config.js";
import { getEntityFromGuild } from "./interaction.js";
import { logger } from "./logger.js";
import type { ModerationHierarchy } from "./ts/Action.js";
import { ValidationError } from "./errors/ValidationError.js";

type GuildMemberOrRole = NonNullable<
	Awaited<ReturnType<typeof getEntityFromGuild<["members", "roles"]>>>
>;

export async function moderationHierarchy(
	interactionTargetObject: GuildMemberOrRole,
	interaction:
		| CommandInteraction
		| UserContextMenuCommandInteraction
		| MessageContextMenuCommandInteraction
): Promise<ModerationHierarchy | void> {
	try {
		const interactionTarget = Object.values(interactionTargetObject)[0];
		if (!interactionTarget) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

		const isGuildMember = interactionTarget instanceof GuildMember;

		if (interactionTarget.id == interaction.user.id)
			return "You cannot select yourself";

		const interactionAuthor = interaction.guild?.members.cache.get(
			interaction.user.id
		);

		if (!interactionAuthor) return;

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
