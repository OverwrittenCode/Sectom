import { type APIEmbedField, type EmbedBuilder, bold } from "discord.js";

import { StringUtils } from "~/utils/string.js";

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
}
