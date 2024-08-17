import { ActionType, EntityType, EventType } from "@prisma/client";
import canvacord from "canvacord";
import { AttachmentBuilder, ChannelType, type Message, bold, roleMention } from "discord.js";
import { container, inject, singleton } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import { GuildInstanceMethods } from "~/models/DB/prisma/extensions/guild.js";
import { LogChannelInstanceMethods } from "~/models/DB/prisma/extensions/logChannel.js";
import type { Typings } from "~/ts/Typings.js";

import type { FetchExtendedClient } from "./types/index.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { SetOptional, Simplify } from "type-fest";

interface GetLevelingDataOutput extends Required<PrismaJson.LevelingXPOptions> {
	currentLevel: number;
	currentXP: number;
	doc: Typings.Database.Prisma.RetrieveModelDocument<"Leveling">;
	isOnCooldown: boolean;
}

interface AwardXPOptions {
	interaction: InteractionType;
	levelingData?: GetLevelingDataOutput | null;
	target: GuildMember;
}

interface LevelRequiredOptions extends AwardXPOptions {
	levelAfter: number;
}

interface FetchLeaderboardOptions {
	fetchAfter?: boolean;
	guildId: string;
	take?: number;
}

type FetchLeaderboardOutput = Array<
	Simplify<Omit<Typings.Database.Prisma.RetrieveModelDocument<"Leveling">, "createdAt" | "updatedAt">>
>;

type InteractionType = Message<true> | ChatInputCommandInteraction<"cached">;

canvacord.Font.loadDefault();

@singleton()
export class LevelingInstanceMethods {
	private static readonly MAX_XP = 45;
	private static readonly MIN_XP = 10;

	private readonly client: FetchExtendedClient;

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public async awardXP<T>(this: T, options: AwardXPOptions): Promise<void> {
		const clazz = container.resolve(LevelingInstanceMethods);

		const { interaction, target, levelingData = await clazz.getLevelingData(interaction, target) } = options;

		const { guildId } = interaction;

		if (!levelingData) {
			return;
		}

		const { currentLevel: levelBefore, currentXP, multiplier } = levelingData;

		const xpAmount = Math.floor(
			Math.random() * multiplier * (LevelingInstanceMethods.MAX_XP - LevelingInstanceMethods.MIN_XP + 1) + 10
		);

		const newXP = currentXP + xpAmount;

		const levelAfter = clazz.getCurrentLevel(newXP);

		await clazz.client.leveling.upsert({
			where: {
				id: {
					guildId,
					entityId: target.id
				}
			},
			update: {
				currentXP: newXP
			},
			create: {
				...levelingData.doc,
				currentXP: newXP
			},
			select: {
				currentXP: true
			}
		});

		const requiredXP = clazz.getRequiredXP(levelBefore);

		const isNextLevel = levelAfter > levelBefore;
		const isNotDuplicateRequest = currentXP <= requiredXP;

		if (isNextLevel && isNotDuplicateRequest) {
			await clazz.sendLevelUp({ interaction, target, levelAfter, levelingData });
		}
	}

	public async buildRankCard<T>(
		this: T,
		options: SetOptional<Omit<LevelRequiredOptions, "levelingData">, "levelAfter">
	): Promise<AttachmentBuilder> {
		const clazz = container.resolve(LevelingInstanceMethods);

		const { interaction, target, levelAfter } = options;

		let currentXP: number | null;
		let currentLevel: number | null;

		if (levelAfter) {
			currentXP = clazz.getRequiredXP(levelAfter - 1);

			currentLevel = clazz.getCurrentLevel(currentXP);
		} else {
			const data = await clazz.getLevelingData(interaction, target);

			currentLevel = data.currentLevel;
			currentXP = data.currentXP;
		}

		const leaderboardPosition = await clazz
			.fetchLeaderboard({ guildId: interaction.guildId })
			.then((arr) => arr.findIndex(({ entityId }) => entityId === target.id) + 1);

		const nextLevel = currentLevel + 1;
		const requiredXP = clazz.getRequiredXP(nextLevel);

		const rank = new canvacord.RankCardBuilder()
			.setAvatar(target.displayAvatarURL({ forceStatic: true }))
			.setRank(leaderboardPosition)
			.setCurrentXP(currentXP)
			.setLevel(currentLevel)
			.setRequiredXP(requiredXP)
			.setStatus(target.presence?.status ?? "none")
			.setDisplayName(target.user.displayName);

		const rankCard = await rank.build();

		const attachment = new AttachmentBuilder(rankCard, {
			name: "RankCard.png"
		});

		return attachment;
	}

