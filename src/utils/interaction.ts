import assert from "assert";

import {
	DiscordAPIError,
	DiscordjsError,
	DiscordjsErrorCodes,
	RESTJSONErrorCodes,
} from "discord.js";

import type { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";
import type {
	InteractionReplyOptions,
	InteractionResponse,
	Message,
} from "discord.js";

type ReplyOptions = InteractionReplyOptions & { ephemeral?: boolean };

export abstract class InteractionUtils {
	public static Messages = {
		NoData: "Nothing to view yet in this query selection.",
		NoReason: "No reason provided."
	} as const;
	public static async replyOrFollowUp(
		interaction: Typings.DeferrableGuildInteraction,
		replyOptions: ReplyOptions
	): Promise<null | Message<boolean> | InteractionResponse<boolean>> {
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
				err instanceof DiscordAPIError &&
				(err.code === RESTJSONErrorCodes.UnknownInteraction || err.code === RESTJSONErrorCodes.UnknownMessage);

			if (unexpectedAlready || unknownInteractionOrMessage) {
				const { flags, ...messageOptions } = replyOptions;
				return await interaction.channel.send(messageOptions);
			}

			throw err;
		}
	}

	public static async replyNoData(interaction: Typings.DeferrableGuildInteraction, ephemeral: boolean = true) {
		return await this.replyOrFollowUp(interaction, {
			content: this.Messages.NoData,
			ephemeral
		});
	}
}
