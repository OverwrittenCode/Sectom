import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType, CaseType, EntityType } from "@prisma/client";
import { ApplicationCommandOptionType, PermissionFlagsBits, inlineCode } from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import ms from "ms";

import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({
	description: "hand out infractions to members in the server",
	name: "warn",
	defaultMemberPermissions: [PermissionFlagsBits.KickMembers]
})
@SlashGroup("warn")
export abstract class Warn {
	public static MinThreshold = 3;

	@Slash({ description: "Warn a user" })
	public async add(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild]
		})
		target: GuildMember,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;
		const actionType = ActionType.WARN_USER_ADD;

		try {
			await DBConnectionManager.Prisma.$transaction(async (tx) => {
				const actionedCase = await ActionManager.logCase({
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

				if (!actionedCase) {
					return;
				}

				const warnings = await ActionManager.getCases(interaction, {
					guildId,
					targetId: target.id,
					action: actionType
				});

				if (warnings.length >= Warn.MinThreshold) {
					let guildDoc: Typings.Database.Prisma.RetrieveModelDocument<"Guild">;

					const guildCacheRecord = await RedisCache.guild.get(guildId);

					if (!guildCacheRecord) {
						guildDoc = await DBConnectionManager.Prisma.guild.findUniqueOrThrow({
							where: {
								id: guildId
							}
						});
					} else {
						guildDoc = guildCacheRecord.data;
					}

					const warningConfiguration = guildDoc.configuration?.warning;

					const thresholdMatches = warningConfiguration?.thresholds
						.sort((a, b) => a.threshold - b.threshold)
						.filter(({ threshold }) => warnings.length >= threshold);

					const firstThreshold = thresholdMatches?.[0];
					const nextThreshold = thresholdMatches?.[1];

					const repeatedOffences = nextThreshold
						? nextThreshold.threshold - firstThreshold!.threshold
						: firstThreshold
							? warnings.length - firstThreshold.threshold
							: 0;

					const punishmentDuration = firstThreshold?.duration
						? Math.min(
								warningConfiguration!.durationMultiplier ** repeatedOffences * firstThreshold.duration,
								ms(CommandUtils.DurationLimits.Timeout.max)
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

	@Slash({ description: "Remove a warn from a user" })
	public async remove(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.USER })
		target: User | GuildMember,
		@SlashOption({
			description: "The warn case id. Defaults to the most recent.",
			name: "case_id",
			type: ApplicationCommandOptionType.String
		})
		caseID: string | undefined,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const caseRecord = await DBConnectionManager.Prisma.case.instanceMethods.retrieveCase({
			interaction,
			allowedActions: [ActionType.WARN_USER_ADD],
			caseID,
			targetId: target.id
		});

		return await ActionManager.logCase({
			interaction,
			target: {
				id: target.id,
				type: EntityType.USER
			},
			reason,
			actionType: ActionType.WARN_USER_REMOVE,
			actionOptions: {
				pastTense: "removed the warning from",
				pendingExecution: async () => {
					await DBConnectionManager.Prisma.case.delete({
						where: {
							id: caseRecord.id
						}
					});
				}
			}
		});
	}

	@Slash({ description: "Lists the warnings of a user" })
	public list(
		@TargetSlashOption({ entityType: CommandUtils.EntityType.USER })
		target: User | GuildMember,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;
		return ActionManager.listCases(interaction, {
			guildId,
			targetId: target.id,
			action: ActionType.WARN_USER_ADD
		});
	}
}
