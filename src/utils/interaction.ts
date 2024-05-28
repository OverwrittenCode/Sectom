import { defaultIds } from "@discordx/pagination";
import {
	ButtonStyle,
	DiscordAPIError,
	DiscordjsError,
	DiscordjsErrorCodes,
	RESTJSONErrorCodes,
	formatEmoji
} from "discord.js";

import type { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { PaginationOptions, PaginationType } from "@discordx/pagination";
import type {
	APIEmbedField,
	APIMessageComponentEmoji,
	InteractionReplyOptions,
	InteractionResponse,
	Message,
	MessageEditOptions,
	ModalSubmitInteraction
} from "discord.js";

interface ConstructCustomIdGeneratorOptions {
	baseID: string;
	messageComponentType: Enums.MessageComponentType;
	messageComponentFlags?: MessageComponentFlags[keyof MessageComponentFlags][];
}

type ReplyOptions = InteractionReplyOptions & { ephemeral?: boolean };

type ButtonPaginationPositions = "end" | "exit" | "next" | "previous" | "start";
type ButtonPaginationOptions = Required<
	Pick<Extract<PaginationOptions, { type: PaginationType.Button }>, ButtonPaginationPositions>
>;

type MessageComponentFlags = Omit<typeof InteractionUtils.MessageComponentIds, "Managed">;

type ConstructCustomIdGeneratorOutput<
	Prefix extends string[],
	Suffix extends string[],
	O extends ConstructCustomIdGeneratorOptions
> = Typings.Concatenate<
	[
		O["baseID"],
		O["messageComponentType"],
		...(O["messageComponentFlags"] extends any[] ? O["messageComponentFlags"] : []),
		...Prefix,
		...Suffix
	],
	typeof StringUtils.CustomIDFIeldBodySeperator
>;

type CustomIdPrefixRecordOutput<T extends string> = {
	[K in T]: {
		id: K;
		regex: RegExp;
	};
};

export abstract class InteractionUtils {
	public static MessageComponentIds = {
		CancelAction: "cancel_action",
		ConfirmAction: "confirm_action",
		OneTimeUse: "one_time_use",
		Managed: ["pagination"]
	} as const;

	public static Messages = {
		NoData: "Nothing to view yet in this query selection.",
		NoReason: "No reason provided."
	} as const;

	public static PaginationButtons = {
		end: {
			emoji: { name: "⏩" },
			id: defaultIds.buttons.end,
			style: ButtonStyle.Secondary
		},
		exit: {
			emoji: { name: "❌" },
			id: defaultIds.buttons.exit,
			style: ButtonStyle.Danger
		},
		next: {
			emoji: { name: "▶️" },
			id: defaultIds.buttons.next,
			style: ButtonStyle.Primary
		},
		previous: {
			emoji: { name: "◀️" },
			id: defaultIds.buttons.previous,
			style: ButtonStyle.Primary
		},
		start: {
			emoji: { name: "⏪" },
			id: defaultIds.buttons.start,
			style: ButtonStyle.Secondary
		}
	} as const satisfies ButtonPaginationOptions;

	public static async replyOrFollowUp(
		interaction: Typings.DeferrableGuildInteraction,
		replyOptions: ReplyOptions
	): Promise<null | Message<boolean> | InteractionResponse<boolean>> {
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
				(err instanceof DiscordjsError && err.code === DiscordjsErrorCodes.InteractionAlreadyReplied) ||
				(err instanceof DiscordAPIError &&
					err.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged);

			const unknownInteractionOrMessage =
				err instanceof DiscordAPIError &&
				(err.code === RESTJSONErrorCodes.UnknownInteraction || err.code === RESTJSONErrorCodes.UnknownMessage);

			if (unexpectedAlready || unknownInteractionOrMessage) {
				return await this.replyOrFollowUp(interaction, replyOptions).catch(() => null);
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

	public static async deferInteraction(interaction: Typings.DeferrableGuildInteraction, ephemeral: boolean = false) {
		if (!interaction.replied && !interaction.deferred) {
			return await interaction.deferReply({ ephemeral }).catch();
		}
	}

	public static customIdPrefixRecords<const T extends string>(
		...customIds: T[]
	): Typings.Prettify<CustomIdPrefixRecordOutput<T>> {
		return customIds.reduce((acc, id) => {
			acc[id] = {
				id,
				regex: new RegExp(`^${id}`)
			};
			return acc;
		}, {} as CustomIdPrefixRecordOutput<T>);
	}

	public static constructCustomIdGenerator<
		const Options extends ConstructCustomIdGeneratorOptions,
		const Prefix extends string[]
	>(options: Options, ...prefixStr: Prefix) {
		return function generateCustomId<const Suffix extends string[]>(
			...suffixStr: Suffix
		): ConstructCustomIdGeneratorOutput<Prefix, Suffix, Options> {
			const input = [
				options.baseID,
				options.messageComponentType,
				...(options.messageComponentFlags || []),
				...(prefixStr || []),
				...(suffixStr || [])
			].filter(Boolean);

			return StringUtils.concatenate(
				StringUtils.CustomIDFIeldBodySeperator,
				...input
			) as ConstructCustomIdGeneratorOutput<Prefix, Suffix, Options>;
		};
	}

	public static modalSubmitToEmbedFIelds(interaction: ModalSubmitInteraction<"cached">): APIEmbedField[] {
		const textInputComponents = [...interaction.fields.fields.toJSON().values()].filter(({ value }) => !!value);

		const fields: APIEmbedField[] = textInputComponents.map(({ customId, value }) => ({
			name: customId.replaceAll("_", " ").replace(/(^\w|\s\w)/g, (m) => m.toUpperCase()),
			value
		}));

		return fields;
	}

	public static async disableComponents(
		message: Message,
		options: Omit<MessageEditOptions, "components"> = {}
	): Promise<InteractionResponse<boolean> | Message<boolean> | null> {
		const disabledComponents = ObjectUtils.cloneObject(message.components).map((data) => ({
			...data,
			components: data.components.map((c) => ({ ...c, disabled: true }))
		}));

		return await message
			.edit({
				...options,
				components: disabledComponents
			})
			.catch(() => null);
	}

	public static emojiMention(emoji: APIMessageComponentEmoji): string {
		return emoji.id ? formatEmoji(emoji.id, emoji.animated) : emoji.name!;
	}

	public static isValidEmoji(interaction: Typings.GuildInteraction, emojiIdOrSymbol: string): boolean {
		return Boolean(
			StringUtils.Regexes.UnicodeEmoji.test(emojiIdOrSymbol) || interaction.client.emojis.resolve(emojiIdOrSymbol)
		);
	}
}