	public async fetchLeaderboard<T>(this: T, options: FetchLeaderboardOptions): Promise<FetchLeaderboardOutput> {
		const clazz = container.resolve(LevelingInstanceMethods);

		const { guildId, take } = options;

		return await clazz.client.leveling.fetchMany({
			where: {
				guildId
			},
			take,
			orderBy: {
				currentXP: "desc"
			},
			select: {
				currentXP: true
			}
		});
	}

	public getCurrentLevel<T>(this: T, currentXP: number): number {
		const a = LevelingInstanceMethods.MAX_XP;
		const b = LevelingInstanceMethods.MIN_XP * 3;
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

	public async getLevelingData<T>(
		this: T,
		interaction: InteractionType,
		target: GuildMember
	): Promise<GetLevelingDataOutput> {
		const clazz = container.resolve(LevelingInstanceMethods);
		const _guild = container.resolve(GuildInstanceMethods);

		const { guildId, channelId } = interaction;

		const {
			configuration: { leveling }
		} = await _guild.fetchValidConfiguration({ guildId, check: "leveling" });

		const connectGuild = {
			connect: {
				id: guildId
			}
		};

		const { doc } = await clazz.client.leveling.fetchById({
			id: {
				guildId,
				entityId: target.id
			},
			createData: {
				guild: connectGuild,
				entity: {
					connectOrCreate: {
						where: {
							id: target.id
						},
						create: {
							id: target.id,
							type: EntityType.USER,
							guild: connectGuild
						}
					}
				}
			}
		});

		if (leveling.overrides) {
			const ids = [channelId, target.id].concat(target.roles.cache.map(({ id }) => id));

			const { cooldown, multiplier } = Object.values(leveling.overrides).reduce(
				(acc, curr) => {
					if (!ids.includes(curr.id)) {
						return acc;
					}

					const cooldown = Math.max(curr.cooldown ?? 0, acc.cooldown);

					let multiplier = curr.multiplier ?? 0;

					if (leveling.stackXPMultipliers) {
						multiplier += acc.multiplier;
					} else if (acc.multiplier > multiplier) {
						multiplier = acc.multiplier;
					}

					return { cooldown, multiplier };
				},
				{ cooldown: 0, multiplier: 0 }
			);

			leveling.cooldown = cooldown || leveling.cooldown;
			leveling.multiplier = multiplier || leveling.multiplier;
		}

		const { updatedAt, currentXP } = doc;

		const cooldownExpiryTimestamp = +updatedAt + leveling.cooldown;

		const isOnCooldown = Date.now() < cooldownExpiryTimestamp;

		const currentLevel = clazz.getCurrentLevel(currentXP);

		return { doc, isOnCooldown, currentXP, currentLevel, ...leveling };
	}

	public getRequiredXP<T>(this: T, currentLevel: number): number {
		const nextLevel = ++currentLevel;

		const a = LevelingInstanceMethods.MAX_XP;
		const b = LevelingInstanceMethods.MIN_XP * 3;

		return a * nextLevel ** 2 + b * nextLevel;
	}

	public async sendLevelUp<T>(this: T, options: LevelRequiredOptions): Promise<void> {
		const clazz = container.resolve(LevelingInstanceMethods);
		const _logChannel = container.resolve(LogChannelInstanceMethods);

		const { interaction, target, levelingData, levelAfter } = options;

		let grantedRoleMention: string | null = null;

		if (levelingData) {
			const grantedRoleData = levelingData.roles
				.toSorted((a, b) => b.level - a.level)
				.find(({ level }) => level === levelAfter);

			if (grantedRoleData) {
				try {
					await target.roles.add(grantedRoleData.id);

					grantedRoleMention = roleMention(grantedRoleData.id);
				} catch {
					// delibertly do nothing
					// the error will be to do with:
					// permission or unknown role/member
				}
			}
		}

		const logChannelData = await _logChannel.retrieveMatching({
			input: interaction,
			actionType: ActionType.LEVEL_UP_ACKNOWLEDGED_NEW,
			eventType: EventType.BOT
		});

		const levelChannel = logChannelData?.channel ?? interaction.channel;

		if (!levelChannel || levelChannel.type !== ChannelType.GuildText) {
			return;
		}

		await levelChannel.sendTyping();

		const attachment = await clazz.buildRankCard({ interaction, target, levelAfter });

		if (!attachment) {
			return;
		}

		let content = `Congrats ${target.toString()}! You are now level ${bold(levelAfter.toString())}!`;

		if (grantedRoleMention) {
			content += ` You have earned ${grantedRoleMention}`;
		}

		await levelChannel.send({
			content,
			files: [attachment]
		});
	}
}
