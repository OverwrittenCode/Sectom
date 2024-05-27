import { Pagination, PaginationType } from "@discordx/pagination";
import { type APIEmbedField, EmbedBuilder, bold } from "discord.js";
import _ from "lodash";

import { LIGHT_GOLD, MAX_ELEMENTS_PER_PAGE } from "~/constants.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { PaginationInteractions, PaginationOptions } from "@discordx/pagination";
import type { APIEmbed, Message } from "discord.js";

interface BaseField extends Omit<APIEmbedField, "inline"> {}

interface Field extends Pick<APIEmbedField, "name"> {
	value: string | BaseField[];
}

interface IndentFieldOptions {
	indentLevel?: number;
	bold?: boolean;
	seperator?: string;
}

interface MutualField {
	indexPosition: number | "end";
	data: APIEmbedField;
}

interface HandleStaticEmbedPaginationOptions {
	sendTo: PaginationInteractions | Message;
	embedTitle: string;
	descriptionArray: string[];
	config?: PaginationOptions;
	ephemeral?: boolean;
}

export abstract class EmbedManager {
	public static indentFieldValues(fields: Field[], options?: IndentFieldOptions): string {
		const indentLevel = options?.indentLevel ?? 1;
		const tab = StringUtils.TabCharacter.repeat(indentLevel);
		const isBold = options?.bold ?? true;

		let seperator = options?.seperator ?? StringUtils.FieldNameSeparator;
		seperator += " ";

		return fields
			.map((field) => {
				const seperatedFieldName = field.name + seperator;
				const formattedFieldName = isBold ? bold(seperatedFieldName) : seperatedFieldName;

				if (typeof field.value === "string") {
					return tab + formattedFieldName + field.value;
				} else {
					const newOptions = {
						indentLevel: indentLevel * 2,
						bold: isBold,
						seperator: seperator.slice(0, -1)
					};

					const subFields = field.value as Field[];

					const subFieldString: string = this.indentFieldValues(subFields, newOptions);
					return tab + formattedFieldName + StringUtils.LineBreak + subFieldString;
				}
			})
			.join(StringUtils.LineBreak);
	}

	public static addMutualFields(embeds: EmbedBuilder[], mutualFields: MutualField[]): EmbedBuilder[] {
		return embeds.map((embed) => {
			const embedFieldLength = embed.toJSON().fields?.length;

			for (let i = 0; i < mutualFields.length; i++) {
				const { indexPosition, data } = mutualFields[i];
				const index = indexPosition === "end" ? embedFieldLength : indexPosition;

				if (!index) {
					embed.setFields([data]);
				} else {
					embed.spliceFields(index, 0, data);
				}
			}

			return embed;
		});
	}

	public static formatEmbeds(embeds: EmbedBuilder[]): EmbedBuilder[] {
		const formattedEmbeds = embeds.map((embed) => {
			const jsonFields = embed.toJSON().fields;
			if (!jsonFields) {
				return embed;
			}

			const fields = jsonFields.map(({ name, value, inline }) => {
				return {
					name: bold(name + StringUtils.FieldNameSeparator),
					value,
					inline
				};
			});

			embed.setFields(fields);

			return embed;
		});

		return formattedEmbeds;
	}

	public static async handleStaticEmbedPagination(options: HandleStaticEmbedPaginationOptions) {
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

		const pagination = new Pagination(sendTo, paginationPages, {
			ephemeral,
			enableExit: !ephemeral, // mutually exclusive
			type: PaginationType.Button,
			filter: (v) => v.user.id === ("user" in sendTo ? sendTo.user : sendTo.author).id,
			...InteractionUtils.PaginationButtons,
			...config
		});

		return await pagination.send();
	}
}
