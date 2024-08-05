import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType } from "@prisma/client";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Constants,
	FormattingPatterns,
	MessageMentions,
	PermissionFlagsBits,
	inlineCode
} from "discord.js";
import { Discord, Guard, ParameterDecoratorEx, Slash, SlashGroup, SlashOption } from "discordx";

import { MAX_MESSAGE_FETCH_LIMIT, MAX_PURGE_COUNT_LIMIT } from "~/constants";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { GivenChannelSlashOption, TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { ClientRequiredPermissions } from "~/helpers/guards/ClientRequiredPermissions.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { NumberUtils } from "~/helpers/utils/number.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";

import type {
	Channel,
	ChatInputCommandInteraction,
	FetchMessagesOptions,
	GuildMember,
	GuildTextBasedChannel,
	Message,
	Role,
	User
} from "discord.js";

interface PurgeHandlerOptions extends Pick<FetchMessagesOptions, "before" | "after"> {
	channel?: GuildTextBasedChannel;
	count: number;
	inverse?: boolean;
	messageFilter?: (msg: Message<true>) => boolean;
	reason: string;
	target?: User | GuildMember | Role | Channel;
}

@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3), ClientRequiredPermissions(Purge.mutualPermissions))
@SlashGroup({
	dmPermission: false,
	description: "Purge messages in the current or given channel with a filter",
	name: "purge",
	defaultMemberPermissions: Purge.mutualPermissions
})
@SlashGroup("purge")
export abstract class Purge {
	private static readonly mutualPermissions = [PermissionFlagsBits.ManageMessages];
	private static readonly defaultMessageFetchLimit = 50;

