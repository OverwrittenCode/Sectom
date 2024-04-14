import assert from "assert";

import { NO_DATA_MESSAGE } from "@constants";
import type { Typings } from "@ts/Typings.js";
import { DiscordAPIError, DiscordjsError, DiscordjsErrorCodes, type InteractionReplyOptions } from "discord.js";

type ReplyOptions = InteractionReplyOptions & { ephemeral?: boolean };

export abstract class InteractionUtils {
	public static async replyOrFollowUp(interaction: Typings.GuildInteraction, replyOptions: ReplyOptions) {
		assert(interaction.channel);
		try {
			if (interaction.replied) {
				return await interaction.followUp(replyOptions);
			}

			if (interaction.deferred) {
				const { ephemeral, ...editReplyOptions } = replyOptions;

				return await interaction.editReply(editReplyOptions);
			}

			return await interaction.reply(replyOptions);
		} catch (err) {
			const unexpectedAlready =
				err instanceof DiscordjsError && err.code === DiscordjsErrorCodes.InteractionAlreadyReplied;

			const unknownInteractionOrMessage =
				err instanceof DiscordAPIError && (err.code === 10062 || err.code === 10008);

			if (unexpectedAlready || unknownInteractionOrMessage) {
				const { flags, ...messageOptions } = replyOptions;
				return await interaction.channel.send(messageOptions);
			}

			throw err;
		}
	}

	public static async replyNoData(interaction: Typings.GuildInteraction, ephemeral: boolean = true) {
		return await this.replyOrFollowUp(interaction, {
			content: NO_DATA_MESSAGE,
			ephemeral
		});
	}
}
