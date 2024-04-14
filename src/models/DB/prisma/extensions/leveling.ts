import { Beans } from "@framework/DI/Beans.js";
import { GuildManager } from "@managers/GuildManager.js";
import type { PrismaClient } from "@prisma/client";
import { EntityType, Prisma } from "@prisma/client";
import canvacord from "canvacord";
import { AttachmentBuilder, Colors, type Message } from "discord.js";
import { container, inject, singleton } from "tsyringe";

@singleton()
export class LevelingInstanceMethods {
	private client: PrismaClient;
	constructor(
		@inject(Beans.IExtensionInstanceMethods)
		_client: PrismaClient
	) {
		this.client = _client;
	}
	public async awardXP<T>(this: T, currentXP: number, message: Message<true>): Promise<void> {
		const instance = container.resolve(LevelingInstanceMethods);

		const guildMember = await GuildManager.getGuildMemberByMessage(message);

		const multiplier = await instance.getTotalMultiplier(message);
		const xpAmount = Math.floor(Math.random() * multiplier * (45 - 10 + 1) + 10);
		const levelBefore = instance.getCurrentLevel(currentXP);
		const levelAfter = instance.getCurrentLevel(currentXP + xpAmount);

		// Add to redis cache.
		if (levelBefore > levelAfter) {
			// do something
		}
	}
	public async sendLevelUp<T>(this: T, message: Message<true>, levelAfter: number): Promise<Message<true>> {
		const instance = container.resolve(LevelingInstanceMethods);

		const guildMember = await GuildManager.getGuildMemberByMessage(message);

		await message.channel.sendTyping();
		const attachment = await instance.buildRankCard(levelAfter, message);

		return await message.channel.send({
			content: `Congrats ${guildMember}! You are now level **${levelAfter}**!`,
			files: [attachment]
		});
	}
	public async buildRankCard<T>(this: T, levelAfter: number, message: Message<true>) {
		const instance = container.resolve(LevelingInstanceMethods);
		const ctx = Prisma.getExtensionContext(this);

		const DEFAULT_COLOUR = "#FFFFFF" as const;
		const RANK_COLOUR = "#E6C866" as const;

		const guildMember = await GuildManager.getGuildMemberByMessage(message, true);

		const currentXP = instance.getRequiredXP(levelAfter - 1);
		const currentLevel = instance.getCurrentLevel(currentXP);

		const leaderboardPosition = await instance.client.leveling
			.findMany({
				where: {
					entity: {
						type: EntityType.USER
					}
				},
				orderBy: {
					currentXp: "desc"
				},
				select: {
					entityId: true
				}
			})
			.then((arr) => arr.findIndex(({ entityId }) => entityId === message.author.id) + 1);

		const nextLevel = currentLevel + 1;
		const requiredXP = instance.getRequiredXP(nextLevel);

		const progressBarTrackHexCode = "#" + Colors.Blue.toString(16);

		const rank = new canvacord.RankCardBuilder()
			.setAvatar(guildMember.displayAvatarURL({ forceStatic: true }))
			.setRank(leaderboardPosition)
			.setCurrentXP(currentXP)
			.setLevel(currentLevel)
			.setRequiredXP(requiredXP)
			.setStatus(guildMember.presence?.status || "online")
			.setUsername(guildMember.user.username)
			.setDisplayName(guildMember.displayName);

		const rankCard = await rank.build();

		const attachment = new AttachmentBuilder(rankCard, {
			name: "RankCard.png"
		});

		return attachment;
	}
	public getCurrentLevel<T>(this: T, currentXP: number): number {
		const a = 45;
		const b = 10 * 3;
		const c = -currentXP;

		const discriminant = b ** 2 - 4 * a * c;

		if (discriminant < 0) {
			return -1;
		}

		const root1 = (-b + Math.sqrt(discriminant)) / (2 * a);
		const root2 = (-b - Math.sqrt(discriminant)) / (2 * a);

		const level = Math.max(root1, root2);

		return Math.floor(level);
	}
	public getRequiredXP<T>(this: T, currentLevel: number): number {
		currentLevel++;

		return 45 * currentLevel ** 2 + 30 * currentLevel;
	}
	public async getTotalMultiplier<T>(this: T, message: Message<true>): Promise<number> {
		const instance = container.resolve(LevelingInstanceMethods);

		const guildMember = await GuildManager.getGuildMemberByMessage(message, true);

		const userRoleIDs = Array.from(guildMember.roles.cache.values()).map((r) => r.id);

		const {
			_sum: { xpMultiplier }
		} = await instance.client.leveling.aggregate({
			_sum: {
				xpMultiplier: true
			},
			where: {
				entityId: {
					in: [...userRoleIDs, guildMember.id, message.channelId]
				}
			}
		});
		return xpMultiplier || 1;
	}
}
