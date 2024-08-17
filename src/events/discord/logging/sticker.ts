import { ActionType } from "@prisma/client";
import { EmbedBuilder, Events, Sticker, StickerFormatType } from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import {
	AbstractClazzFeatOptions,
	DiscordEventLogManager,
	MutualEventLogOptionOptions
} from "~/models/framework/managers/DiscordEventLogManager.js";

@Discord()
export abstract class StickerLog {
	private static readonly mutualBasedOptions: MutualEventLogOptionOptions<Sticker> = {
		name: true,
		description: true,
		tags: true,
		format: StickerFormatType
	};

	@On({ event: Events.GuildStickerCreate })
	public stickerCreate([sticker]: ArgsOf<Events.GuildStickerCreate>) {
		return this.stickerFeat({
			clazz: sticker,
			actionType: ActionType.DISCORD_STICKER_CREATE
		});
	}

	@On({ event: Events.GuildStickerDelete })
	public stickerDelete([sticker]: ArgsOf<Events.GuildStickerDelete>) {
		return this.stickerFeat({
			clazz: sticker,
			actionType: ActionType.DISCORD_STICKER_DELETE
		});
	}

	@On({ event: Events.GuildStickerUpdate })
	public stickerUpdate([oldSticker, newSticker]: ArgsOf<Events.GuildStickerUpdate>) {
		if (!(oldSticker.guild && newSticker.guild)) {
			return;
		}

		const embed = this.generateEmbed(newSticker);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldSticker,
			new: newSticker,
			actionType: ActionType.DISCORD_STICKER_UPDATE,
			options: StickerLog.mutualBasedOptions
		});
	}

	private stickerFeat(options: AbstractClazzFeatOptions<Sticker>) {
		const { clazz, actionType } = options;

		const embed = this.generateEmbed(clazz);

		return DiscordEventLogManager.featHandler({
			embeds: [embed],
			clazz,
			actionType,
			options: StickerLog.mutualBasedOptions
		});
	}

	private generateEmbed(sticker: Sticker): EmbedBuilder {
		const embed = new EmbedBuilder()
			.setAuthor({ name: sticker.name, iconURL: sticker.url })
			.setThumbnail(sticker.url)
			.setFooter({ text: `Sticker ID: ${sticker.id}` });

		return embed;
	}
}
