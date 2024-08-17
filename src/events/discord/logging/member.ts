import { ActionType } from "@prisma/client";
import { EmbedBuilder, Events, GuildMember } from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import { DiscordEventLogManager } from "~/models/framework/managers/DiscordEventLogManager.js";
import { Enums } from "~/ts/Enums.js";

@Discord()
export abstract class Member {
	@On({ event: Events.GuildMemberAdd })
	public memberAdd([_member]: ArgsOf<Events.GuildMemberAdd>) {}

	@On({ event: Events.GuildMemberUpdate })
	public memberUpdate([oldMember, newMember]: ArgsOf<Events.GuildMemberUpdate>) {
		const embed = this.generateEmbed(newMember, Enums.ModifierType.Update);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldMember,
			new: newMember,
			actionType: ActionType.DISCORD_MEMBER_UPDATE,
			options: {
				roles: true,
				nickname: true,
				communicationDisabledUntil() {
					return {
						name: "Timeout Expires At"
					};
				}
			}
		});
	}

	@On({ event: Events.GuildMemberRemove })
	public memberRemove([_member]: ArgsOf<Events.GuildMemberRemove>) {}

	private generateEmbed(member: GuildMember, modifierType: Enums.ModifierType): EmbedBuilder {
		const descriptionSuffix =
			modifierType === Enums.ModifierType.Add
				? "joined the server"
				: modifierType === Enums.ModifierType.Remove
					? "left the server"
					: "been updated";

		const embed = new EmbedBuilder()
			.setAuthor({ name: member.user.username, iconURL: member.displayAvatarURL() })
			.setThumbnail(member.displayAvatarURL())
			.setDescription(`${member} has ${descriptionSuffix}`)
			.setFooter({ text: `User ID: ${member.id}` });

		return embed;
	}
}
