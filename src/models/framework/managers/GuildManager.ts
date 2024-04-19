import assert from "assert";

import { ChannelType, type Guild, type GuildBasedChannel, GuildMember, type Role, type TextChannel } from "discord.js";

import type { Typings } from "~/ts/Typings.js";

import type { Message } from "discord.js";

type GuildEntityType = "user" | "role" | "channel";
type EntityObjectType<T extends GuildEntityType> = T extends "user"
	? GuildMember
	: T extends "role"
		? Role
		: GuildBasedChannel;

export abstract class GuildManager {
	public static async getGuildMemberByMessage<const OrFail extends boolean>(
		message: Message<true>,
		orFail?: OrFail
	): Promise<Typings.SetNullableCase<GuildMember, OrFail>> {
		const { member, guild } = message;
		if (member) {
			return member;
		}

		return await this.getGuildEntity(guild, message.author.id, "user", orFail);
	}

	public static async getGuildEntity<const T extends GuildEntityType, const OrFail extends boolean>(
		guild: Guild,
		entityId: string,
		type: T,
		orFail?: OrFail
	): Promise<Typings.SetNullableCase<EntityObjectType<T>, OrFail>> {
		const guildPropertyKey = type === "user" ? "members" : type === "role" ? "roles" : "channels";
		const guildEntityManager = guild[guildPropertyKey];
		let guildEntity = guildEntityManager.cache.get(entityId) as Typings.SetNullableCase<
			EntityObjectType<T>,
			OrFail
		>;

		if (!guildEntity) {
			const fetchedEntity = await guildEntityManager.fetch(entityId);
			if (orFail) {
				assert(fetchedEntity);
			}

			guildEntity = fetchedEntity as Typings.SetNullableCase<EntityObjectType<T>, OrFail>;
		}

		return guildEntity;
	}

	public static isGuildMember(target: any): target is GuildMember {
		return target instanceof GuildMember;
	}

	public static isChannelAuditable(channel: GuildBasedChannel): channel is TextChannel {
		return (
			channel.isTextBased() &&
			!channel.isVoiceBased() &&
			!channel.isThread() &&
			channel.type === ChannelType.GuildText
		);
	}
}
