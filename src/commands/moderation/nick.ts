import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import {
	ApplicationCommandOptionType,
	type ChatInputCommandInteraction,
	type GuildMember,
	PermissionFlagsBits,
	inlineCode
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Nick.mutualPermissions))
@SlashGroup({
	dmPermission: false,
	description: "Set or reset the nickname of a member in the server",
	name: "nick",
	defaultMemberPermissions: Nick.mutualPermissions
})
@SlashGroup("nick")
export abstract class Nick {
	private static readonly mutualPermissions = [PermissionFlagsBits.ManageNicknames];

	@Slash({ dmPermission: false, description: "Reset the nickname of a member in the server" })
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
			throw new ValidationError("I cannot perform this action: that user does not have a nickname set.");
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

	@Slash({ dmPermission: false, description: "Set the nickname of a member in the server" })
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
			successContent: `nicknamed ${target.toString()} as ${inlineCode(nickname)}`,
			actionOptions: {
				pendingExecution: () => target.setNickname(nickname, auditReason)
			}
		});
	}
}
