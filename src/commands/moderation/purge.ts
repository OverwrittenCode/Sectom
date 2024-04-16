import {
	BOT_INVITE_REGEX,
	COMMAND_ENTITY_TYPE,
	DEFAULT_MESSAGE_FETCH_LIMIT,
	INVITE_REGEX,
	LINK_REGEX,
	MAX_MESSAGE_FETCH_LIMIT,
	MAX_PURGE_COUNT_LIMIT,
	NO_REASON,
	SNOWFLAKE_REGEX
} from "@constants";
import { ReasonSlashOption } from "@decorators/slashOptions/reason.js";
import { TargetSlashOption } from "@decorators/slashOptions/target.js";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionModerationManager } from "@managers/ActionModerationManager.js";
import { CaseActionType } from "@prisma/client";
import { COMMAND_CATEGORY } from "@ts/enums/COMMAND_CATEGORY.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import { CommandUtils } from "@utils/command.js";
import { InteractionUtils } from "@utils/interaction.js";
import { NumberUtils } from "@utils/number.js";
import type {
	Channel,
	ChatInputCommandInteraction,
	GuildMember,
	GuildTextBasedChannel,
	Message,
	Role,
	User
} from "discord.js";
import { ApplicationCommandOptionType, MessageMentions, PermissionFlagsBits, channelMention } from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import ms from "ms";
import { BotRequiredPermissions } from "src/guards/BotRequiredPermissions.js";

interface PurgeHandlerOptions {
	channel?: GuildTextBasedChannel;
	count: number;
	reason: string;
	inverse?: boolean;
	target?: User | GuildMember | Role | Channel;
	messageFilter?: (msg: Message<true>) => boolean;
}

const givenChannelSlashOptionFlags = [
	COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD,
	COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE
];

const givenChannelSlashOptionDescriptionSuffix =
	CommandUtils.generateSlashOptionTargetDescriptionSuffix(givenChannelSlashOptionFlags);

