import { ActionType } from "@prisma/client";
import {
	ChannelType,
	EmbedBuilder,
	Events,
	ForumLayoutType,
	GuildBasedChannel,
	NonThreadGuildBasedChannel,
	OverwriteType,
	SortOrderType,
	ThreadAutoArchiveDuration,
	VideoQualityMode,
	bold,
	formatEmoji,
	roleMention,
	userMention
} from "discord.js";
import { ArgsOf, Discord, On } from "discordx";
import prettyMilliseconds from "pretty-ms";

import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import {
	AbstractClazzFeatOptions,
	DiscordEventLogManager,
	MutualEventLogOptionOptions
} from "~/models/framework/managers/DiscordEventLogManager.js";

@Discord()
export abstract class ChannelLog {
	private static readonly mutualNonThreadBasedOptions: MutualEventLogOptionOptions<NonThreadGuildBasedChannel> = {
		name: true,
		topic: true,
		position: true,
		defaultAutoArchiveDuration: ThreadAutoArchiveDuration,
		type: ChannelType,
		defaultSortOrder: SortOrderType,
		videoQualityMode: VideoQualityMode,
		parent() {
			return {
				name: "Category"
			};
		},
		nsfw() {
			return {
				name: "NSFW"
			};
		},
		userLimit() {
			return {
				name: "Max Users"
			};
		},
		rtcRegion() {
			return {
				name: "RTC Region"
			};
		},
		defaultForumLayout() {
			return {
				name: "Default Layout",
				transformer(value) {
					return ForumLayoutType[value];
				}
			};
		},
		rateLimitPerUser() {
			return {
				name: "Slowmode",
				transformer(seconds) {
					return seconds ? prettyMilliseconds(seconds / 1000) : null;
				}
			};
		},
		defaultThreadRateLimitPerUser() {
			return {
				name: "Default Thread Slowmode",
				transformer(seconds) {
					return seconds ? prettyMilliseconds(seconds / 1000) : null;
				}
			};
		},
		defaultReactionEmoji() {
			return {
				async transformer(value, clazz) {
					if (value?.id) {
						const emoji = await clazz.guild.emojis.fetch(value.id).catch(() => void 0);

						return formatEmoji(value.id, !!emoji?.animated);
					}

					return value?.name ?? "None";
				}
			};
		},
		bitrate() {
			return {
				transformer(bps) {
					return `${bps / 1000} kbps`;
				}
			};
		}
	};

	@On({ event: Events.ChannelCreate })
	public channelCreate([channel]: ArgsOf<Events.ChannelCreate>) {
		if (channel.isDMBased()) {
			return;
		}

		return this.channelFeat({ clazz: channel, actionType: ActionType.DISCORD_CHANNEL_CREATE });
	}

	@On({ event: Events.ChannelDelete })
	public channelDelete([channel]: ArgsOf<Events.ChannelDelete>) {
		if (channel.isDMBased()) {
			return;
		}

		return this.channelFeat({ clazz: channel, actionType: ActionType.DISCORD_CHANNEL_DELETE });
	}

