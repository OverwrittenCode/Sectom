import { NO_REASON } from "@constants";
import { ReasonSlashOption } from "@decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";
import { BotRequiredPermissions } from "src/guards/BotRequiredPermissions.js";

import { ActionModerationManager } from "../../models/framework/manager/ActionModerationManager.js";

const mutualPermissions = [PermissionFlagsBits.KickMembers];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Kick {
	@Slash({ description: "Kick a user from the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public kick(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
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
