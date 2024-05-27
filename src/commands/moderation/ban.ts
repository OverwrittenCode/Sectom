import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { DurationSlashOption } from "~/helpers/decorators/slashOptions/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

const mutualPermissions = [PermissionFlagsBits.BanMembers];

@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Ban {
	@Slash({
		dmPermission: false,
		description: "Ban a user from the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async ban(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.USER })
		target: User | GuildMember,
		@DurationSlashOption({
			transformerOptions: CommandUtils.DurationLimits.Ban,
			name: "prune_messages_duration",
			descriptionPrefix: "The duration the prune messages",
			required: false
		})
		msDuration: number | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is already banned.",
				ephemeral: true
			});
		}

		const auditReason = ActionManager.generateAuditReason(interaction, reason);
		const deleteMessageSeconds = msDuration ? msDuration / 1000 : undefined;

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.BAN_USER_ADD,
			actionOptions: {
				pastTense: "banned",
				checkPossible: (guildMember) => guildMember.bannable,
				pendingExecution: () =>
					interaction.guild.members.ban(target.id, { reason: auditReason, deleteMessageSeconds })
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Ban a user to prune their messages and then immediately unban them from the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async softban(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.USER })
		target: User | GuildMember,
		@DurationSlashOption({
			transformerOptions: {
				max: "7d"
			},
			name: "prune_messages_duration",
			descriptionPrefix: "The duration to prune messages"
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is already banned.",
				ephemeral: true
			});
		}

		const auditReason = `[SOFT BAN] ${ActionManager.generateAuditReason(interaction, reason)}`;
		const deleteMessageSeconds = msDuration / 1000;

		return ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.SOFT_BAN_USER_SET,
			actionOptions: {
				pastTense: "soft banned",
				checkPossible: (guildMember) => guildMember.bannable,
				pendingExecution: async () => {
					await interaction.guild.members.ban(target.id, {
						reason: auditReason,
						deleteMessageSeconds
					});

					await interaction.guild.members.unban(target.id, auditReason);
				}
			}
		});
	}

	@Slash({
		dmPermission: false,
		description: "Unban a user from the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async unban(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.USER })
		target: User | GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (!isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is not banned.",
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
			actionType: ActionType.BAN_USER_REMOVE,
			actionOptions: {
				pastTense: "unbanned",
				pendingExecution: () => interaction.guild.members.unban(target.id, auditReason)
			}
		});
	}

	private async isTargetBanned(interaction: ChatInputCommandInteraction<"cached">, target: User | GuildMember) {
		const banList = await interaction.guild.bans.fetch();
		return banList.has(target.id);
	}
}
