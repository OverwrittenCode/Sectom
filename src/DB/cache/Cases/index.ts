import { Pagination, PaginationType } from "@discordx/pagination";
import {
	ButtonStyle,
	Colors,
	CommandInteraction,
	ContextMenuCommandInteraction,
	EmbedBuilder,
	MessageComponentInteraction
} from "discord.js";

import { capitalizeFirstLetter, concatenate } from "../../../utils/casing.js";
import {
	MAX_DESCRIPTION_LENGTH,
	UNEXPECTED_FALSY_VALUE__MESSAGE
} from "../../../utils/config.js";
import { ValidationError } from "../../../utils/errors/ValidationError.js";
import { replyNoData, replyOrFollowUp } from "../../../utils/interaction.js";
import {
	ButtonIDFormat,
	TargetClass,
	TargetClassSingular
} from "../../../utils/ts/Access.js";
import { GuildInteraction } from "../../../utils/ts/Action.js";
import { ClassPropertyNames, ObjectValues } from "../../../utils/ts/General.js";
import { Cases, CasesModel } from "../../models/Moderation/Cases.js";
import { RedisCache } from "../index.js";
import { CacheDocument, CacheManager } from "../manager.js";

import { CasesCacheSubListManager } from "./sublist.js";

type CachedCasesDocument = CacheDocument<Cases>;

export type SnowflakeType = `${TargetClass}`;
export type InputFilters = SnowflakeType[];
type SearchFilter = InputFilters | ["all"];
type SnowflakeMentionObject = {
	users: "@";
	roles: "@&";
	channels: "#";
};

type ButtonPaginationPositions = "start" | "previous" | "next" | "end" | "exit";

type ButtonPaginationOption = {
	emoji: { name: string };
	id: string;
	label: string;
	style: ButtonStyle;
};

type ButtonPaginationOptions = {
	type: PaginationType.Button;
	ephemeral: boolean;
} & {
	[K in ButtonPaginationPositions]: ButtonPaginationOption;
};

type PaginationData = {
	id: string;
	name: string;
	snowflakeType: SnowflakeType;
};
type DiscordMention =
	`<${ObjectValues<SnowflakeMentionObject>}${number}>\`${string}\``;

export type CaseType = Exclude<ClassPropertyNames<Cases>, "server">;
interface PaginationButtonOptions<T extends SearchFilter> {
	caseType: CaseType;
	searchFilter: T;
}

interface PaginationSenderOptions<T extends SearchFilter>
	extends PaginationButtonOptions<T> {
	interaction:
		| CommandInteraction
		| MessageComponentInteraction
		| ContextMenuCommandInteraction;
	commandName?: string;
}

interface EmbedCreationOptions {
	interaction: GuildInteraction;
	data: PaginationData[];
	mappedData: string[];
	caseType: CaseType;
	isAll: boolean;
}

export class CasesCacheManager extends CacheManager<Cases> {
	public blacklist: CasesCacheSubListManager;
	public whitelist: CasesCacheSubListManager;
	constructor() {
		super("cases:", "server");
		this.blacklist = new CasesCacheSubListManager("blacklist");
		this.whitelist = new CasesCacheSubListManager("whitelist");
	}

	private createButtonPaginationOption(
		prefix: string,
		type: string,
		emoji: string
	): ButtonPaginationOption {
		return {
			emoji: { name: emoji },
			id: `${prefix}_${type}`,
			label: "\u200B",
			style: ButtonStyle.Secondary
		};
	}

	private createButtonPaginationOptions(
		prefix: string
	): ButtonPaginationOptions {
		return {
			type: PaginationType.Button,
			ephemeral: true,
			start: this.createButtonPaginationOption(prefix, "beginning", "⏮️"),
			previous: this.createButtonPaginationOption(prefix, "previous", "◀"),
			next: this.createButtonPaginationOption(prefix, "next", "▶"),
			end: this.createButtonPaginationOption(prefix, "end", "⏭"),
			exit: this.createButtonPaginationOption(prefix, "exit", "❌")
		};
	}

	private createButtonPagination<T extends SearchFilter>(
		options: PaginationButtonOptions<T>
	) {
		const { caseType, searchFilter } = options;
		const filterArray = searchFilter as Array<SnowflakeType | "all">;

		const snowflakePluralType =
			filterArray[0] === "all" ? "guilds" : filterArray[0];

		const snowflakeSingularType = snowflakePluralType.slice(0, -1) as
			| `${TargetClassSingular}`
			| "guild";

		const prefix =
			`${caseType}_${snowflakeSingularType}_pagination` as ButtonIDFormat<"pagination">;

		return this.createButtonPaginationOptions(prefix);
	}

	private createSnowflakeTypes(
		cachedCases: CachedCasesDocument,
		keys: InputFilters,
		caseType: CaseType,
		commandName?: string
	): InputFilters {
		const caseTypeDocument = cachedCases[caseType];

		return keys.filter((key) =>
			commandName
				? caseTypeDocument.commands.some(
						(cmd) =>
							cmd.commandName === commandName && cmd[key].length >= 1
				  )
				: caseTypeDocument[key].length >= 1
		);
	}

