import { NO_REASON } from "@constants";
import { ReasonSlashOption } from "@decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash, SlashOption } from "discordx";
import { BotRequiredPermissions } from "src/guards/BotRequiredPermissions.js";

import { ActionModerationManager } from "../../models/framework/manager/ActionModerationManager.js";

const mutualPermissions = [PermissionFlagsBits.ModerateMembers];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Timeout {
	private checkPossible = (guildMember: GuildMember) => guildMember.moderatable;

	@Slash({ description: "Timeout a user on the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async timeout(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@SlashOption({
			description: "The duration of the timeout. Ex: (30m, 1h, 1 day)",
			name: "duration",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		duration: string,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const msDuration = await ActionModerationManager.validateMsDuration(interaction, {
			duration,
			min: "5s",
			max: "28d"
		});

		if (msDuration === null) {
			return;
		}

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = target.isCommunicationDisabled()
			? CaseActionType.TIMED_OUT_USER_UPDATED
			: CaseActionType.TIMED_OUT_USER_ADDED;

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "timed out",
				msDuration: msDuration,
				checkPossible: this.checkPossible,
				pendingExecution: () => target.timeout(msDuration, auditReason)
			}
		});
	}

	@Slash({ description: "Remove a timeout a user on the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async untimeout(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTimedOut = target.isCommunicationDisabled();
		if (!isTimedOut) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is not timed out.",
				ephemeral: true
			});
		}

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = CaseActionType.TIMED_OUT_USER_REMOVED;

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "removed the timed out from",
				checkPossible: this.checkPossible,
				pendingExecution: () => target.timeout(null, auditReason)
			}
		});
	}
}
