import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { DurationSlashOption } from "~/helpers/decorators/slashOptions/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

const mutualPermissions = [PermissionFlagsBits.ModerateMembers];
@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Timeout {
	private checkPossible = (guildMember: GuildMember) => guildMember.moderatable;

	@Slash({
		dmPermission: false,
		description: "Timeout a user on the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(mutualPermissions))
	public async timeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@DurationSlashOption({
			transformerOptions: CommandUtils.DurationLimits.Timeout
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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
				checkPossible: this.checkPossible,
				pendingExecution: () => target.timeout(msDuration, auditReason)
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Remove a timeout a user on the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(mutualPermissions))
	public async untimeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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
				checkPossible: this.checkPossible,
				pendingExecution: () => target.timeout(null, auditReason)
			}
		});
	}
}
