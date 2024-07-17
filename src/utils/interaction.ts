import assert from "assert";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	DiscordAPIError,
	DiscordjsError,
	DiscordjsErrorCodes,
	EmbedBuilder,
	RESTJSONErrorCodes,
	TimestampStyles,
	formatEmoji,
	time
} from "discord.js";
import ms from "ms";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type {
	APIActionRowComponent,
	APIButtonComponentWithCustomId,
	APIEmbedField,
	APIMessageComponentEmoji,
	ActionRow,
	ButtonInteraction,
	CacheType,
	InteractionReplyOptions,
	InteractionResponse,
	Message,
	MessageActionRowComponent,
	MessageEditOptions,
	ModalSubmitInteraction,
	ReadonlyCollection
} from "discord.js";

interface ConstructCustomIdGeneratorOptions {
	baseID: string;
	messageComponentType: Enums.MessageComponentType;
	messageComponentFlags?: MessageComponentFlags[keyof MessageComponentFlags][];
}

interface ConfirmationButtonOptions extends ReplyOptions {
	confirmLabel?: string;
	cancelLabel?: string;
	userIDs?: string[];
	notifyStatus?: boolean;
	multiplayerWaitingLobbyText?: string;
	resolveTime?: number;
	confirmationTimeFooterEmbedIndex?: number | null;
	confirmationTime?: number;
	isGame?: boolean;
}

interface DisableComponentRules {
	customIds?: string[];
	delete?: boolean;
}

interface DisableComponentOptions {
	messageEditOptions?: Omit<MessageEditOptions, "components">;
	rules?: DisableComponentRules;
}

