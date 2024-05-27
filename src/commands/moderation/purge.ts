import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { ActionType } from "@prisma/client";
import {
	ApplicationCommandOptionType,
	Constants,
	FormattingPatterns,
	MessageMentions,
	PermissionFlagsBits
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";

import { MAX_MESSAGE_FETCH_LIMIT, MAX_PURGE_COUNT_LIMIT } from "~/constants";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { GivenChannelSlashOption, TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { NumberUtils } from "~/utils/number.js";
import { StringUtils } from "~/utils/string.js";

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
	count: number;
	reason: string;
	channel?: GuildTextBasedChannel;
	inverse?: boolean;
	target?: User | GuildMember | Role | Channel;
	messageFilter?: (msg: Message<true>) => boolean;
}

const mutualPermissions = [PermissionFlagsBits.ManageMessages];
@Discord()
@Category(Enums.CommandCategory.Moderation)
@Guard(RateLimit(TIME_UNIT.seconds, 3), BotRequiredPermissions(mutualPermissions))
@SlashGroup({
	dmPermission: false,
	description: "purge messages in the current or given channel with a filter",
	name: "purge",
	defaultMemberPermissions: mutualPermissions
})
@SlashGroup("purge")
export abstract class Purge {
	private static DefaultMessageFetchLimit = 50;

	private static CountSlashOption() {
		return (target: Record<string, any>, propertyKey: string, parameterIndex: number) => {
			SlashOption({
				description: `The number of messages to purge from 3 to ${MAX_PURGE_COUNT_LIMIT} inclusive. Default is ${Purge.DefaultMessageFetchLimit}`,
				name: "count",
				type: ApplicationCommandOptionType.Integer,
				minValue: 3,
				maxValue: MAX_PURGE_COUNT_LIMIT
			})(target, propertyKey, parameterIndex);
		};
	}

	private static InverseFilterSlashOption() {
		return (target: Record<string, any>, propertyKey: string, parameterIndex: number) => {
			SlashOption({
				description: "If the filter should be inversed",
				name: "with_inverse_filter",
				type: ApplicationCommandOptionType.Boolean
			})(target, propertyKey, parameterIndex);
		};
	}

	@Slash({ description: "purge all messages in the current or given channel" })
	public all(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			channel,
			count,
			reason
		});
	}

	@Slash({ description: "purge all or specific snowflake mention messages in the current or given channel" })
	public mentions(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.SNOWFLAKE,
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
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all or a specific user's messages in the current or given channel" })
	public users(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | undefined,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all or a specific bot's messages in the current or given channel" })
	public bots(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive],
			required: false
		})
		target: User | GuildMember | undefined,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all messages of users with a given role in the current or given channel" })
	public role(
		@TargetSlashOption({
			entityType: CommandUtils.EntityType.ROLE,
			flags: [Enums.CommandSlashOptionTargetFlags.Passive]
		})
		target: Role,
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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
		description: "purge all messages containing a given text (case insensitive) in the current or given channel"
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
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({
		description: "purge all messages that ends with a given text (case insensitive) in the current or given channel"
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
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all messages containing attachments in the current or given channel" })
	public attachments(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all messages containing embeds in the current or given channel" })
	public embeds(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
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

	@Slash({ description: "purge all messages containing links in the current or given channel" })
	public links(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => StringUtils.Regexes.Link.test(msg.content)
		});
	}

	@Slash({ description: "purge all messages containing discord invites in the current or given channel" })
	public invites(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) =>
				[StringUtils.Regexes.Invite, StringUtils.Regexes.BotInvite].some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "purge all messages containing discord emojis in the current or given channel" })
	public emojis(
		@GivenChannelSlashOption()
		channel: GuildTextBasedChannel | undefined,
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) =>
				[FormattingPatterns.Emoji, StringUtils.Regexes.UnicodeEmoji].some((regex) => regex.test(msg.content))
		});
	}

	@Slash({ description: "purge all messages before a given messageId in the current or given channel" })
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
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!StringUtils.Regexes.Snowflake.test(messageId)) {
			throw new ValidationError("Argument Error: invalid snowflakeId provided, please check your input.");
		}

		const message = await interaction.channel!.messages.fetch(messageId).catch();

		if (!message) {
			throw new ValidationError("I cannot perform this action: message not found or is older than 14 days");
		}

		const twoWeeksAgo = Date.now() - Constants.MaxBulkDeletableMessageAge;
		const isOlderThanTwoWeeksAgo = message.createdTimestamp < twoWeeksAgo;

		if (isOlderThanTwoWeeksAgo) {
			throw new ValidationError("I cannot perform this action: message is older than 14 days");
		}

		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			before: messageId
		});
	}

	@Slash({ description: "purge all messages after a given messageId in the current or given channel" })
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
		@Purge.CountSlashOption()
		count: number = Purge.DefaultMessageFetchLimit,
		@Purge.InverseFilterSlashOption()
		inverse: boolean = false,
		@ReasonSlashOption()
		reason: string = InteractionUtils.Messages.NoReason,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		if (!StringUtils.Regexes.Snowflake.test(messageId)) {
			throw new ValidationError("Argument Error: invalid snowflakeId provided, please check your input.");
		}

		const message = await interaction.channel!.messages.fetch(messageId).catch();

		if (!message) {
			throw new ValidationError("I cannot perform this action: message not found or is older than 14 days");
		}

		const twoWeeksAgo = Date.now() - Constants.MaxBulkDeletableMessageAge;
		const isOlderThanTwoWeeksAgo = message.createdTimestamp < twoWeeksAgo;

		if (isOlderThanTwoWeeksAgo) {
			throw new ValidationError("I cannot perform this action: message is older than 14 days");
		}

		return this.handler(interaction, {
			count,
			reason,
			channel,
			inverse,
			after: messageId
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
				: `Successfully deleted ${deletedSuccessCount} / ${count} messages`;

		if (purgeChannel.id !== interaction.channelId) {
			messageContent += ` in ${purgeChannel.toString()}`;
		}

		if (deletedSuccessCount) {
			return await ActionManager.logCase({
				interaction,
				reason,
				actionType: ActionType.PURGE_MESSAGES_SET,
				target: {
					id: purgeChannel.id,
					type: CommandUtils.EntityType.CHANNEL
				},
				successContent: messageContent
			});
		}

		return await InteractionUtils.replyOrFollowUp(interaction, {
			content: messageContent
		});
	}
}
