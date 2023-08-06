import { Pagination, PaginationType } from "@discordx/pagination";
import type {
	DocumentType,
	Ref,
	ReturnModelType,
	SubDocumentType,
	types
} from "@typegoose/typegoose";
import {
	getModelForClass,
	isDocument,
	prop,
	queryMethod
} from "@typegoose/typegoose";
import {
	ButtonStyle,
	Colors,
	CommandInteraction,
	ContextMenuCommandInteraction,
	EmbedBuilder,
	MessageComponentInteraction
} from "discord.js";

import { capitalizeFirstLetter, concatenate } from "../../utils/casing.js";
import {
	MAX_DESCRIPTION_LENGTH,
	UNEXPECTED_FALSY_VALUE__MESSAGE
} from "../../utils/config.js";
import { ValidationError } from "../../utils/errors/ValidationError.js";
import { replyNoData, replyOrFollowUp } from "../../utils/interaction.js";
import {
	ButtonIDFormat,
	TargetClass,
	TargetClassSingular
} from "../../utils/ts/Access.js";
import { GuildInteraction } from "../../utils/ts/Action.js";
import { ClassPropertyNames, ObjectValues } from "../../utils/ts/General.js";
import { Server, User } from "../Server.js";

import { Blacklist, Whitelist } from "./List.js";

type SubList = SubDocumentType<
	InstanceType<typeof Whitelist | typeof Blacklist>
>;

type Filter = `${TargetClass}`;
type InputFilters = Filter[];
type SearchFilter = InputFilters | ["all"];
type SnowflakeTypeMention = {
	users: "@";
	roles: "@&";
	channels: "#";
};

type PaginationData = {
	id: string;
	name: string;
	snowflakeType: Filter;
};
type PaginationElement =
	`<${ObjectValues<SnowflakeTypeMention>}${number}>\`${string}\``;

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

interface QueryHelpers {
	findByCaseNumber: types.AsQueryMethod<typeof findByCaseNumber>;
}

function findByCaseNumber(
	this: types.QueryHelperThis<typeof Cases, QueryHelpers>,
	caseNumber: number
) {
	const doc = this.find({
		$or: [
			{ "whitelist.caseNumber": caseNumber },
			{ "blacklist.caseNumber": caseNumber },
			{ actions: { $elemMatch: { caseNumber } } }
		]
	});

	return doc;
}

@queryMethod(findByCaseNumber)
export class Cases {
	@prop({ type: () => Whitelist, default: {} })
	public whitelist!: SubList;

	@prop({ type: () => Blacklist, default: {} })
	public blacklist!: SubList;

	@prop({ ref: () => Server, unique: true })
	public readonly server!: Ref<Server>;

	public createPaginationOption(
		this: DocumentType<Cases>,
		prefix: string,
		type: string,
		emoji: string
	) {
		return {
			emoji: { name: emoji },
			id: `${prefix}_${type}`,
			label: "\u200B",
			style: ButtonStyle.Secondary
		};
	}

	public createPaginationOptions(this: DocumentType<Cases>, prefix: string) {
		return {
			type: PaginationType.Button,
			start: this.createPaginationOption(prefix, "beginning", "⏮️"),
			previous: this.createPaginationOption(prefix, "previous", "◀"),
			next: this.createPaginationOption(prefix, "next", "▶"),
			end: this.createPaginationOption(prefix, "end", "⏭"),
			exit: this.createPaginationOption(prefix, "exit", "❌"),
			ephemeral: true
		};
	}

	public createPaginationButtons<T extends SearchFilter>(
		this: DocumentType<Cases>,
		options: PaginationButtonOptions<T>
	) {
		const { caseType, searchFilter } = options;
		const filterArray = searchFilter as Array<Filter | "all">;

		const snowflakePluralType =
			filterArray[0] == "all" ? "guilds" : filterArray[0];

		const snowflakeSingularType = snowflakePluralType.slice(0, -1) as
			| `${TargetClassSingular}`
			| "guild";

		const prefix =
			`${caseType}_${snowflakeSingularType}_pagination` as ButtonIDFormat<"pagination">;

		return this.createPaginationOptions(prefix);
	}

