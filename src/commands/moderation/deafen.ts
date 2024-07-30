import assert from "assert";

import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { type ChatInputCommandInteraction, type GuildMember, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Deafen {
	private static readonly mutualPermissions = [PermissionFlagsBits.DeafenMembers];

	@Slash({
		dmPermission: false,
		description: "Deafen a user in a voice channel on the server",
		defaultMemberPermissions: Deafen.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Deafen.mutualPermissions))
	public async deafen(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.messages.noReason,
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

		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.SERVER_DEAFEN_USER_ADD,
			actionOptions: {
				pastTense: "server deafened",
				pendingExecution: () => target.voice.setDeaf(true, auditReason)
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Undeafen a user in a voice channel on the server",
		defaultMemberPermissions: Deafen.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions([PermissionFlagsBits.MuteMembers]))
	public async undeafen(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.messages.noReason,
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

		const auditReason = ActionManager.generateAuditReason(interaction, reason);

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.SERVER_DEAFEN_USER_REMOVE,
			actionOptions: {
				pastTense: "server undeafened",
				pendingExecution: () => target.voice.setDeaf(false, auditReason)
			}
		});
	}
}
