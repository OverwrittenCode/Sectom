import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

const mutualPermissions = [PermissionFlagsBits.KickMembers];
@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Kick {
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(mutualPermissions))
	@Slash({
		dmPermission: false,
		description: "Kick a user from the server",
		defaultMemberPermissions: mutualPermissions
	})
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
		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.KICK_USER_SET,
			actionOptions: {
				pastTense: "kicked",
				checkPossible: (guildMember) => guildMember.kickable,
				pendingExecution: () => target.kick(auditReason)
			}
		});
	}
}
