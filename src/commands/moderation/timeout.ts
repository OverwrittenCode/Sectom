import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { DurationSlashOption } from "~/helpers/decorators/slash/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slash/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slash/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Timeout {
	private static readonly checkPossible = (guildMember: GuildMember) => guildMember.moderatable;
	private static readonly mutualPermissions = [PermissionFlagsBits.ModerateMembers];

	@Slash({
		dmPermission: false,
		description: "Timeout a user on the server",
		defaultMemberPermissions: Timeout.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Timeout.mutualPermissions))
	public async timeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@DurationSlashOption({
			transformerOptions: CommandUtils.durationLimits.Timeout
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		const actionType = ActionType[`TIME_OUT_USER_${target.isCommunicationDisabled() ? "UPDATE" : "ADD"}`];

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "timed out",
				checkPossible: Timeout.checkPossible,
				pendingExecution: () => target.timeout(msDuration, auditReason)
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Remove a timeout a user on the server",
		defaultMemberPermissions: Timeout.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Timeout.mutualPermissions))
	public async untimeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTimedOut = target.isCommunicationDisabled();

		if (!isTimedOut) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is not timed out.",
				ephemeral: true
			});
		}

		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.TIME_OUT_USER_REMOVE,
			actionOptions: {
				pastTense: "removed the timed out from",
				checkPossible: Timeout.checkPossible,
				pendingExecution: () => target.timeout(null, auditReason)
			}
		});
	}
}
