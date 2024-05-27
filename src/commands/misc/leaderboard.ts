import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { AttachmentBuilder, type ChatInputCommandInteraction } from "discord.js";
import { Discord, Guard, Slash } from "discordx";

import { assets } from "~/assets/index.js";
import { LeaderboardBuilder } from "~/models/Canvacord/LeaderboardBuilder.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";

@Discord()
@Category(Enums.CommandCategory.Misc)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Leaderboard {
	private static TopDisplayedUsers = 5;

	@Slash({ dmPermission: false, description: "view the leaderboard for the leveling system" })
	public async leaderboard(interaction: ChatInputCommandInteraction<"cached">) {
		const { guildId, guild } = interaction;

		await InteractionUtils.deferInteraction(interaction);

		await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId, check: "leveling" });

		const leaderboardData = await DBConnectionManager.Prisma.leveling.fetchLeaderboard({
			guildId,
			take: Leaderboard.TopDisplayedUsers
		});

		if (leaderboardData.length) {
			await interaction.guild.members.fetch({
				user: leaderboardData.map(({ entityId }) => entityId)
			});
		}

		const players = leaderboardData
			.concat(Array(Leaderboard.TopDisplayedUsers - leaderboardData.length).fill({ currentXP: 0, entityId: "" }))
			.map(({ currentXP: xp, entityId }, i) => {
				const result = {
					avatar: assets.unknownImage,
					displayName: "???",
					username: "???",
					rank: i + 1,
					level: 0,
					xp
				};

				if (!entityId && !xp) {
					return result;
				}

				const level = DBConnectionManager.Prisma.leveling.getCurrentLevel(xp);

				const member = interaction.guild.members.resolve(entityId);

				if (!member) {
					return result;
				}

				const {
					displayName,
					user: { username }
				} = member;

				const avatar = member.displayAvatarURL({ size: 1024, forceStatic: true });

				return Object.assign(result, { displayName, username, avatar, level });
			});

		const leaderboardBuilder = new LeaderboardBuilder()
			.setHeader({
				title: guild.name,
				image: guild.iconURL({ forceStatic: true }) ?? assets.unknownImage,
				subtitle: `${guild.memberCount} members`
			})
			.setPlayers(players);

		const leaderboardCard = await leaderboardBuilder.build({ format: "png" });

		const attachment = new AttachmentBuilder(leaderboardCard, {
			name: "LeaderboardCard.png",
			description: "Leveling Leaderboard"
		});

		return await InteractionUtils.replyOrFollowUp(interaction, { files: [attachment] });
	}
}
