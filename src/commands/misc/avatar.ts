import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { EmbedBuilder, GuildMember, User } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";

import { LIGHT_GOLD } from "~/constants";
import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";

import type { ChatInputCommandInteraction } from "discord.js";

@Discord()
@Category(Enums.CommandCategory.Misc)
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
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
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

		return InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}

	@Slash({ description: "Display the global avatar of a user" })
	public global(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | undefined,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		target ??= interaction.member;

		const colour = target instanceof GuildMember ? target.displayHexColor : target.hexAccentColor ?? LIGHT_GOLD;

		if (!(target instanceof User)) {
			target = target.user;
		}

		const { displayName: name } = target;

		const iconURL = target.displayAvatarURL();

		const embed = new EmbedBuilder()
			.setAuthor({ name, iconURL })
			.setColor(colour)
			.setImage(iconURL + this.sizeURLSuffix);

		return InteractionUtils.replyOrFollowUp(interaction, {
			embeds: [embed]
		});
	}
}
