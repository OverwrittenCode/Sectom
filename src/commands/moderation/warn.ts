import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, CaseType, EntityType } from "@prisma/client";
import { PermissionFlagsBits, inlineCode } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import ms from "ms";

import { Case, CaseModifyType } from "~/commands/moderation/case.js";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";

import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({
	dmPermission: false,
	description: "Modify or list the infractions of a member in the server",
	name: "warn",
	defaultMemberPermissions: [PermissionFlagsBits.KickMembers]
})
@SlashGroup("warn")
export abstract class Warn {
	public static readonly minThreshold = 3;

	@Slash({ description: "Warn a member" })
	public async add(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.NoBot]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;
		const actionType = ActionType.WARN_USER_ADD;

		try {
			await DBConnectionManager.Prisma.$transaction(async (tx) => {
				await ActionManager.logCase({
					interaction,
					target: {
						id: target.id,
						type: EntityType.USER
					},
					reason,
					actionType,
					actionOptions: {
						pastTense: "warned"
					},
					tx
				});

				const warnings = await ActionManager.getCases(interaction, {
					guildId,
					targetId: target.id,
					action: actionType
				});

				if (warnings.length >= Warn.minThreshold) {
					const {
						configuration: { warning: warningConfiguration }
					} = await DBConnectionManager.Prisma.guild.fetchValidConfiguration({
						guildId,
						check: "warning"
					});

					const thresholdMatches = warningConfiguration.thresholds
						.sort((a, b) => a.threshold - b.threshold)
						.filter(({ threshold }) => warnings.length >= threshold);

					const firstThreshold = thresholdMatches[0];
					const nextThreshold = thresholdMatches[1];

					const repeatedOffences = nextThreshold
						? nextThreshold.threshold - firstThreshold!.threshold
						: firstThreshold
							? warnings.length - firstThreshold.threshold
							: 0;

					const punishmentDuration = firstThreshold?.duration
						? Math.min(
								warningConfiguration!.durationMultiplier ** repeatedOffences * firstThreshold.duration,
								ms(CommandUtils.durationLimits.Timeout.max)
							)
						: undefined;

					if (firstThreshold) {
						const autoPunishReason = `User reached ${inlineCode(warnings.length.toString())} warnings which triggered ${inlineCode(firstThreshold.punishment)}`;
						const auditReason = `${autoPunishReason}. Warning handed out by ${interaction.user.username} | ${interaction.user.id}`;

						let actionType: ActionType = firstThreshold.punishment;
						let checkPossible: (guildMember: GuildMember) => boolean;
						let pendingExecution: () => Promise<any>;

						switch (firstThreshold.punishment) {
							case ActionType.BAN_USER_ADD:
								checkPossible = (guildMember: GuildMember) => guildMember.bannable;
								pendingExecution = () =>
									interaction.guild.members.ban(target.id, { reason: auditReason });

								break;
							case ActionType.KICK_USER_SET:
								checkPossible = (guildMember: GuildMember) => guildMember.kickable;
								pendingExecution = () => target.kick(auditReason);

								break;
							case ActionType.TIME_OUT_USER_ADD:
								actionType = target.isCommunicationDisabled()
									? ActionType.TIME_OUT_USER_UPDATE
									: ActionType.TIME_OUT_USER_ADD;
								checkPossible = (guildMember: GuildMember) => guildMember.moderatable;
								pendingExecution = () => target.timeout(punishmentDuration!, auditReason);

								break;
							default:
								throw new Error("Unexpected punishment");
						}

						return await ActionManager.logCase({
							interaction,
							target: {
								id: target.id,
								type: EntityType.USER
							},
							reason: autoPunishReason,
							actionType,
							caseType: CaseType.AUTO,
							actionOptions: {
								checkPossible,
								pendingExecution
							},
							tx
						});
					}
				}
			});
		} catch (err) {
			await InteractionUtils.replyOrFollowUp(interaction, {
				content: "Action rollback due to internal error"
			});

			throw err;
		}
	}

	@Slash({ description: "Edit a warn case. Internally calls /case edit" })
	public async edit(
		@Case.IDSlashOption()
		caseID: string | undefined,
		@ReasonSlashOption({ isAmmended: true, required: true })
		newReason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Case.modify({
			interaction,
			caseID,
			type: CaseModifyType.EDIT,
			reason: newReason
		});
	}

	@Slash({ description: "List the warnings of a user. Internally calls /case list" })
	public list(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive, Enums.CommandSlashOptionTargetFlags.NoBot]
		})
		target: User | GuildMember,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return ActionManager.listCases(interaction, {
			guildId: interaction.guildId,
			targetId: target.id,
			action: ActionType.WARN_USER_ADD
		});
	}

	@Slash({ description: "Remove a warn from a user" })
	public async remove(
		@Case.IDSlashOption()
		caseID: string | undefined,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return Case.modify({
			interaction,
			caseID,
			type: CaseModifyType.REMOVE,
			reason
		});
	}
}
