import { COMMAND_ENTITY_TYPE, LIGHT_GOLD } from "@constants";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { TargetSlashOption } from "@helpers/decorators/slashOptions/target.js";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { ChatInputCommandInteraction, User } from "discord.js";
import { EmbedBuilder, GuildMember } from "discord.js";
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
		@TargetSlashOption({
			entityType: COMMAND_ENTITY_TYPE.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD, COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE]
		})
		target: GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		target ??= interaction.member;

		const name = target.nickname ?? target.displayName;

		const iconURL = target.displayAvatarURL();

		const embed = new EmbedBuilder()
			.setAuthor({ name, iconURL })
			.setColor(target.displayHexColor)
			.setImage(iconURL + this.sizeURLSuffix);

		InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}

	@Slash({ description: "Display the global avatar of a user" })
	public global(
		@TargetSlashOption({
			entityType: COMMAND_ENTITY_TYPE.USER,
			flags: [COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE]
		})
		target: User | GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		target ??= interaction.member;

		const colour = target instanceof GuildMember ? target.displayHexColor : target.hexAccentColor ?? LIGHT_GOLD;

		target = interaction.client.users.resolve(target)!;

		const { displayName: name } = target;

		const iconURL = target.displayAvatarURL();

		const embed = new EmbedBuilder()
			.setAuthor({ name, iconURL })
			.setColor(colour)
			.setImage(iconURL + this.sizeURLSuffix);

		InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}
}
