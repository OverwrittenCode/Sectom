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
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

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
import type { Simplify } from "type-fest";

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
	typeof StringUtils.customIDFIeldBodySeperator
>;

type CustomIdPrefixRecordOutput<T extends string> = {
	[K in T]: {
		id: K;
		regex: RegExp;
	};
};

type MessageComponentFlags = Omit<typeof InteractionUtils.messageComponentIds, "Managed">;

interface ConfirmationButtonOptions extends ReplyOptions {
	cancelLabel?: string;
	confirmLabel?: string;
	confirmationTime?: number;
	confirmationTimeFooterEmbedIndex?: number | null;
	multiplayerWaitingLobbyText?: string;
	notifyStatus?: boolean;
	resolveTime?: number;
	userIDs?: string[];
}

interface ConstructCustomIdGeneratorOptions {
	baseID: string;
	messageComponentFlags?: MessageComponentFlags[keyof MessageComponentFlags][];
	messageComponentType: Enums.MessageComponentType;
}

interface DisableComponentOptions {
	messageEditOptions?: Omit<MessageEditOptions, "components">;
	rules?: DisableComponentRules;
}

interface DisableComponentRules {
	customIds?: string[];
	delete?: boolean;
}

interface ReplyOptions extends InteractionReplyOptions {
	preferFollowUp?: boolean;
}

export abstract class InteractionUtils {
	public static messageComponentIds = {
		cancelAction: "cancel_action",
		confirmAction: "confirm_action",
		oneTimeUse: "one_time_use",
		multiplayer: "multiplayer",
		managed: ["pagination"]
	} as const;
	public static messages = {
		noData: "Nothing to view yet in this query selection.",
		noReason: "No reason provided."
	} as const;

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
			...replyOptions
		} = options;

		if (userIDs.length > 1 && replyOptions.ephemeral) {
			assert(!interaction.ephemeral);
			delete replyOptions.ephemeral;
		}

		const [confirmButtonId, cancelButtonId] = [
			this.messageComponentIds.confirmAction,
			this.messageComponentIds.cancelAction
		].map((baseID) => {
			const fn = this.constructCustomIdGenerator({
				baseID,
				messageComponentType: Enums.MessageComponentType.Button
			});

			return multiplayerWaitingLobbyText ? fn(this.messageComponentIds.multiplayer) : fn();
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
				].join(StringUtils.lineBreak.repeat(2))
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
						reject(ValidationError.messageTemplates.ActionCancelled);
					}

					if (multiplayerWaitingLobbyText) {
						const embed = i.message.embeds[0].toJSON();
						const waitingLobbyFieldIndex = embed.fields!.findIndex(
							(v) => v.name === multiplayerWaitingLobbyText
						);

						assert(waitingLobbyFieldIndex !== -1);

						const value = i.user.toString();

						if (embed.fields![waitingLobbyFieldIndex].value === StringUtils.tabCharacter) {
							embed.fields![waitingLobbyFieldIndex].value = `${++count}. ${value}`;
						} else {
							embed.fields![waitingLobbyFieldIndex].value +=
								StringUtils.lineBreak + `${++count}. ${value}`;
						}

						await interaction.editReply({ embeds: [embed] });
					}
				});

				collector.on("end", async (collection) => {
					if (collection.size !== userIDs.length) {
						const content = ValidationError.messageTemplates.Timeout;

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
				StringUtils.customIDFIeldBodySeperator,
				...input
			) as ConstructCustomIdGeneratorOutput<Prefix, Suffix, Options>;
		};
	}

	public static customIdPrefixRecords<const T extends string>(
		...customIds: T[]
	): Simplify<CustomIdPrefixRecordOutput<T>> {
		return customIds.reduce((acc, id) => {
			acc[id] = {
				id,
				regex: new RegExp(`^${id}`)
			};
			return acc;
		}, {} as CustomIdPrefixRecordOutput<T>);
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

	public static emojiMention(emoji: APIMessageComponentEmoji): string {
		return emoji.id ? formatEmoji(emoji.id, emoji.animated) : emoji.name!;
	}

	public static isDeferRaceCondition(err: unknown): err is DiscordjsError | DiscordAPIError {
		return (
			(err instanceof DiscordjsError && err.code === DiscordjsErrorCodes.InteractionAlreadyReplied) ||
			(err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged)
		);
	}

	public static isPermissionError(err: unknown): err is DiscordAPIError {
		return (
			err instanceof DiscordAPIError &&
			(err.code === RESTJSONErrorCodes.MissingPermissions || err.code === RESTJSONErrorCodes.MissingAccess)
		);
	}

	public static isValidEmoji(interaction: Typings.GuildInteraction, emojiIdOrSymbol: string): boolean {
		return Boolean(
			StringUtils.regexes.unicodeEmoji.test(emojiIdOrSymbol) || interaction.client.emojis.resolve(emojiIdOrSymbol)
		);
	}

	public static modalSubmitToEmbedFIelds(interaction: ModalSubmitInteraction<"cached">): APIEmbedField[] {
		const textInputComponents = [...interaction.fields.fields.toJSON().values()].filter(({ value }) => !!value);

		const fields: APIEmbedField[] = textInputComponents.map(({ customId, value }) => ({
			name: customId.replaceAll("_", " ").replace(/(^\w|\s\w)/g, (m) => m.toUpperCase()),
			value
		}));

		return fields;
	}

	public static async replyNoData(interaction: Typings.DeferrableGuildInteraction, ephemeral: boolean = true) {
		return await this.replyOrFollowUp(interaction, {
			content: this.messages.noData,
			ephemeral
		});
	}

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
			const { preferFollowUp, ...options } = replyOptions;

			if (interaction.replied) {
				return await interaction.followUp(options);
			}

			if (interaction.deferred) {
				const isForcedFollowUp = !interaction.ephemeral && replyOptions.ephemeral;

				if (preferFollowUp || isForcedFollowUp) {
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
}
