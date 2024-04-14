import { NO_REASON } from "@constants";
import { ReasonSlashOption } from "@decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType, EntityType } from "@prisma/client";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { Discord, Guard, Slash, SlashOption } from "discordx";
import { BotRequiredPermissions } from "src/guards/BotRequiredPermissions.js";

import { ActionModerationManager } from "../../models/framework/manager/ActionModerationManager.js";

@Discord()
@Category("Moderation")
export abstract class Ban {
	@Slash({ description: "Ban a user from the server" })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(["BanMembers"]))
	public async ban(
		@TargetSlashOption()
		target: User | GuildMember,
		@SlashOption({
			description: "The duration to prune messages. Ex: (30m, 1h, 1 day).",
			name: "prune_messages_duration",
			type: ApplicationCommandOptionType.String
		})
		prune_messages_duration: string | undefined,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const msDuration = prune_messages_duration
			? await ActionModerationManager.validateMsDuration(interaction, {
					duration: prune_messages_duration,
					max: "7d"
				})
			: undefined;

		if (msDuration === null) {
			return;
		}

		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is already banned.",
				ephemeral: true
			});
		}

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);
		const actionType = CaseActionType.BANNED_USER_ADDED;
		const deleteMessageSeconds = msDuration ? msDuration / 1000 : undefined;

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
			actionOptions: {
				pastTense: "banned",
				checkPossible: (guildMember) => guildMember.bannable,
				pendingExecution: () =>
					interaction.guild.members.ban(target.id, { reason: auditReason, deleteMessageSeconds })
			}
		});
	}

	@Slash({ description: "Ban a user to prune their messages and then immediately unban them from the server" })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(["BanMembers"]))
	public async softban(
		@TargetSlashOption()
		target: User | GuildMember,
		@SlashOption({
			description: "The duration to prune messages. Ex: (30m, 1h, 1 day).",
			name: "prune_messages_duration",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		prune_messages_duration: string,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const msDuration = await ActionModerationManager.validateMsDuration(interaction, {
			duration: prune_messages_duration,
			max: "7d"
		});

		if (msDuration === null) {
			return;
		}

		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is already banned.",
				ephemeral: true
			});
		}

		const auditReason = `[SOFT BAN] ${ActionModerationManager.generateAuditReason(interaction, reason)}`;
		const actionType = CaseActionType.SOFT_BANNED_USER;
		const deleteMessageSeconds = msDuration / 1000;

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
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

	@Slash({ description: "Unban a user from the server" })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(["BanMembers"]))
	public async unban(
		@TargetSlashOption()
		target: User | GuildMember,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const isTargetBanned = await this.isTargetBanned(interaction, target);
		if (!isTargetBanned) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: that user is not banned.",
				ephemeral: true
			});
		}

		const auditReason = ActionModerationManager.generateAuditReason(interaction, reason);
		const actionType = CaseActionType.BANNED_USER_REMOVED;

		return ActionModerationManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType,
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
