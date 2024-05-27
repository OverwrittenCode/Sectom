import assert from "assert";

import { Colors, EmbedBuilder, bold, unorderedList } from "discord.js";
import { type GuardFunction } from "discordx";

import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ButtonInteraction, CommandInteraction, PermissionResolvable } from "discord.js";

export function BotRequiredPermissions<T = CommandInteraction>(permissions: PermissionResolvable[]): GuardFunction<T> {
	const description = "I cannot perform this action: insufficient permissions.";

	const missingPermissionEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription(description);

	const guard: GuardFunction<CommandInteraction | ButtonInteraction> = async (interaction, client, next) => {
		assert(
			interaction.inCachedGuild() &&
				interaction.channel &&
				(!interaction.isChatInputCommand() || interaction.command)
		);

		let permissionChannelId = interaction.channelId;

		if (interaction.isChatInputCommand()) {
			permissionChannelId =
				CommandUtils.retrieveCommandInteractionOptions(interaction)
					.find((data) => data.name === CommandUtils.SlashOptions.ChannelPermissionName)
					?.value?.toString() ?? interaction.channelId;
		}

		const me = await interaction.guild.members.fetchMe();

		const myCurrentPermissions = me.permissionsIn(permissionChannelId);
		const missingPermissions = unorderedList(myCurrentPermissions.missing(permissions).map((str) => bold(str)));

		if (missingPermissions) {
			missingPermissionEmbed.addFields({
				name: "My Missing Permissions",
				value: missingPermissions
			});

			return await InteractionUtils.replyOrFollowUp(interaction, {
				embeds: [missingPermissionEmbed],
				ephemeral: !interaction.isChatInputCommand()
			});
		}

		await next();
	};

	return guard as GuardFunction<T>;
}