	public getMatchingCases(
		this: DocumentType<Cases>,
		keys: InputFilters,
		caseType: CaseType,
		commandName?: string
	): InputFilters {
		const { commands } = this[caseType];
		return keys.filter((key) =>
			commandName
				? commands.some(
						(cmd) =>
							cmd.commandName == commandName && cmd[key].length >= 1
				  )
				: this[caseType][key].length >= 1
		);
	}

	public getSnowflakeArr(
		this: DocumentType<Cases>,
		matchingCase: Filter,
		caseType: CaseType,
		commandName?: string
	): PaginationData[] {
		let SnowflakeSubDocument: types.ArraySubDocumentType<User>[] =
			this[caseType][matchingCase];

		if (commandName) {
			const cmd = this[caseType].commands.find(
				(cmd) => cmd.commandName == matchingCase
			);
			if (!cmd) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

			SnowflakeSubDocument = cmd[matchingCase];
		}

		return SnowflakeSubDocument.map((doc) => {
			return {
				id: doc.id as string,
				name: doc.name as string,
				snowflakeType: matchingCase
			};
		});
	}

	public mapDataToMention(
		this: DocumentType<Cases>,
		data: PaginationData[]
	): PaginationElement[] {
		const snowflakeMentionObj: SnowflakeTypeMention = {
			users: "@",
			roles: "@&",
			channels: "#"
		};

		return data.map(
			(paginationData) =>
				`<${snowflakeMentionObj[paginationData.snowflakeType]}${
					paginationData.id
				}> \`(${paginationData.name})\`` as PaginationElement
		);
	}

	public createEmbeds(
		this: DocumentType<Cases>,
		options: EmbedCreationOptions
	): EmbedBuilder[] {
		const { mappedData, interaction, data, caseType, isAll } = options;
		if (!interaction.guild || !interaction.guildId)
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		let embeds: EmbedBuilder[] = [];
		let description: string = "";

		for (const str of mappedData) {
			const primaryBreakReason =
				mappedData.indexOf(str) == mappedData.length - 1;
			const secondaryBreakReason =
				description.length + str.length > MAX_DESCRIPTION_LENGTH;

			if (primaryBreakReason || secondaryBreakReason) {
				if (primaryBreakReason) description += str;
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
				description == "";
				break;
			}
			description += str;
		}

		if (embeds.length > 1)
			embeds = embeds.map((embed, index, arr) =>
				embed.setFooter({ text: `Page ${index + 1}/${arr.length}` })
			);

		return embeds;
	}

	public async PaginateData<T extends SearchFilter>(
		this: DocumentType<Cases>,
		options: PaginationSenderOptions<T>
	) {
		const { interaction, searchFilter, caseType, commandName } = options;

		if (!interaction.guild || !interaction.guildId)
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

		const filterArray = searchFilter as Array<Filter | "all">;
		const isAll = filterArray.includes("all");
		const selection: InputFilters = ["users", "roles", "channels"];

		const keys = isAll
			? selection
			: selection.filter((str) => filterArray.includes(str));

		const data: PaginationData[] = [];
		const matchingCases = this.getMatchingCases(keys, caseType, commandName);

		if (matchingCases.length == 0) return await replyNoData(interaction);

		for (const matchingCase of matchingCases) {
			const snowflakeArr = this.getSnowflakeArr(
				matchingCase,
				caseType,
				commandName
			);
			data.push(...snowflakeArr);
		}

		const mappedData = this.mapDataToMention(data);
		const embeds = this.createEmbeds({
			interaction,
			data,
			mappedData,
			caseType,
			isAll
		});
		if (embeds.length == 1)
			return await replyOrFollowUp(interaction, {
				embeds,
				ephemeral: true
			});

		const buttons = this.createPaginationButtons({
			caseType,
			searchFilter
		});

		const paginationEmbeds = embeds.map((embed) => {
			return {
				embeds: [embed]
			};
		});

		return await new Pagination(
			interaction,
			paginationEmbeds,
			buttons
		).send();
	}

	public static async findByServerId(
		this: ReturnModelType<typeof Cases>,
		serverId: string
	) {
		const cases = await this.findOne().populate({
			path: "server",
			match: { serverId }
		});

		if (cases && isDocument(cases.server)) {
			return cases;
		}

		return null;
	}
}

export const CasesModel = getModelForClass<typeof Cases, QueryHelpers>(Cases);
