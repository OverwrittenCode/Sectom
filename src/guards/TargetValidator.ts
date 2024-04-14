import { COMMAND_TARGET_OPTION_DESCRIPTION, SNOWFLAKE_REGEX } from "@constants";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { CommandUtils } from "@utils/command.js";
import { InteractionUtils } from "@utils/interaction.js";
import { StringUtils } from "@utils/string.js";
import type { CommandInteraction } from "discord.js";
import { ApplicationCommandOptionType } from "discord.js";
import { type GuardFunction } from "discordx";

const TargetCommandOptionTypes = [
	ApplicationCommandOptionType.User,
	ApplicationCommandOptionType.Role,
	ApplicationCommandOptionType.Channel,
	ApplicationCommandOptionType.Mentionable
] as const;

interface TargetData {
	description: string;
	type: (typeof TargetCommandOptionTypes)[number];
	value: string;
}

export const TargetValidator: GuardFunction<CommandInteraction> = async (interaction, client, next) => {
	if (!("commandId" in interaction)) {
		await next();
	} else {
		if (interaction.isChatInputCommand() && interaction.inCachedGuild() && interaction.command) {
			const { guild, member, client, command } = interaction;

			const permissionChannelOptionName = command.options.flatMap((data) =>
				"options" in data && !!data.options ? data.options.flat(2) : [data]
			);

			const targetData = CommandUtils.retrieveCommandInteractionOption(interaction)
				.map(({ type, name, value }) => ({
					description: permissionChannelOptionName.find((option) => option.name === name)?.description,
					type,
					value
				}))
				.filter(
					({ description, type, value }) =>
						description?.includes(COMMAND_TARGET_OPTION_DESCRIPTION) &&
						TargetCommandOptionTypes.some((targetType) => targetType === type) &&
						StringUtils.isValidString(value)
				) as TargetData[];

			if (targetData.length) {
				const {
					members: { cache: memberCache },
					roles: { cache: roleCache }
				} = guild;

				const isInvalidSnowflakeID = targetData.some(({ value }) => !SNOWFLAKE_REGEX.test(value));

				if (isInvalidSnowflakeID) {
					return await InteractionUtils.replyOrFollowUp(interaction, {
						content: "Argument Error: invalid snowflakeId provided, please check your input.",
						ephemeral: true
					});
				}

				const userTypeFilter = (data: TargetData) => data.type === ApplicationCommandOptionType.User;

				const isNotInGuild = targetData.some(
					({ description, value }) =>
						description.includes(COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD) &&
						!guild.members.resolve(value) &&
						!guild.roles.resolve(value) &&
						!guild.channels.resolve(value)
				);

				if (isNotInGuild) {
					return await InteractionUtils.replyOrFollowUp(interaction, {
						content: "I cannot perform this action: given mention does not exist on the server.",
						ephemeral: true
					});
				}

				const isNotPassiveTarget = targetData.some(
					(data) =>
						userTypeFilter(data) && !data.description.includes(COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE)
				);

				if (isNotPassiveTarget) {
					const isSelfPunishment = targetData.some(
						(data) => userTypeFilter(data) && data.value === interaction.user.id
					);

					if (isSelfPunishment) {
						return await InteractionUtils.replyOrFollowUp(interaction, {
							content: "I cannot perform this action: target must not be yourself.",
							ephemeral: true
						});
					}

					const isGuildOwnerPunishment = targetData.some(
						(data) => userTypeFilter(data) && guild.ownerId === data.value
					);

					if (isGuildOwnerPunishment) {
						return await InteractionUtils.replyOrFollowUp(interaction, {
							content: "I cannot perform this action: target must not be the server owner.",
							ephemeral: true
						});
					}

					const isBotPunishment = targetData.some(
						(data) =>
							userTypeFilter(data) &&
							(client.user.id === data.value ||
								memberCache.some((m) => m.user.bot && m.id === data.value))
					);

					if (isBotPunishment) {
						return await InteractionUtils.replyOrFollowUp(interaction, {
							content: "I cannot perform this action: target must not be a bot.",
							ephemeral: true
						});
					}

					const targetHighestPositions = targetData.map((data) =>
						data.type === ApplicationCommandOptionType.Role
							? memberCache.get(data.value)?.roles.highest.position ?? -1
							: roleCache.get(data.value)?.position ?? -1
					);
					const myHighestRolePosition = interaction.guild.members.me!.roles.highest.position;
					const userHighestRolePosition = member.roles.highest.position;

					const isHigherThanMyRole = targetHighestPositions.some(
						(rolePosition) => rolePosition >= myHighestRolePosition
					);

					const isHigherThanUserRole = targetHighestPositions.some(
						(rolePosition) => rolePosition >= userHighestRolePosition
					);

					const disparityPossessive = isHigherThanMyRole ? "my" : isHigherThanUserRole ? "your" : null;

					if (disparityPossessive) {
						return await InteractionUtils.replyOrFollowUp(interaction, {
							content: `I cannot perform this action: target's highest role position must be lower than ${disparityPossessive} highest role position.`,
							ephemeral: true
						});
					}
				}
			}
		}

		await next();
	}
};
