import { ActionType } from "@prisma/client";
import { EmbedBuilder, Events, GuildEmoji } from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import {
	AbstractClazzFeatOptions,
	DiscordEventLogManager,
	MutualEventLogOptionOptions
} from "~/models/framework/managers/DiscordEventLogManager.js";

@Discord()
export abstract class EmojiLog {
	private static readonly mutualBasedOptions: MutualEventLogOptionOptions<GuildEmoji> = {
		name: true,
		id: true,
		animated: true,
		identifier: true,
		url: true
	};

	@On({ event: Events.GuildEmojiCreate })
	public emojiCreate([emoji]: ArgsOf<Events.GuildEmojiCreate>) {
		return this.emojiFeat({ clazz: emoji, actionType: ActionType.DISCORD_EMOJI_CREATE });
	}

	@On({ event: Events.GuildEmojiDelete })
	public emojiDelete([emoji]: ArgsOf<Events.GuildEmojiDelete>) {
		return this.emojiFeat({ clazz: emoji, actionType: ActionType.DISCORD_EMOJI_DELETE });
	}

	@On({ event: Events.GuildEmojiUpdate })
	public emojiUpdate([oldEmoji, newEmoji]: ArgsOf<Events.GuildEmojiUpdate>) {
		const embed = this.generateEmbed(newEmoji);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldEmoji,
			new: newEmoji,
			actionType: ActionType.DISCORD_EMOJI_UPDATE,
			options: EmojiLog.mutualBasedOptions
		});
	}

	private emojiFeat(options: AbstractClazzFeatOptions<GuildEmoji>) {
		const { clazz, actionType } = options;

		const embed = this.generateEmbed(clazz);

		return DiscordEventLogManager.featHandler({
			embeds: [embed],
			clazz,
			actionType,
			options: EmojiLog.mutualBasedOptions
		});
	}

	private generateEmbed(emoji: GuildEmoji): EmbedBuilder {
		const embed = new EmbedBuilder()
			.setAuthor({ name: emoji.name!, iconURL: emoji.imageURL() ?? void 0 })
			.setThumbnail(emoji.imageURL())
			.setFooter({ text: `Emoji ID: ${emoji.id}` });

		return embed;
	}
}
