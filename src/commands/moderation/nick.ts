import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import {
	ApplicationCommandOptionType,
	PermissionFlagsBits,
	inlineCode,
	userMention,
	type ChatInputCommandInteraction,
	type GuildMember
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

const mutualPermissions = [PermissionFlagsBits.ManageNicknames];

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
@SlashGroup({
	description: "set or reset the nickname of a member in the server",
	name: "nick",
	defaultMemberPermissions: mutualPermissions
})
@SlashGroup("nick")
export abstract class Nick {
	@Slash({ description: "set the nickname of a member in the server" })
	public set(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@SlashOption({
			description: "The nickname to set",
			name: "nickname",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		nickname: string,
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
			actionType: ActionType.NICK_USER_SET,
			successContent: `nicknamed ${userMention(target.id)} as ${inlineCode(nickname)}`,
			actionOptions: {
				pendingExecution: () => target.setNickname(nickname, auditReason)
			}
		});
	}

	@Slash({ description: "reset the nickname of a member in the server" })
	public reset(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!target.nickname) {
			return InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user does not have a nickname set.",
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
			actionType: ActionType.NICK_USER_RESET,
			actionOptions: {
				pastTense: "reset the nickname of",
				pendingExecution: () => target.setNickname(null, auditReason)
			}
		});
	}
}
