import assert from "assert";

import { EntityType } from "@prisma/client";
import canvacord from "canvacord";
import { AttachmentBuilder, Colors, type Message } from "discord.js";
import { container, singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

import { EntityRedisCache } from "./entity.js";

const indexList = [["guildId"]] as const satisfies Typings.Database.Redis.TTerms<"Leveling">[];

@singleton()
export class LevelingRedisCache extends RedisCacheManager<"Leveling", typeof indexList> {
	private static MAX_XP = 45 as const;
	private static MIN_XP = 10 as const;
	private static RANK_CARD = {
		DEFAULT_COLOUR: "#FFFFFF",
		LEADERBOARD_RANK_COLOUR: "#E6C866"
	} as const;

	constructor() {
		super("Leveling", indexList);
	}

	public static getCurrentLevel(currentXP: number): number {
		const a = this.MAX_XP;
		const b = this.MIN_XP * 3;
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
	public static getRequiredXP(currentLevel: number): number {
		currentLevel++;

		return 45 * currentLevel ** 2 + 30 * currentLevel;
	}

	public async awardXP(currentXP: number, message: Message<true>): Promise<number> {
		const multiplier = await this.getTotalMultiplier(message);
		const xpAmount = Math.floor(
			Math.random() * multiplier * (LevelingRedisCache.MAX_XP - LevelingRedisCache.MIN_XP + 1) +
				LevelingRedisCache.MIN_XP
		);
		const newXP = currentXP + xpAmount;
		const levelBefore = LevelingRedisCache.getCurrentLevel(currentXP);
		const levelAfter = LevelingRedisCache.getCurrentLevel(newXP);

		if (levelBefore > levelAfter) {
			const guildId_entityId = await LevelingRedisCache.getDocumentID(message);

			const document = await this.collection.get(guildId_entityId);
			assert(document);
			const { data } = document;

			data.currentXp = newXP;

			await this.collection.update(guildId_entityId, data);
		}

		return newXP;
	}

	public async sendLevelUp(message: Message<true>, levelAfter: number): Promise<Message<true>> {
		const guildMember = message.guild.members.resolve(message.author.id)!;

		await message.channel.sendTyping();
		const attachment = await this.buildRankCard(levelAfter, message);

		return await message.channel.send({
			content: `Congrats ${guildMember}! You are now level **${levelAfter}**!`,
			files: [attachment]
		});
	}

	public async buildRankCard(levelAfter: number, message: Message<true>) {
		const { guildId } = message;
		const guildMember = message.guild.members.resolve(message.author.id)!;

		const currentXP = LevelingRedisCache.getRequiredXP(levelAfter - 1);
		const currentLevel = LevelingRedisCache.getCurrentLevel(currentXP);

		const guildRedisCacheQueryMatchOutput = await this.indexes.byGuildId.match({
			guildId
		});

		let leaderboardEntityIdArray: string[] = guildRedisCacheQueryMatchOutput
			.map((output) => output.data)
			.sort((a, b) => b.currentXp - a.currentXp)
			.map((document) => document.entityId);

		if (!leaderboardEntityIdArray.length) {
			const entityRedisCache = container.resolve(EntityRedisCache);
			const entityByGuildAndTypeFilter = await entityRedisCache.indexes.byGuildIdAndType.match({
				guildId,
				type: EntityType.USER
			});
			const entityUserIDArray = entityByGuildAndTypeFilter.map((obj) => obj.data.id);

			leaderboardEntityIdArray = guildRedisCacheQueryMatchOutput
				.map((output) => output.data)
				.filter((data) => entityUserIDArray.includes(data.entityId))
				.sort((a, b) => b.currentXp - a.currentXp)
				.map((data) => data.entityId);
		}

		const leaderboardPosition =
			leaderboardEntityIdArray.findIndex((entityId) => entityId === message.author.id) + 1;

		const nextLevel = currentLevel + 1;
		const requiredXP = LevelingRedisCache.getRequiredXP(nextLevel);

		const progressBarTrackHexCode = "#" + Colors.Blue.toString(16);

		const rank = new canvacord.RankCardBuilder()
			.setAvatar(guildMember.displayAvatarURL({ forceStatic: true }))
			.setRank(leaderboardPosition)
			// .setRankColor(
			// 	leaderboardPosition <= 3
			// 		? LevelingRedisCache.RANK_CARD.LEADERBOARD_RANK_COLOUR
			// 		: LevelingRedisCache.RANK_CARD.DEFAULT_COLOUR
			// )
			.setCurrentXP(currentXP)
			.setLevel(currentLevel)
			.setRequiredXP(requiredXP)
			.setStatus(guildMember.presence?.status || "online")
			// .setProgressBarTrack(progressBarTrackHexCode)
			// .setProgressBar(LevelingRedisCache.RANK_CARD.DEFAULT_COLOUR)
			.setUsername(guildMember.user.username);

		const rankCard = await rank.build();

		const attachment = new AttachmentBuilder(rankCard, {
			name: "RankCard.png"
		});

		return attachment;
	}
	// where: Prisma.<>WhereInput

	public async getTotalMultiplier(message: Message<true>): Promise<number> {
		const guildMember = message.guild.members.resolve(message.author.id)!;

		const userRoleIDs = Array.from(guildMember.roles.cache.values()).map((r) => r.id);

		const guildLevelingObjectArray = await this.indexes.byGuildId.match({ guildId: message.guildId });
		const totalLevelingXPMultiplier =
			guildLevelingObjectArray
				.map((obj) => obj.data)
				.filter(
					(data) =>
						data.entityId === guildMember.id ||
						message.channelId === data.entityId ||
						userRoleIDs.includes(data.entityId)
				)
				.reduce((accumulator, currentValue) => accumulator + currentValue.xpMultiplier, 0) ?? 1;

		return totalLevelingXPMultiplier;
	}

	public static async getDocumentID(message: Message<true>): Promise<string> {
		const guildMember = message.guild.members.resolve(message.author.id)!;
		const guildId_entityId = message.guildId + "_" + guildMember.id;
		return guildId_entityId;
	}
}