	@Slash({ description: "Purge all messages after a given messageId in the current or given channel" })
	public async after(
		@Purge.MessageIDSlashOption()
		messageId: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			after: messageId
		});
	}

	@Slash({ description: "Purge all messages in the current or given channel" })
	public all(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason
		});
	}

	@Slash({ description: "Purge all messages containing attachments in the current or given channel" })
	public attachments(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => !!msg.attachments.size
		});
	}

	@Slash({ description: "Purge all messages before a given messageId in the current or given channel" })
	public async before(
		@Purge.MessageIDSlashOption()
		messageId: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			before: messageId
		});
	}

	@Slash({
		description: "Purge all messages inclusively between two given messageIds in the current or given channel"
	})
	public async between(
		@Purge.MessageIDSlashOption("start")
		startMessageId: string,
		@Purge.MessageIDSlashOption("end")
		endMessageId: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			before: String(BigInt(endMessageId) + 1n),
			after: String(BigInt(startMessageId) - 1n)
		});
	}

	@Slash({ description: "Purge all or a specific bot's messages in the current or given channel" })
	public bots(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | undefined,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => msg.author.bot && (!target || msg.author.id === target.id)
		});
	}

	@Slash({ description: "Purge all messages containing embeds in the current or given channel" })
	public embeds(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => !!msg.embeds.length
		});
	}

	@Slash({ description: "Purge all messages containing discord emojis in the current or given channel" })
	public emojis(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) =>
				[FormattingPatterns.Emoji, StringUtils.regexes.unicodeEmoji].some((regex) => regex.test(msg.content))
		});
	}

	@Slash({
		description: "Purge all messages that ends with a given text (case insensitive) in the current or given channel"
	})
	public endswith(
		@SlashOption({
			description: "The text to match",
			name: "text",
			type: ApplicationCommandOptionType.String,
			minLength: 3,
			required: true
		})
		content: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().endsWith(content)
		});
	}

	@Slash({ description: "Purge all messages containing discord invites in the current or given channel" })
	public invites(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) =>
				[StringUtils.regexes.invite, StringUtils.regexes.botInvite].some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "Purge all messages containing links in the current or given channel" })
	public links(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => StringUtils.regexes.link.test(msg.content)
		});
	}

	@Slash({ description: "Purge all or specific snowflake mention messages in the current or given channel" })
	public mentions(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.SNOWFLAKE,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | Role | Channel | undefined,
		@SlashOption({
			description: "If everyone and here mentions should be considered",
			name: "with_everyone_and_here_mentions",
			type: ApplicationCommandOptionType.Boolean
		})
		considerEveryoneHere: boolean = false,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const messageMentionRegexArray: RegExp[] = [
			MessageMentions.UsersPattern,
			MessageMentions.ChannelsPattern,
			MessageMentions.RolesPattern
		];

		if (considerEveryoneHere) {
			messageMentionRegexArray.push(MessageMentions.EveryonePattern);
		}

		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) =>
				target ? msg.mentions.has(target) : messageMentionRegexArray.some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "Purge all messages of users with a given role in the current or given channel" })
	public role(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.ROLE,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive]
		})
		target: Role,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => !!msg.member?.roles.cache.has(target.id)
		});
	}

	@Slash({
		description:
			"purge all messages that start with a given text (case insensitive) in the current or given channel"
	})
	public startswith(
		@SlashOption({
			description: "The text to match",
			name: "text",
			type: ApplicationCommandOptionType.String,
			minLength: 3,
			required: true
		})
		content: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().startsWith(content)
		});
	}

	@Slash({ description: "Purge all or a specific user's messages in the current or given channel" })
	public users(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | undefined,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => (target ? msg.author.id === target.id : !msg.author.bot)
		});
	}

	@Slash({
		description: "Purge all messages containing a given text (case insensitive) in the current or given channel"
	})
	public wildcard(
		@SlashOption({
			description: "The text to match",
			name: "text",
			type: ApplicationCommandOptionType.String,
			minLength: 3,
			required: true
		})
		content: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.defaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().includes(content)
		});
	}

	private static CountSlashOption(): ParameterDecoratorEx {
		return CommandUtils.constructSlashOption({
			options: {
				description: `The number of messages to purge from 3 to ${MAX_PURGE_COUNT_LIMIT} inclusive. Default is ${Purge.defaultMessageFetchLimit}`,
				name: "count",
				type: ApplicationCommandOptionType.Integer,
				minValue: 3,
				maxValue: MAX_PURGE_COUNT_LIMIT
			}
		});
	}

	private static InverseFilterSlashOption(): ParameterDecoratorEx {
		return CommandUtils.constructSlashOption({
			options: {
				description: "If the filter should be inversed",
				name: "with_inverse_filter",
				type: ApplicationCommandOptionType.Boolean
			}
		});
	}

	private static MessageIDSlashOption(namePrefix?: Lowercase<string>): ParameterDecoratorEx {
		let name: Lowercase<string> = "message_id";

		if (namePrefix) {
			name = `${namePrefix}_${name}` as Lowercase<string>;
		}

		return CommandUtils.constructSlashOption({
			options: {
				description: "The messageId to match",
				name,
				type: ApplicationCommandOptionType.String,
				required: true
			},
			async transformer(value, interaction) {
				const channel =
					interaction.options.getChannel(CommandUtils.slashOptions.ChannelPermissionName, false, [
						ChannelType.GuildText
					]) ?? interaction.channel!;

				const inlineMessageId = inlineCode(value);

				if (!StringUtils.regexes.snowflake.test(value)) {
					throw new ValidationError(
						`Argument Error: invalid snowflakeId provided ${inlineMessageId}, please check your input.`
					);
				}

				const message = await channel.messages.fetch(value).catch(() => {});

				if (!message) {
					throw new ValidationError(`I cannot perform this action: message ${inlineMessageId} not found`);
				}

				const twoWeeksAgo = Date.now() - Constants.MaxBulkDeletableMessageAge;
				const isOlderThanTwoWeeksAgo = message.createdTimestamp < twoWeeksAgo;

				if (isOlderThanTwoWeeksAgo) {
					throw new ValidationError(
						`I cannot perform this action: message ${inlineMessageId} is older than 14 days`
					);
				}

				return value;
			}
		});
	}

	private async handler(interaction: ChatInputCommandInteraction<"cached">, options: PurgeHandlerOptions) {
		await InteractionUtils.deferInteraction(interaction, true);

		const { channel, count, reason, inverse, after, messageFilter } = options;

		let { before: lastDeletedMessageId } = options;

		const purgeChannel = channel ?? interaction.channel!;

		const purgeChunks = NumberUtils.chunkByModulus(count, MAX_MESSAGE_FETCH_LIMIT);

		let deletedSuccessCount = 0;

		for (const currentChunk of purgeChunks) {
			try {
				const msgCollection = await purgeChannel.messages.fetch({
					limit: currentChunk,
					before: lastDeletedMessageId,
					after
				});

				if (!msgCollection.size) {
					break;
				}

				let olderThanTwoWeeksAgoCount = 0;

				const bulkDeleteMessages = msgCollection.filter((msg) => {
					const twoWeeksAgo = Date.now() - Constants.MaxBulkDeletableMessageAge;

					const isDeletable = msg.bulkDeletable;
					const isOlderThanTwoWeeksAgo = msg.createdTimestamp < twoWeeksAgo;

					if (isOlderThanTwoWeeksAgo) {
						olderThanTwoWeeksAgoCount++;
					}

					let bool = isDeletable && !isOlderThanTwoWeeksAgo;

					const isMutuallyExclusive = !!lastDeletedMessageId && !!after;

					if (isMutuallyExclusive) {
						bool &&= msg.id > after;
					}

					if (messageFilter) {
						bool &&= !!inverse !== messageFilter(msg);
					}

					if (bool) {
						lastDeletedMessageId = msg.id;
					}

					return bool;
				});

				const cannotDeleteFurther = olderThanTwoWeeksAgoCount === msgCollection.size;

				if (cannotDeleteFurther) {
					break;
				}

				if (bulkDeleteMessages.size) {
					const deleted = await purgeChannel.bulkDelete(bulkDeleteMessages, true);

					deletedSuccessCount += deleted.size;
				}
			} catch (err) {
				InteractionUtils.replyOrFollowUp(interaction, {
					content: "Internal error: something went wrong."
				});

				throw err;
			}
		}

		let messageContent =
			deletedSuccessCount === 0
				? "No messages were deleted"
				: `deleted ${deletedSuccessCount} / ${count} messages`;

		const buttonLabel = StringUtils.capitaliseFirstLetter(messageContent);

		if (purgeChannel.id !== interaction.channelId) {
			messageContent += ` in ${purgeChannel.toString()}`;
		}

		if (deletedSuccessCount) {
			const button = new ButtonBuilder()
				.setCustomId("_purgeCount")
				.setStyle(ButtonStyle.Secondary)
				.setLabel(buttonLabel)
				.setDisabled(true);

			const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

			return await ActionManager.logCase({
				interaction,
				reason,
				actionType: ActionType.PURGE_MESSAGES_SET,
				target: {
					id: purgeChannel.id,
					type: CommandUtils.entityType.CHANNEL
				},
				successContent: messageContent,
				logBasedButtonActionRows: [actionRow]
			});
		}

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content: messageContent
		});
	}
}