	private createPaginatedData(
		cachedCases: CachedCasesDocument,
		snowflakeType: SnowflakeType,
		caseType: CaseType,
		commandName?: string
	): PaginationData[] {
		const caseTypeDocument = cachedCases[caseType];
		let snowflakeTypeDocument = caseTypeDocument[snowflakeType];

		if (commandName) {
			const cmd = caseTypeDocument.commands.find(
				(cmd) => cmd.commandName === snowflakeType
			);
			if (!cmd) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			snowflakeTypeDocument = cmd[snowflakeType];
		}

		return snowflakeTypeDocument.map(({ id, name }) => ({
			id,
			name,
			snowflakeType
		}));
	}

	private createDiscordMentions(
		paginationData: PaginationData[]
	): DiscordMention[] {
		const snowflakeMentionObject: SnowflakeMentionObject = {
			users: "@",
			roles: "@&",
			channels: "#"
		};

		return paginationData.map(
			(data) =>
				`<${snowflakeMentionObject[data.snowflakeType]}${data.id}> \`(${
					data.name
				})\`` as DiscordMention
		);
	}

	private createEmbeds(options: EmbedCreationOptions): EmbedBuilder[] {
		const { mappedData, interaction, data, caseType, isAll } = options;
		if (!interaction.guild || !interaction.guildId) {
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		}
		let embeds: EmbedBuilder[] = [];
		let description: string = "";

		for (const str of mappedData) {
			const isLastElement = mappedData.indexOf(str) == mappedData.length - 1;
			const isExceeding =
				description.length + str.length > MAX_DESCRIPTION_LENGTH;

			if (isLastElement || isExceeding) {
				if (isLastElement) {
					description += str;
				}
				const guildName = interaction.guild.name;
				const CapitaliseSubCommandType = isAll
					? ""
					: capitalizeFirstLetter(
							data[0].snowflakeType.slice(
								0,
								-1
							) as `${TargetClassSingular}`
					  );
				const CapitaliseCaseType = capitalizeFirstLetter(caseType);
				const title = concatenate(
					guildName,
					CapitaliseSubCommandType,
					CapitaliseCaseType
				);

				const embed = new EmbedBuilder()
					.setTitle(title)
					.setColor(Colors.DarkGold)
					.setDescription(description);

				embeds.push(embed);
				description = "";
				break;
			}

			description += str;
		}

		if (embeds.length > 1) {
			embeds = embeds.map((embed, index, arr) =>
				embed.setFooter({ text: `Page ${index + 1}/${arr.length}` })
			);
		}

		return embeds;
	}

	public async PaginateData<T extends SearchFilter>(
		cachedCases: CachedCasesDocument,
		options: PaginationSenderOptions<T>
	) {
		const { interaction, searchFilter, caseType, commandName } = options;

		if (!interaction.guild || !interaction.guildId) {
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		}

		const filterArray = searchFilter as Array<SnowflakeType | "all">;
		const isAll = filterArray.includes("all");
		const selection: InputFilters = ["users", "roles", "channels"];

		const keys = isAll
			? selection
			: selection.filter((str) => filterArray.includes(str));

		const paginationDataArray: PaginationData[] = [];
		const snowflakeTypes = this.createSnowflakeTypes(
			cachedCases,
			keys,
			caseType,
			commandName
		);

		if (snowflakeTypes.length == 0) {
			return await replyNoData(interaction);
		}

		for (const snowflakeType of snowflakeTypes) {
			const paginatedDataArray = this.createPaginatedData(
				cachedCases,
				snowflakeType,
				caseType,
				commandName
			);
			paginationDataArray.push(...paginatedDataArray);
		}

		const mappedData = this.createDiscordMentions(paginationDataArray);
		const embeds = this.createEmbeds({
			interaction,
			data: paginationDataArray,
			mappedData,
			caseType,
			isAll
		});
		if (embeds.length == 1) {
			return await replyOrFollowUp(interaction, {
				embeds,
				ephemeral: true
			});
		}

		const buttons = this.createButtonPagination({
			caseType,
			searchFilter
		});

		const pages = embeds.map((embed) => {
			return {
				embeds: [embed]
			};
		});

		return await new Pagination(interaction, pages, buttons).send();
	}

	public async getByServerId(interaction: GuildInteraction) {
		if (!interaction.guild || !interaction.guildId) {
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		}
		const server = await RedisCache.server.findOrCreate(interaction);

		const serverCase = await this.get(server.document._id.toString());
		if (!serverCase) {
			const databaseCasesDocument = await CasesModel.findByServerId(
				interaction.guildId
			);
			if (!databaseCasesDocument) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			const cachedCasesDocument = await this.set(databaseCasesDocument);
			if (!cachedCasesDocument) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}
			return cachedCasesDocument;
		}

		return serverCase;
	}
}
