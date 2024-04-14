import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, GuildMember, User } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";

@Discord()
@Category(COMMAND_CATEGORY.MISC)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({
	description: "Display the avatar of a user",
	name: "avatar"
})
@SlashGroup("avatar")
export abstract class Avatar {
	private sizeURLSuffix = "?size=4096";
	@Slash({ description: "Display the server avatar of a user or global avatar otherwise" })
	public server(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD, COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE])
		target: GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!target) {
			target = interaction.member;
		}

		const name = target.nickname ?? target.displayName;

		const iconURL = target.displayAvatarURL();

		const embed = new EmbedBuilder().setAuthor({ name, iconURL }).setImage(iconURL + this.sizeURLSuffix);

		InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}

	@Slash({ description: "Display the global avatar of a user" })
	public global(
		@TargetSlashOption([COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE])
		target: User | GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		target = interaction.client.users.resolve(target ?? interaction.user)!;

		const { displayName: name } = target;

		const iconURL = target.displayAvatarURL();

		const embed = new EmbedBuilder().setAuthor({ name, iconURL }).setImage(iconURL + this.sizeURLSuffix);

		InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}
}
