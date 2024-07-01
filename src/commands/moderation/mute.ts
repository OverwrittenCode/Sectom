import assert from "assert";

import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

const mutualPermissions = [PermissionFlagsBits.MuteMembers];
@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Mute {
	@Slash({
		dmPermission: false,
		description: "Mute a user in a voice channel on the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(mutualPermissions))
	public async mute(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

		const auditReason = ActionManager.generateAuditReason(interaction, reason);
		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.SERVER_MUTE_USER_ADD,
			actionOptions: {
				pastTense: "server muted",
				pendingExecution: () => target.voice.setMute(true, auditReason)
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Unmute a user in a voice channel on the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(mutualPermissions))
	public async unmute(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.SERVER_MUTE_USER_ADD,
			actionOptions: {
				pastTense: "server unmuted",
				pendingExecution: () => target.voice.setMute(false, auditReason)
			}
		});
	}
}
