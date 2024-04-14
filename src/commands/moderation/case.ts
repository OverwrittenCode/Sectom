import { LIGHT_GOLD, LINE_BREAK } from "@constants";
import type { PaginationItem } from "@discordx/pagination";
import { Pagination, PaginationType } from "@discordx/pagination";
import { Category, RateLimit, TIME_UNIT } from "@discordx/utilities";
import { DBConnectionManager } from "@managers/DBConnectionManager.js";
import { RedisCache } from "@models/DB/cache/index.js";
import type { Typings } from "@ts/Typings.js";
import { InteractionUtils } from "@utils/interaction.js";
import { ObjectUtils } from "@utils/object.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { ApplicationCommandOptionType, EmbedBuilder, TimestampStyles, bold, inlineCode, time } from "discord.js";
import { Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import ms from "ms";

type Doc = Typings.Database.Prisma.RetrieveModelDocument<"Case">;

@Discord()
@Category("Moderation")
@Guard(RateLimit(TIME_UNIT.seconds, 3))
@SlashGroup({ name: "case", description: "container of all cases in the server" })
@SlashGroup("case")
export abstract class Case {
	@Slash({ description: "Lists all cases on the server" })
	public async list(interaction: ChatInputCommandInteraction<"cached">) {
		const { guild, guildId } = interaction;

		const where = { guildId };

		const cacheRecord = await RedisCache.case.indexes.byGuildId.match(where);

		let rawDocuments: Doc[] = cacheRecord.map((record) => record.data);

		if (!rawDocuments.length) {
			const prismaDoc = await DBConnectionManager.Prisma.case.findMany({
				where,
				select: {
					id: true,
					action: true,
					createdAt: true,
					embeds: true
				}
			});

			if (!prismaDoc.length) {
				return await InteractionUtils.replyNoData(interaction);
			}

			rawDocuments = prismaDoc as Doc[];
		}

		const paginationPages: PaginationItem[] = [];
		const embedTitle = `${guild.name} Cases (${rawDocuments.length})`;

		const caseDescriptionStringArray = rawDocuments
			.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.map(
				(doc) =>
					`${inlineCode(doc.id)} ${bold(`[${doc.action}]`)} ${time(doc.createdAt, TimestampStyles.RelativeTime)}`
			);

		const caseDescriptionChunks = ObjectUtils.splitArrayChunks(caseDescriptionStringArray, 10);

		caseDescriptionChunks.forEach((chunk, index, arr) => {
			const embedDescription = chunk.join(LINE_BREAK);
			const embed = new EmbedBuilder()
				.setTitle(embedTitle)
				.setColor(LIGHT_GOLD)
				.setDescription(embedDescription)
				.setFooter({ text: `Page ${index + 1} / ${arr.length}` });

			paginationPages.push({ embeds: [embed] });
		});

		const pagination = new Pagination(interaction, paginationPages, {
			filter: (v) => v.user.id === interaction.user.id,
			enableExit: true,
			time: ms("10m"),
			type: PaginationType.Button
		});

		pagination.send();
	}

	@Slash({ description: "View a case on the server" })
	public async view(
		@SlashOption({
			description: "The case ID",
			name: "case_id",
			type: ApplicationCommandOptionType.String,
			required: true
		})
		id: string,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const { guildId } = interaction;
		const where = { guildId, id };

		let embeds: Doc["embeds"];

		const cacheRecord = await RedisCache.case.indexes.byGuildIdAndId.match(where);

		if (!cacheRecord.length) {
			const prismaDoc = await DBConnectionManager.Prisma.case.findUnique({
				where,
				select: { embeds: true }
			});

			if (!prismaDoc) {
				return await InteractionUtils.replyNoData(interaction);
			}

			embeds = prismaDoc.embeds;
		} else {
			embeds = cacheRecord[0].data.embeds;
		}

		return await InteractionUtils.replyOrFollowUp(interaction, { embeds });
	}
}
