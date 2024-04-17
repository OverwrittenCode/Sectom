import assert from "assert";

import { COMMAND_DESCRIPTION_NEVER } from "@constants";
import { EmbedBuilder } from "@discordjs/builders";
import { InteractionUtils } from "@utils/interaction.js";
import type { CommandInteraction, PermissionFlags } from "discord.js";
import { Colors, bold, unorderedList } from "discord.js";
import { type GuardFunction } from "discordx";

type BotPermissions = PermissionFlags[keyof PermissionFlags];

export function BotRequiredPermissions(
	permissions: BotPermissions[],
	channelSlashOptionDescriptionSuffix: string = COMMAND_DESCRIPTION_NEVER
): GuardFunction<CommandInteraction> {
	const description = "I cannot perform this action: insufficient permissions.";

	const missingPermissionEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription(description);

	const guard: GuardFunction<CommandInteraction> = async (interaction, client, next) => {
		assert(
			interaction.isChatInputCommand() &&
				interaction.command &&
				interaction.channel &&
				interaction.inCachedGuild()
		);
		const { command, options } = interaction;

		const permissionChannelOptionName = command.options
			.flatMap((data) => ("options" in data && !!data.options ? data.options.flat(2)! : [data]))
			.find((data) => data.description.endsWith(channelSlashOptionDescriptionSuffix))?.name;

		const permissionChannelId =
			options.data
				.flatMap((data) =>
					data.options
						? data.options.some((o) => !!o.options)
							? data.options.flatMap((o) => o.options ?? [o])
							: data.options
						: [data]
				)
				.find((data) => data.name === permissionChannelOptionName)
				?.value?.toString() ?? interaction.channelId;

		const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

		const myCurrentPermissions = me.permissionsIn(permissionChannelId);
		const missingPermissions = unorderedList(myCurrentPermissions.missing(permissions).map((str) => bold(str)));

		if (missingPermissions) {
			missingPermissionEmbed.addFields([
				{
					name: "My Missing Permissions",
					value: missingPermissions
				}
			]);

			return await InteractionUtils.replyOrFollowUp(interaction, {
				embeds: [missingPermissionEmbed]
			});
		}

		await next();
	};

	return guard;
}
