import assert from "assert";

import { NO_REASON } from "@constants";
import { ReasonSlashOption } from "@decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "@utils/interaction.js";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";
import { BotRequiredPermissions } from "src/guards/BotRequiredPermissions.js";

import { ActionModerationManager } from "../../models/framework/manager/ActionModerationManager.js";

@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Deafen {
	@Slash({ description: "Deafen a user in a voice channel on the server" })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions([PermissionFlagsBits.DeafenMembers]))
	public async deafen(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { voice } = target;
		const errorReason = !voice.channelId
			? "that user is not inside a voice channel"
			: voice.serverDeaf
				? "that user is already server deafened"
				: null;

		if (errorReason) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: `I cannot perform this action: ${errorReason}.`,
				ephemeral: true
			});
		}

		assert(voice.channel);

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = CaseActionType.SERVER_DEAFEN_USER_ADDED;
		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "server deafened",
				pendingExecution: () => target.voice.setDeaf(true, auditReason)
			}
		});
	}

	@Slash({ description: "Undeafen a user in a voice channel on the server" })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions([PermissionFlagsBits.MuteMembers]))
	public async undeafened(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { voice } = target;
		const errorReason = !voice.channelId
			? "that user is not inside a voice channel"
			: !voice.serverDeaf
				? "that user is not server deafened"
				: null;

		if (errorReason) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: `I cannot perform this action: ${errorReason}.`,
				ephemeral: true
			});
		}

		assert(voice.channel);

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = CaseActionType.SERVER_DEAFEN_USER_REMOVED;
		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "server undeafened",
				pendingExecution: () => target.voice.setDeaf(false, auditReason)
			}
		});
	}
}
