import type { Typings } from "@ts/Typings.js";
import Discord, {
	type GuildBasedChannel,
	type GuildMember,
	type Role,
	type User,
	channelLink,
	hyperlink
} from "discord.js";

type GuildEntityType = "member" | "user" | "role" | "channel";
type EntityType = Exclude<GuildEntityType, "member">;
type GuildEntityTypeMap = {
	member: User;
	user: GuildMember;
	role: Role;
	channel: GuildBasedChannel;
};
type MentionFunction<T extends EntityType = EntityType> = (typeof Discord)[`${T}Mention`];
type MentionString<T extends EntityType = EntityType> = ReturnType<MentionFunction<T>>;

export abstract class EntityManager {
	public static getUserHyperlink(userId: string, withContent: boolean = true): string {
		const url = `https://discordapp.com/users/${userId}`;

		if (!withContent) {
			return url;
		}

		return hyperlink(userId, url);
	}

	public static getChannelHyperlink(channelId: string, guildId: string, withContent: boolean = true): string {
		const url = channelLink(channelId, guildId);

		if (!withContent) {
			return url;
		}

		return hyperlink(channelId, url);
	}

	public static getEntityType(entity: Typings.EntityObjectType): EntityType {
		return "avatarURL" in entity ? "user" : "color" in entity ? "role" : "channel";
	}

	public static getEntityName(entity: Typings.EntityObjectType): string {
		return "username" in entity ? entity.username : "user" in entity ? entity.user.username : entity.name;
	}

	public static getMentionStringFromEntity(entity: Typings.EntityObjectType): MentionString;
	public static getMentionStringFromEntity<const T extends EntityType>(entityId: string, type: T): MentionString<T>;
	public static getMentionStringFromEntity(
		entity: string | Typings.EntityObjectType,
		type?: EntityType
	): MentionString {
		let entityType: EntityType;
		let entityId: string;
		if (typeof entity === "string") {
			entityType = type!;
			entityId = entity;
		} else {
			entityType = this.getEntityType(entity);
			entityId = entity.id;
		}
		const entityMention = Discord[`${entityType}Mention`];

		return entityMention(entityId);
	}

	public static isEntityType<const T extends GuildEntityType>(
		entity: Typings.EntityObjectType,
		type: T
	): entity is GuildEntityTypeMap[T] {
		switch (type) {
			case "member":
				return "user" in entity;
			case "user":
				return "avatarURL" in entity;
			case "role":
				return "color" in entity;
			case "channel":
				return "parentId" in entity;
			default:
				return false;
		}
	}
}
