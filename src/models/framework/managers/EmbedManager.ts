import { type APIEmbedField, bold } from "discord.js";
import { EmbedBuilder } from "discord.js";

import { StringUtils } from "~/helpers/utils/string.js";

import type { APIEmbed } from "discord.js";

interface BaseField extends Omit<APIEmbedField, "inline"> {}

interface Field extends Pick<APIEmbedField, "name"> {
	value: string | BaseField[];
}

interface IndentFieldOptions {
	bold?: boolean;
	indentLevel?: number;
	seperator?: string;
}

interface MutualField {
	data: APIEmbedField;
	indexPosition: number | "end";
}

export abstract class EmbedManager {
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

	public static formatEmbeds(embeds: Array<EmbedBuilder | APIEmbed>): EmbedBuilder[] {
		const formattedEmbeds = embeds.map((embedLike) => {
			const embed = EmbedBuilder.from(embedLike);

			const { fields: jsonFields } = embed.toJSON();

			if (!jsonFields) {
				return embed;
			}

			const fields = jsonFields.map(({ name, value, inline }) => {
				if (!name.includes(StringUtils.fieldNameSeparator)) {
					name += StringUtils.fieldNameSeparator;
				}

				if (!name.startsWith("**")) {
					name = bold(name);
				}

				return {
					name,
					value,
					inline
				};
			});

			embed.setFields(fields);

			return embed;
		});

		return formattedEmbeds;
	}

	public static indentFieldValues(fields: Field[], options?: IndentFieldOptions): string {
		const indentLevel = options?.indentLevel ?? 1;
		const tab = StringUtils.tabCharacter.repeat(indentLevel);
		const isBold = options?.bold ?? true;

		let seperator = options?.seperator ?? StringUtils.fieldNameSeparator;

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

					return tab + formattedFieldName + StringUtils.lineBreak + subFieldString;
				}
			})
			.join(StringUtils.lineBreak);
	}
}
