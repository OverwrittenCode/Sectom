import { COMMAND_ENTITY_TYPE, NO_REASON } from "@constants";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ReasonSlashOption } from "@helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "@helpers/guards/BotRequiredPermissions.js";
import { DurationTransformer } from "@helpers/transformers/Duration.js";
import { ActionModerationManager } from "@managers/ActionModerationManager.js";
import { CaseActionType, EntityType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";
import { Discord, Guard, Slash, SlashOption } from "discordx";

const mutualPermissions = [PermissionFlagsBits.BanMembers];

@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
export abstract class Ban {
	@Slash({ description: "Ban a user from the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async ban(
		@TargetSlashOption({ entityType: COMMAND_ENTITY_TYPE.USER })
		target: User | GuildMember,
		@SlashOption({
			description: "The duration to prune messages. Ex: (30m, 1h, 1 day)",
			name: "prune_messages_duration",
			type: ApplicationCommandOptionType.String,
			transformer: DurationTransformer({ max: "7d" })
		})
		msDuration: number | undefined,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
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

	@Slash({
		description: "Ban a user to prune their messages and then immediately unban them from the server",
		defaultMemberPermissions: mutualPermissions
	})
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async softban(
		@TargetSlashOption({ entityType: COMMAND_ENTITY_TYPE.USER })
		target: User | GuildMember,
		@SlashOption({
			description: "The duration to prune messages. Ex: (30m, 1h, 1 day)",
			name: "prune_messages_duration",
			type: ApplicationCommandOptionType.String,
			required: true,
			transformer: DurationTransformer({ max: "7d" })
		})
		msDuration: number,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
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

	@Slash({ description: "Unban a user from the server", defaultMemberPermissions: mutualPermissions })
	@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
	public async unban(
		@TargetSlashOption({ entityType: COMMAND_ENTITY_TYPE.USER })
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
