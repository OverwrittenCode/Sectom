import assert from "assert";

import { Colors, EmbedBuilder, bold, unorderedList } from "discord.js";
import { type GuardFunction } from "discordx";

import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ButtonInteraction, CommandInteraction, PermissionResolvable } from "discord.js";

type BotPermissions = PermissionFlags[keyof PermissionFlags];

export function BotRequiredPermissions(permissions: BotPermissions[]): GuardFunction<CommandInteraction> {
	const description = "I cannot perform this action: insufficient permissions.";

	const missingPermissionEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription(description);

	const guard: GuardFunction<CommandInteraction> = async (interaction, client, next) => {
		assert(
			interaction.isChatInputCommand() &&
				interaction.command &&
				interaction.channel &&
				interaction.inCachedGuild()
		);

		const permissionChannelId =
			interaction.options.data
				.flatMap((data) =>
					data.options
						? data.options.some((o) => !!o.options)
							? data.options.flatMap((o) => o.options ?? [o])
							: data.options
						: [data]
				)
				.find((data) => data.name === COMMAND_OPTION_NAME_CHANNEL_PERMISSION)
				?.value?.toString() ?? interaction.channelId;

		const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

		const myCurrentPermissions = me.permissionsIn(permissionChannelId);
		const missingPermissions = unorderedList(myCurrentPermissions.missing(permissions).map((str) => bold(str)));

		if (missingPermissions) {
			missingPermissionEmbed.addFields({
				name: "My Missing Permissions",
				value: missingPermissions
			});

			return await InteractionUtils.replyOrFollowUp(interaction, {
				embeds: [missingPermissionEmbed]
			});
		}

		await next();
	};

	return guard;
}