	@On({ event: Events.ChannelUpdate })
	public channelUpdate([oldChannel, newChannel]: ArgsOf<Events.ChannelUpdate>) {
		if (oldChannel.isDMBased() || newChannel.isDMBased()) {
			return;
		}

		const embed = this.generateEmbed(newChannel);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldChannel,
			new: newChannel,
			actionType: ActionType.DISCORD_CHANNEL_UPDATE,
			options: {
				...ChannelLog.mutualNonThreadBasedOptions,
				flags: true,
				permissionsLocked(_before, after) {
					return { fieldValue: after ? "Set to true" : null };
				},
				availableTags() {
					return {
						discriminator: "id" as const
					};
				},
				permissionOverwrites(before, after) {
					if (newChannel.permissionsLocked) {
						return { fieldValue: null };
					}

					const allIds = [...new Set([...before.cache.keys(), ...after.cache.keys()])];

					const strArr = allIds.reduce((acc, id) => {
						const beforeOverwrite = before.cache.get(id);
						const afterOverwrite = after.cache.get(id);

						const added = afterOverwrite
							? (beforeOverwrite
									? afterOverwrite.allow.remove(beforeOverwrite.allow)
									: afterOverwrite.allow
								).toArray()
							: [];

						const denied = afterOverwrite
							? (beforeOverwrite
									? afterOverwrite.deny.remove(beforeOverwrite.deny)
									: afterOverwrite.deny
								).toArray()
							: [];

						const reset = beforeOverwrite
							? beforeOverwrite.allow
									.toArray()
									.concat(beforeOverwrite.deny.toArray())
									.filter(
										(str) =>
											!afterOverwrite ||
											!afterOverwrite.allow
												.toArray()
												.concat(afterOverwrite.deny.toArray())
												.includes(str)
									)
							: [];

						const overwriteType = beforeOverwrite?.type ?? afterOverwrite!.type;

						const mentionFn = overwriteType === OverwriteType.Member ? userMention : roleMention;

						const heading: string = mentionFn(id);

						const indentable = ObjectUtils.entries({ added, denied, reset }).reduce(
							(acc, [key, value]) => {
								if (value.length) {
									acc[key] = value.map((str) => StringUtils.convertToTitleCase(str)).join(", ");
								}

								return acc;
							},
							{} as Record<string, string>
						);

						if (ObjectUtils.isValidObject(indentable)) {
							const mappedEntries = ObjectUtils.entries(indentable).map(
								([key, value]) =>
									`${bold(StringUtils.capitaliseFirstLetter(key) + StringUtils.fieldNameSeparator)} ${value}`
							);

							const fieldValue = [heading].concat(mappedEntries).join(StringUtils.lineBreak);

							acc.push(fieldValue);
						}

						return acc;
					}, [] as string[]);

					return { fieldValue: strArr.join(StringUtils.lineBreak.repeat(2)) };
				}
			}
		});
	}

	@On({ event: Events.ThreadUpdate })
	public threadUpdate([oldThread, newThread]: ArgsOf<Events.ThreadUpdate>) {
		const embed = this.generateEmbed(newThread);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldThread,
			new: newThread,
			actionType: ActionType.DISCORD_THREAD_UPDATE,
			options: {
				name: true,
				type: ChannelType,
				autoArchiveDuration: ThreadAutoArchiveDuration,
				rateLimitPerUser() {
					return {
						name: "Slowmode",
						transformer(seconds) {
							return seconds ? prettyMilliseconds(seconds / 1000) : null;
						}
					};
				},
				parent() {
					return {
						name: "Category"
					};
				}
			}
		});
	}

	private channelFeat(options: AbstractClazzFeatOptions<NonThreadGuildBasedChannel>) {
		const { clazz, actionType } = options;

		const embed = this.generateEmbed(clazz);

		return DiscordEventLogManager.featHandler({
			embeds: [embed],
			clazz,
			actionType,
			options: {
				...ChannelLog.mutualNonThreadBasedOptions,
				permissionsLocked(value) {
					return { fieldValue: value ? String(value) : null };
				},
				permissionOverwrites(value) {
					if (clazz.permissionsLocked) {
						return { fieldValue: null };
					}

					const strArr = value.cache.reduce((acc, { allow, deny, type, id }) => {
						const parentOverwrites = clazz.parent?.permissionOverwrites.cache.get(id);

						const mentionFn = type === OverwriteType.Member ? userMention : roleMention;

						const heading: string = mentionFn(id);

						const indentable = ObjectUtils.entries({ allow, deny }).reduce(
							(acc, [key, value]) => {
								const isNotEmpty = value.bitfield !== 0n;
								const isNotInherited = !parentOverwrites?.[key].equals(value.bitfield);

								if (isNotEmpty && isNotInherited) {
									acc[key] = value
										.toArray()
										.map((str) => StringUtils.convertToTitleCase(str))
										.join(", ");
								}

								return acc;
							},
							{} as Record<string, string>
						);

						if (ObjectUtils.isValidObject(indentable)) {
							const mappedEntries = ObjectUtils.entries(indentable).map(
								([key, value]) =>
									`${bold(StringUtils.capitaliseFirstLetter(key) + StringUtils.fieldNameSeparator)} ${value}`
							);

							const fieldValue = [heading].concat(mappedEntries).join(StringUtils.lineBreak);

							acc.push(fieldValue);
						}

						return acc;
					}, [] as string[]);

					return { fieldValue: strArr.join(StringUtils.lineBreak.repeat(2)) };
				}
			}
		});
	}

	private generateEmbed(channel: GuildBasedChannel): EmbedBuilder {
		const embed = new EmbedBuilder().setDescription(`${channel}`).setFooter({
			text: `${channel.type === ChannelType.GuildCategory ? "Category" : channel.isThread() ? "Thread" : "Channel"} ID: ${channel.valueOf()}`
		});

		return embed;
	}
}
