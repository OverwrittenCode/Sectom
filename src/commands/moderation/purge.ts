import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { CaseActionType } from "@prisma/client";
import {
	ApplicationCommandOptionType,
	FormattingPatterns,
	MessageMentions,
	PermissionFlagsBits,
	channelMention
} from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import ms from "ms";

import { MAX_MESSAGE_FETCH_LIMIT, MAX_PURGE_COUNT_LIMIT } from "~/constants";
import { ReasonSlashOption } from "~/helpers/decorators/slashOptions/reason.js";
import { GivenChannelSlashOption, TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { BotRequiredPermissions } from "~/helpers/guards/BotRequiredPermissions.js";
import { ActionModerationManager } from "~/managers/ActionModerationManager.js";
import { Enums } from "~/ts/Enums.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { NumberUtils } from "~/utils/number.js";
import { StringUtils } from "~/utils/string.js";

import type {
	Channel,
	ChatInputCommandInteraction,
	GuildMember,
	GuildTextBasedChannel,
	Message,
	Role,
	User
} from "discord.js";

interface PurgeHandlerOptions {
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
			messageFilter: (msg) => !!StringUtils.Regexes.Link.test(msg.content)
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
			count,
			reason,
			channel,
			inverse,
			messageFilter: (msg) => msg.createdTimestamp < message.createdTimestamp
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
			count,
			reason,
			channel,
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

		messageContent += purgeChannel.id !== interaction.channelId ? ` in ${channelMention(purgeChannel.id)}.` : ".";

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
