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

const mutalPermissions = [PermissionFlagsBits.MuteMembers];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Mute {
	@Slash({ description: "Mute a user in a voice channel on the server", defaultMemberPermissions: mutalPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutalPermissions))
	public async mute(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { voice } = target;
		const errorReason = !voice.channelId
			? "that user is not inside a voice channel"
			: voice.serverMute
				? "that user is already server muted"
				: null;

		if (errorReason) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: `I cannot perform this action: ${errorReason}.`,
				ephemeral: true
			});
		}

		assert(voice.channel);

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = CaseActionType.SERVER_MUTE_USER_ADDED;
		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "server muted",
				pendingExecution: () => target.voice.setMute(true, auditReason)
			}
		});
	}

	@Slash({
		description: "Unmute a user in a voice channel on the server",
		defaultMemberPermissions: mutalPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutalPermissions))
	public async unmute(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD])
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { voice } = target;
		const errorReason = !voice.channelId
			? "that user is not inside a voice channel"
			: !voice.serverMute
				? "that user is not server muted"
				: null;

		if (errorReason) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: `I cannot perform this action: ${errorReason}.`,
				ephemeral: true
			});
		}

		assert(voice.channel);

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		const actionType = CaseActionType.SERVER_MUTE_USER_ADDED;
		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "server unmuted",
				pendingExecution: () => target.voice.setMute(false, auditReason)
			}
		});
	}
}