const mutualPermissions = [PermissionFlagsBits.ManageMessages];
@Discord()
@Category(COMMAND_CATEGORY.MODERATION)
@Guard(
	RateLimit(TIME_UNIT.seconds, 3),
	BotRequiredPermissions(mutualPermissions, givenChannelSlashOptionDescriptionSuffix)
)
@SlashGroup({ description: "purge messages in the channel with a filter", name: "purge" })
@SlashGroup("purge")
export abstract class Purge {
	@Slash({ description: "purge all messages in the channel" })
	public all(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason
		});
	}

	@Slash({ description: "purge all or specific snowflake mention messages in the channel" })
	public mentions(
		@TargetSlashOption(
			[COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD, COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE],
			COMMAND_ENTITY_TYPE.SNOWFLAKE,
			false
		)
		target: User | GuildMember | Role | Channel | undefined,
		@SlashOption({
			description: "If everyone and here mentions should be considered",
			name: "with_everyone_and_here_mentions",
			type: ApplicationCommandOptionType.Boolean
		})
		considerEveryoneHere: boolean = false,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
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
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) =>
				target ? msg.mentions.has(target) : messageMentionRegexArray.some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "purge a specific user's messages in the channel" })
	public user(
		@SlashOption({
			description: `The user mention or userId. Ex: 1090725120628111864. ${CommandUtils.generateSlashOptionTargetDescriptionSuffix(
				[COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE]
			)}`,
			name: "user",
			type: ApplicationCommandOptionType.User,
			required: true
		})
		target: User | GuildMember,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.author.id === target.id
		});
	}

	@Slash({ description: "purge all or a specific bot's messages in the channel" })
	public bots(
		@SlashOption({
			description: `The user mention or userId. Ex: 1090725120628111864. ${CommandUtils.generateSlashOptionTargetDescriptionSuffix(
				[COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE]
			)}`,
			name: "user",
			type: ApplicationCommandOptionType.User
		})
		target: User | GuildMember | undefined,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.author.bot && (target ? msg.author.id === target.id : true)
		});
	}

	@Slash({ description: "purge all messages of users with a given role in the channel" })
	public role(
		@TargetSlashOption(
			[COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD, COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE],
			COMMAND_ENTITY_TYPE.ROLE
		)
		target: Role,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => !!msg.member?.roles.cache.has(target.id)
		});
	}

	@Slash({ description: "purge all messages containing a given text (case insensitive) in the channel" })
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
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().includes(content)
		});
	}

	@Slash({ description: "purge all messages that start with a given text (case insensitive) in the channel" })
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
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().startsWith(content)
		});
	}

	@Slash({ description: "purge all messages that ends with a given text (case insensitive) in the channel" })
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
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.content.toLowerCase().endsWith(content)
		});
	}

	@Slash({ description: "purge all messages containing attachments in the channel" })
	public attachments(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => !!msg.attachments.size
		});
	}

	@Slash({ description: "purge all messages containing embeds in the channel" })
	public embeds(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => !!msg.embeds.length
		});
	}

	@Slash({ description: "purge all messages containing links in the channel" })
	public links(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => !!LINK_REGEX.test(msg.content)
		});
	}

	@Slash({ description: "purge all messages containing discord invites in the channel" })
	public invites(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => [INVITE_REGEX, BOT_INVITE_REGEX].some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "purge all messages before a given messageId in the channel" })
	public async before(
		@SlashOption({
			description: "The messageId to match",
			name: "message_id",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		messageId: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!SNOWFLAKE_REGEX.test(messageId)) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "Argument Error: invalid snowflakeId provided, please check your input.",
				ephemeral: true
			});
		}

		const message =
			interaction.channel!.messages.cache.get(messageId) ||
			(await interaction.channel!.messages.fetch(messageId).catch());

		if (!message) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: message not found or is older than 14 days",
				ephemeral: true
			});
		}

		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.createdTimestamp < message.createdTimestamp
		});
	}

	@Slash({ description: "purge all messages after a given messageId in the channel" })
	public async after(
		@SlashOption({
			description: "The messageId to match",
			name: "message_id",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		messageId: string,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@CountSlashOption()
		count: number = DEFAULT_MESSAGE_FETCH_LIMIT,
		@InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = NO_REASON,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!SNOWFLAKE_REGEX.test(messageId)) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "Argument Error: invalid snowflakeId provided, please check your input.",
				ephemeral: true
			});
		}

		const message =
			interaction.channel!.messages.cache.get(messageId) ||
			(await interaction.channel!.messages.fetch(messageId).catch());

		if (!message) {
			return await InteractionUtils.replyOrFollowUp(interaction, {
				content: "I cannot perform this action: message not found or is older than 14 days",
				ephemeral: true
			});
		}

		return this.handler(interaction, {
			channel,
			count,
			reason,
			inverse,
			messageFilter: (msg) => msg.createdTimestamp > message.createdTimestamp
		});
	}

	private async handler(interaction: ChatInputCommandInteraction<"cached">, options: PurgeHandlerOptions) {
		const { channel, count, reason, inverse, messageFilter } = options;

		const purgeChannel = channel ?? interaction.channel!;

		const purgeChunks = NumberUtils.chunkByModulus(count, MAX_MESSAGE_FETCH_LIMIT);

		const twoWeeksAgo = Date.now() - ms("14d");

		let deletedSuccessCount = 0;

		for (const currentChunk of purgeChunks) {
			try {
				const msgCollection = await purgeChannel.messages.fetch({
					limit: currentChunk
				});

				const bulkDeleteMessages = msgCollection.filter((msg) => {
					const isDeletable = msg.bulkDeletable;
					const isGreaterThanTwoWeeksAgo = msg.createdTimestamp > twoWeeksAgo;
					const isNotMyDeferredInteraction = msg.interaction?.id !== interaction.id;

					let bool = isDeletable && isGreaterThanTwoWeeksAgo && isNotMyDeferredInteraction;

					if (messageFilter) {
						const isMatchingMessageFilter = inverse ? !messageFilter : messageFilter(msg);
						bool &&= isMatchingMessageFilter;
					}

					return bool;
				});

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
				: `Successfully deleted ${deletedSuccessCount} / ${count} messages`;

		messageContent += purgeChannel.id !== channel?.id ? ` in ${channelMention(purgeChannel.id)}.` : ".";

		if (deletedSuccessCount) {
			return await ActionModerationManager.logCase({
				interaction,
				reason,
				actionType: CaseActionType.PURGE_MESSAGES,
				target: {
					id: purgeChannel.id,
					type: COMMAND_ENTITY_TYPE.CHANNEL
				},
				messageContent
			});
		}

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content: messageContent
		});
	}
}

function GivenChannelSlashOption() {
	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		TargetSlashOption(
			givenChannelSlashOptionFlags,
			COMMAND_ENTITY_TYPE.CHANNEL,
			false,
			"in"
		)(target, propertyKey, parameterIndex);
	};
}

function CountSlashOption() {
	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		SlashOption({
			description: `The number of messages to purge from 3 to ${MAX_PURGE_COUNT_LIMIT} inclusive. Default is ${DEFAULT_MESSAGE_FETCH_LIMIT}`,
			name: "count",
			type: ApplicationCommandOptionType.Integer,
			minValue: 3,
			maxValue: MAX_PURGE_COUNT_LIMIT
		})(target, propertyKey, parameterIndex);
	};
}

function InverseFilterSlashOption() {
	return function (target: Record<string, any>, propertyKey: string, parameterIndex: number) {
		SlashOption({
			description: "If the filter should be inversed",
			name: "with_inverse_filter",
			type: ApplicationCommandOptionType.Boolean
		})(target, propertyKey, parameterIndex);
	};
}
