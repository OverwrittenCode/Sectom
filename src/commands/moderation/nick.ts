import { NO_REASON } from "@constants";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ReasonSlashOption } from "@helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "@helpers/guards/BotRequiredPermissions.js";
import { ActionModerationManager } from "@models/framework/manager/ActionModerationManager.js";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "@utils/interaction.js";
import {
	ApplicationCommandOptionType,
	type ChatInputCommandInteraction,
	type GuildMember,
	PermissionFlagsBits,
	inlineCode,
	userMention
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";

const mutualPermissions = [PermissionFlagsBits.ManageNicknames];

@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
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
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD]
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
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: CaseActionType.NICK_USER_SET,
			messageContent: `Successfully nicknamed ${userMention(target.id)} as ${inlineCode(nickname)}.`,
			actionOptions: {
				pendingExecution: () => target.setNickname(nickname, auditReason)
			}
		});
	}

	@Slash({ description: "reset the nickname of a member in the server" })
	public reset(
		@TargetSlashOption({
			entityType: EntityType.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!target.nickname) {
			return InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user does not have a nickname set.",
				ephemeral: true
			});
		}

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: CaseActionType.NICK_USER_RESET,
			actionOptions: {
				pastTense: "reset the nickname of",
				pendingExecution: () => target.setNickname(null, auditReason)
			}
		});
	}
}