type ReplyOptions = Typings.DisplaceObjects<InteractionReplyOptions, { ephemeral?: boolean | null }>;
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
		Multiplayer: "multiplayer",
		Managed: ["pagination"]
	} as const;

	public static Messages = {
		NoData: "Nothing to view yet in this query selection.",
		NoReason: "No reason provided."
	} as const;

	public static async replyOrFollowUp(
		interaction: Typings.DeferrableGuildInteraction,
		replyOptions: ReplyOptions & { fetchReply: true }
	): Promise<Message>;
	public static async replyOrFollowUp(
		interaction: Typings.DeferrableGuildInteraction,
		replyOptions: ReplyOptions
	): Promise<Message | InteractionResponse>;
	public static async replyOrFollowUp(
		interaction: Typings.DeferrableGuildInteraction,
		replyOptions: ReplyOptions
	): Promise<Message | InteractionResponse> {
		try {
			if (replyOptions.ephemeral === null) {
				replyOptions.ephemeral = interaction.ephemeral;
			}

			const options = replyOptions as InteractionReplyOptions;

			if (interaction.replied) {
				return await interaction.followUp(options);
			}

			if (interaction.deferred) {
				if (!interaction.ephemeral && replyOptions.ephemeral) {
					return await interaction.followUp(options);
				}

				const { ephemeral, ...editReplyOptions } = options;

				return await interaction.editReply(editReplyOptions);
			}

			return await interaction.reply(options);
		} catch (err) {
			const unknownInteractionOrMessage =
				err instanceof DiscordAPIError &&
				(err.code === RESTJSONErrorCodes.UnknownInteraction || err.code === RESTJSONErrorCodes.UnknownMessage);

			if (this.isDeferRaceCondition(err) || unknownInteractionOrMessage) {
				return await this.replyOrFollowUp(interaction, replyOptions).catch(() => {
					throw new ValidationError("Something went wrong.");
				});
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

	public static async deferInteraction(
		interaction: Typings.DeferrableGuildInteraction,
		ephemeralOrUpdate: boolean = false
	) {
		if (!interaction.replied && !interaction.deferred) {
			if (interaction.isButton() && ephemeralOrUpdate) {
				return await interaction.deferUpdate();
			}

			return await interaction.deferReply({ ephemeral: ephemeralOrUpdate }).catch(() => {});
		}
	}

	public static async confirmationButton(
		interaction: Typings.DeferrableGuildInteraction,
		options: ConfirmationButtonOptions = {}
	): Promise<ReadonlyCollection<string, ButtonInteraction<CacheType>>> {
		assert(interaction.channel);

		const {
			confirmLabel = "Confirm",
			cancelLabel = "Cancel",
			userIDs = [interaction.user.id],
			multiplayerWaitingLobbyText,
			confirmationTime = ms("10s"),
			confirmationTimeFooterEmbedIndex = 0,
			resolveTime,
			isGame = false,
			...replyOptions
		} = options;

		if (userIDs.length && replyOptions.ephemeral) {
			assert(!interaction.ephemeral);
			delete replyOptions.ephemeral;
		}

		const [confirmButtonId, cancelButtonId] = [
			this.MessageComponentIds.ConfirmAction,
			this.MessageComponentIds.CancelAction
		].map((baseID) => {
			const fn = this.constructCustomIdGenerator({
				baseID,
				messageComponentType: Enums.MessageComponentType.Button
			});

			return multiplayerWaitingLobbyText ? fn(this.MessageComponentIds.Multiplayer) : fn();
		});

		const confirmationActionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel(confirmLabel).setStyle(ButtonStyle.Danger).setCustomId(confirmButtonId),
			new ButtonBuilder().setLabel(cancelLabel).setStyle(ButtonStyle.Secondary).setCustomId(cancelButtonId)
		);

		console.log({ confirmationTimeFooterEmbedIndex, replyOptions });

		if (confirmationTimeFooterEmbedIndex !== null && replyOptions.embeds?.length) {
			const embed = EmbedBuilder.from(replyOptions.embeds[confirmationTimeFooterEmbedIndex]);

			embed.setDescription(
				[
					`Timeout: ${time(new Date(Date.now() + confirmationTime), TimestampStyles.RelativeTime)}`,
					embed.data.description ?? ""
				].join(StringUtils.LineBreak.repeat(2))
			);

			Object.assign(replyOptions.embeds[confirmationTimeFooterEmbedIndex], embed);

			console.log(replyOptions.embeds[0]);
		}

		const confirmMessage = await this.replyOrFollowUp(interaction, {
			...replyOptions,
			components: [confirmationActionRow],
			fetchReply: true
		});

		try {
			return await new Promise((resolve, reject) => {
				const collector = confirmMessage.createMessageComponentCollector({
					componentType: ComponentType.Button,
					time: confirmationTime,
					maxUsers: userIDs.length,
					filter: (i) => userIDs.includes(i.user.id)
				});

				let count = 0;

				collector.on("collect", async (i) => {
					if (i.customId === cancelButtonId) {
						reject(ValidationError.MessageTemplates.ActionCancelled);
					}

					if (multiplayerWaitingLobbyText) {
						const embed = i.message.embeds[0].toJSON();
						const waitingLobbyFieldIndex = embed.fields!.findIndex(
							(v) => v.name === multiplayerWaitingLobbyText
						);

						assert(waitingLobbyFieldIndex !== -1);

						const value = i.user.toString();

						if (embed.fields![waitingLobbyFieldIndex].value === StringUtils.TabCharacter) {
							embed.fields![waitingLobbyFieldIndex].value = `${++count}. ${value}`;
						} else {
							embed.fields![waitingLobbyFieldIndex].value +=
								StringUtils.LineBreak + `${++count}. ${value}`;
						}

						await interaction.editReply({ embeds: [embed] });
					}
				});

				collector.on("end", async (collection) => {
					if (collection.size !== userIDs.length) {
						const content = ValidationError.MessageTemplates.Timeout;

						await this.disableComponents(confirmMessage, { messageEditOptions: { content, embeds: [] } });

						reject(content);
					}

					await this.disableComponents(confirmMessage);

					if (resolveTime) {
						await ObjectUtils.sleep(resolveTime);
					}

					resolve(collection);
				});
			});
		} catch (err) {
			throw new ValidationError(err);
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
		options: DisableComponentOptions = {}
	): Promise<InteractionResponse<boolean> | Message<boolean> | null> {
		const { rules, messageEditOptions } = options;

		return await message
			.edit({
				...messageEditOptions,
				components: this.toDisabledComponents(message.components, rules)
			})
			.catch(() => null);
	}

	public static toDisabledComponents<
		const T extends ActionRow<MessageActionRowComponent>[] | APIActionRowComponent<APIButtonComponentWithCustomId>[]
	>(components: T, rules: DisableComponentRules = {}): T {
		return ObjectUtils.cloneObject(components).map((data) => ({
			...data,
			components: data.components.map((c) => {
				const customId = "customId" in c ? c.customId : c.custom_id;

				if (!rules.customIds || (customId && rules.customIds.includes(customId) === rules.delete)) {
					Object.assign(c, { disabled: true });
				}

				return c;
			})
		})) as T;
	}

	public static emojiMention(emoji: APIMessageComponentEmoji): string {
		return emoji.id ? formatEmoji(emoji.id, emoji.animated) : emoji.name!;
	}

	public static isValidEmoji(interaction: Typings.GuildInteraction, emojiIdOrSymbol: string): boolean {
		return Boolean(
			StringUtils.Regexes.UnicodeEmoji.test(emojiIdOrSymbol) || interaction.client.emojis.resolve(emojiIdOrSymbol)
		);
	}

	public static isDeferRaceCondition(err: unknown): err is DiscordjsError | DiscordAPIError {
		return (
			(err instanceof DiscordjsError && err.code === DiscordjsErrorCodes.InteractionAlreadyReplied) ||
			(err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged)
		);
	}
}
