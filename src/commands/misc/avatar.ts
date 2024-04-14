import assert from "node:assert";

import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, User } from "discord.js";
import { ApplicationCommandOptionType, EmbedBuilder } from "discord.js";
import { Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";

enum AvatarType {
	server = "server",
	global = "global"
}

@Discord()
@Category(COMMAND_CATEGORY.MISC)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Avatar {
	@Slash({ description: "Display the global or server avatar of a user" })
	public avatar(
		@SlashOption({
			description: "The user",
			name: "user",
			type: ApplicationCommandOptionType.User
		})
		user: User | undefined,
		@SlashChoice(AvatarType.server, AvatarType.global)
		@SlashOption({
			description: "Display the user's global avatar or server avatar",
			name: "type",
			type: ApplicationCommandOptionType.String
		})
		type: `${AvatarType}` | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!user) {
			user = interaction.user;
		}
		const name = user.username;

		const sizeURLSuffix = "?size=4096";
		let iconURL: string;

		if (type == "global") {
			iconURL = user.displayAvatarURL();
		} else {
			const guildMember = interaction.guild.members.cache.get(user.id);
			assert(guildMember);
			iconURL = guildMember.displayAvatarURL();
		}

		const embed = new EmbedBuilder().setAuthor({ name, iconURL }).setImage(iconURL + sizeURLSuffix);

		InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}
}
