import { type APIEmbedField, bold as _bold } from "discord.js";
import { EmbedBuilder } from "discord.js";

import { StringUtils } from "~/helpers/utils/string.js";

import type { APIEmbed } from "discord.js";

interface BaseField extends Omit<APIEmbedField, "inline"> {}

interface Field extends Pick<APIEmbedField, "name"> {
	value: string | BaseField[];
}

interface IndentFieldOptions {
	indentLevel?: number;
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
					name = _bold(name);
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

	public static indentFieldValues(fields: Field[], options: IndentFieldOptions = {}): string {
		const { indentLevel = 1 } = options;

		const tab = StringUtils.tabCharacter.repeat(indentLevel);

		const seperator = StringUtils.fieldNameSeparator + " ";

		return fields
			.map((field) => {
				const seperatedFieldName = field.name + seperator;
				const formattedFieldName = _bold(seperatedFieldName)

				if (typeof field.value === "string") {
					return tab + formattedFieldName + field.value;
				} else {
					const newOptions = {
						indentLevel: indentLevel * 2,
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
