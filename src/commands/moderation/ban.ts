import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, EntityType } from "@prisma/client";
import { PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { DurationSlashOption } from "~/helpers/decorators/slash/duration.js";
import { ReasonSlashOption } from "~/helpers/decorators/slash/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slash/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
export abstract class Ban {
	private static readonly mutualPermissions = [PermissionFlagsBits.BanMembers];

	@Slash({
		dmPermission: false,
		description: "Ban a user from the server",
		defaultMemberPermissions: Ban.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Ban.mutualPermissions))
	public async ban(
		@TargetSlashOption({ entityType: CommandUtils.entityType.USER })
		target: User | GuildMember,
		@DurationSlashOption({
			transformerOptions: CommandUtils.durationLimits.Ban,
			name: "prune_messages_duration",
			descriptionPrefix: "The duration the prune messages",
			required: false
		})
		msDuration: number | undefined,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		await this.validateBanStatus(interaction, target, false);

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
		defaultMemberPermissions: Ban.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Ban.mutualPermissions))
	public async softban(
		@TargetSlashOption({ entityType: CommandUtils.entityType.USER })
		target: User | GuildMember,
		@DurationSlashOption({
			transformerOptions: CommandUtils.durationLimits.Ban,
			name: "prune_messages_duration",
			descriptionPrefix: "The duration to prune messages"
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		await this.validateBanStatus(interaction, target, false);

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
		defaultMemberPermissions: Ban.mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Ban.mutualPermissions))
	public async unban(
		@TargetSlashOption({ entityType: CommandUtils.entityType.USER })
		target: User | GuildMember,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		await this.validateBanStatus(interaction, target, true);

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

	private async validateBanStatus(
		interaction: ChatInputCommandInteraction<"cached">,
		target: User | GuildMember,
		shouldBeBanned: boolean
	): Promise<void> {
		const bool = await interaction.guild.bans
			.fetch(target.id)
			.then(() => true)
			.catch(() => false);

		if (bool !== shouldBeBanned) {
			throw new ValidationError(
				`I cannot perform this action: that user is ${shouldBeBanned ? "not" : "already"} banned`
			);
		}
	}
}
