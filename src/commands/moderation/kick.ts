import { NO_REASON } from "@constants";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ReasonSlashOption } from "@helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "@helpers/guards/BotRequiredPermissions.js";
import { ActionModerationManager } from "@managers/ActionModerationManager.js";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

const mutualPermissions = [PermissionFlagsBits.KickMembers];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Kick {
	@Slash({ description: "Kick a user from the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public kick(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
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
