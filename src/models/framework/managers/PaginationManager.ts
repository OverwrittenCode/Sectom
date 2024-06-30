import { Pagination, PaginationType } from "@discordx/pagination";
import { EmbedBuilder } from "discord.js";
import _ from "lodash";

import { LIGHT_GOLD, MAX_ELEMENTS_PER_PAGE } from "~/constants.js";
import { CommandUtils } from "~/utils/command.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type {
	PaginationInteractions,
	PaginationItem,
	PaginationOptions,
	PaginationResolver
} from "@discordx/pagination";
import type { APIEmbed, InteractionResponse, Message, TextBasedChannel } from "discord.js";

interface HandleStaticOptions {
	sendTo: PaginationInteractions | Message;
	embedTitle: string;
	descriptionArray: string[];
	config?: PaginationOptions;
	ephemeral?: boolean;
}

type PaginationOutput = Awaited<ReturnType<Pagination["send"]>>;

export class PaginationManager<T extends PaginationResolver = PaginationResolver> extends Pagination<T> {
	public static async handleStatic(
		options: HandleStaticOptions
	): Promise<PaginationOutput | Message<boolean> | InteractionResponse<boolean> | null> {
		const { sendTo, embedTitle, descriptionArray, config, ephemeral } = options;

		const paginationPages: Array<{ embeds: APIEmbed[] }> = [];

		const descriptionChunks = _.chunk(descriptionArray, MAX_ELEMENTS_PER_PAGE);

		descriptionChunks.forEach((chunk, index, arr) => {
			const embedDescription = chunk.join(StringUtils.LineBreak);
			const embed = new EmbedBuilder()
				.setTitle(embedTitle)
				.setColor(LIGHT_GOLD)
				.setDescription(embedDescription)
				.setFooter({ text: `Page ${index + 1} / ${arr.length}` });

			paginationPages.push({ embeds: [embed.toJSON()] });
		});

		if (paginationPages.length === 1) {
			const paginationPage = paginationPages[0];

			delete paginationPage.embeds[0].footer;

			if ("deferred" in sendTo) {
				return await InteractionUtils.replyOrFollowUp(sendTo, { ...paginationPage, ephemeral });
			}

			return await sendTo.channel.send(paginationPage);
		}

		const pagination = new PaginationManager(sendTo, paginationPages, {
			ephemeral,
			type: PaginationType.Button,
			...config
		});

		return await pagination.init();
	}

	constructor(
		sendTo: PaginationInteractions | Message | TextBasedChannel,
		pages: PaginationItem[] | T,
		config: PaginationOptions
	) {
		config.showStartEnd ??= true;
		config.time ??= CommandUtils.CollectionTime;
		config.enableExit ??= !config.ephemeral;
		config.onTimeout ??= (_, message) => InteractionUtils.disableComponents(message);

		const isRestrictableToController = "applicationId" in sendTo;

		if (!config.filter && isRestrictableToController) {
			const controllerId = "user" in sendTo ? sendTo.user.id : sendTo.author.id;
			config.filter = (i) => i.user.id === controllerId;
		}

		super(sendTo, pages, config);
	}

	public async init(): Promise<PaginationOutput> {
		const fn = () => this.send();

		try {
			return await fn();
		} catch (err) {
			if (InteractionUtils.isDeferRaceCondition(err)) {
				return await fn();
			}

			throw err;
		}
	}
}
