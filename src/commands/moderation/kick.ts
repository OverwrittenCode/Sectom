import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { ActionModerationManager } from "~/managers/ActionModerationManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

const mutualPermissions = [PermissionFlagsBits.KickMembers];
@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Kick {
	@Slash({ description: "Kick a user from the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public kick(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: CaseActionType.KICKED_USER,
			actionOptions: {
				pastTense: "kicked",
				checkPossible: (guildMember) => guildMember.kickable,
				pendingExecution: () => target.kick(auditReason)
			}
		});
	}
}
