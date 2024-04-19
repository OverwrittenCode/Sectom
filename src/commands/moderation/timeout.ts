import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash, SlashOption } from "discordx";

import { NO_REASON } from "~/constants";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { DurationTransformer } from "~/helpers/transformers/Duration.js";
import { ActionModerationManager } from "~/managers/ActionModerationManager.js";
import { COMMAND_CATEGORY } from "~/ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "~/ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

const mutualPermissions = [PermissionFlagsBits.ModerateMembers];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Timeout {
	private checkPossible = (guildMember: GuildMember) => guildMember.moderatable;

	@Slash({ description: "Timeout a user on the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async timeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD]
		})
		target: GuildMember,
		@SlashOption({
			description: "The duration of the timeout. Ex: (30m, 1h, 1 day)",
			name: "duration",
			type: ApplicationCommandOptionType.String,
			required: true,
			transformer: DurationTransformer({ min: "5s", max: "28d" })
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
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
				msDuration,
				checkPossible: this.checkPossible,
				pendingExecution: () => target.timeout(msDuration, auditReason)
			}
		});
	}

	@Slash({ description: "Remove a timeout a user on the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async untimeout(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD]
		})
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
